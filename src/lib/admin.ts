// Admin transport + typed client over `agent.v1.AdminService` (Connect). The
// agent authenticates the static admin token and resolves the caller to
// `role: admin`; `GetIdentity` reports that role so the SPA can render the
// admin console INSTEAD of the chat/settings shell. The caller owns baseUrl +
// token (the same bearer the tenant client uses — the token IS the role).

import { AdminService } from '../gen/agent/v1/agent_pb.js'
import type { Client } from '@connectrpc/connect'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { trimBase } from './agent'

export type AdminClient = Client<typeof AdminService>

/** A tenant row (agent.v1.Tenant). */
export interface Tenant {
  id: string
  name: string
  disabled: boolean
  createdAt: string
  updatedAt: string
  /** Delegation: parent tenant (empty = a platform root). */
  parentId: string
  /** Delegation: the subtree root this tenant belongs to (its own id if root). */
  scopeId: string
}

/** A delegated-admin token row (agent.v1.AdminToken). */
export interface AdminToken {
  tokenId: string
  scopeTenantId: string
  label: string
  createdAt: string
  lastUsedAt: string
  revoked: boolean
}

/** The caller's identity (agent.v1.GetIdentityResponse): role + scope. */
export interface Identity {
  role: 'admin' | 'tenant'
  tenant: string
  /** Admin scope: '*' (platform) or a subtree root id (delegated admin). */
  scope: string
}

/** A tenant token row (agent.v1.TenantToken). */
export interface TenantToken {
  tokenId: string
  tenantId: string
  label: string
  createdAt: string
  lastUsedAt: string
  revoked: boolean
}

function createAdminClient(baseUrl: string, token: string): AdminClient {
  const transport = createConnectTransport({
    baseUrl: trimBase(baseUrl),
    useBinaryFormat: true,
    interceptors: [
      next => async req => {
        if (token) req.header.set('Authorization', `Bearer ${token}`)
        return await next(req)
      },
    ],
  })
  return createClient(AdminService, transport)
}

/** Thin facade over AdminService (tenants + their tokens). */
export class AdminApi {
  private readonly _c: AdminClient
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {
    this._c = createAdminClient(baseUrl, token)
  }

  async listTenants(): Promise<Tenant[]> {
    const r = await this._c.listTenants({})
    return r.tenants.map(t => ({
      id: t.id,
      name: t.name,
      disabled: t.disabled,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      parentId: t.parentId,
      scopeId: t.scopeId,
    }))
  }

  /** Create a tenant. Returns its one-time bootstrap token plaintext. */
  async createTenant(id: string, name: string): Promise<string> {
    const r = await this._c.createTenant({ id, name })
    return r.token
  }

  /**
   * Create a tenant under the caller's scope (delegated admin): the id is
   * SERVER-GENERATED, so only a display name is sent. Returns the plaintext
   * bootstrap token + the generated tenant id.
   */
  async createSubTenant(name: string): Promise<{ id: string; token: string }> {
    const r = await this._c.createTenant({ id: '', name })
    return { id: r.tenant?.id ?? '', token: r.token }
  }

  async updateTenant(
    id: string,
    patch: { name?: string; disabled?: boolean },
  ): Promise<void> {
    await this._c.updateTenant({
      id,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
    })
  }

  /** Soft-disable a tenant (its tokens stop authenticating; data is kept). */
  async deleteTenant(id: string): Promise<void> {
    await this._c.deleteTenant({ id })
  }

  async listTokens(tenantId: string): Promise<TenantToken[]> {
    const r = await this._c.listTenantTokens({ tenantId })
    return r.tokens.map(t => ({
      tokenId: t.tokenId,
      tenantId: t.tenantId,
      label: t.label,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? '',
      revoked: t.revoked,
    }))
  }

  /** Issue a token; returns the one-time plaintext. */
  async issueToken(tenantId: string, label: string): Promise<string> {
    const r = await this._c.issueTenantToken({ tenantId, label })
    return r.plaintext
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this._c.revokeTenantToken({ tokenId })
  }

  /** Rotate: revoke the old token, issue a fresh one. Returns the new plaintext. */
  async rotateToken(tokenId: string): Promise<string> {
    const r = await this._c.rotateTenantToken({ tokenId })
    return r.plaintext
  }

  // ── delegated administrators (re-delegation) ──────────────────────────────

  /** List delegated admin tokens under a scope (a delegated caller: its own). */
  async listAdminTokens(scopeTenantId: string): Promise<AdminToken[]> {
    const r = await this._c.listAdminTokens({ scopeTenantId })
    return r.tokens.map(t => ({
      tokenId: t.tokenId,
      scopeTenantId: t.scopeTenantId,
      label: t.label,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? '',
      revoked: t.revoked,
    }))
  }

  /** Mint a delegated admin token for a subtree. Returns the one-time plaintext. */
  async createAdminToken(scopeTenantId: string, label: string): Promise<string> {
    const r = await this._c.createAdminToken({ scopeTenantId, label })
    return r.plaintext
  }

  async revokeAdminToken(tokenId: string): Promise<void> {
    await this._c.revokeAdminToken({ tokenId })
  }
}
