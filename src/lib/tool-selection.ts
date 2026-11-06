import type { ToolInfo } from './models'

/**
 * The LLM/AI-tool charset: the agent derives the AI-tool key via
 * `toolQualifiedName` = `name.replace(/[^A-Za-z0-9_-]/g, '-')` (the gateway's
 * `tools.N.function.name` charset is `[A-Za-z0-9_-]`). A bare whitelist entry
 * MUST use this sanitized form or the agent will not match it.
 */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '-')
}

/**
 * The value a preset whitelist stores for a tool.
 *
 * - A tool whose bare name is UNIQUE across extensions is addressed by that
 *   SANITIZED bare name (the agent's `toolQualifiedName`).
 * - A tool whose bare name COLLIDES (two extensions expose the same name) is
 *   addressed as `<extId>.<name>`. `extId` and `name` never contain a dot, so
 *   the qualified form is unambiguous and selects exactly ONE extension's tool
 *   (the agent's whitelist matching accepts both forms).
 */
export function toolValue(all: readonly ToolInfo[], t: ToolInfo): string {
  return isColliding(all, t.name) ? `${t.category}.${t.name}` : sanitizeToolName(t.name)
}

/** Whether a bare tool name is provided by more than one extension. */
export function isColliding(all: readonly ToolInfo[], name: string): boolean {
  let n = 0
  for (const t of all) if (t.name === name) n++
  return n > 1
}

export interface ToolGroup {
  /** The owning extension id (`ToolInfo.category` IS the extension id). */
  extId: string
  tools: ToolInfo[]
}

/** Group tools by owning extension, both lists sorted for stable rendering. */
export function groupByExtension(tools: readonly ToolInfo[]): ToolGroup[] {
  const m = new Map<string, ToolInfo[]>()
  for (const t of tools) {
    const k = t.category || 'other'
    const arr = m.get(k)
    if (arr !== undefined) arr.push(t)
    else m.set(k, [t])
  }
  return [...m.entries()]
    .map(([extId, list]) => ({
      extId,
      tools: [...list].sort((a, b) => (a.name < b.name ? -1 : 1)),
    }))
    .sort((a, b) => (a.extId < b.extId ? -1 : 1))
}

/**
 * Canonicalize a stored preset whitelist into picker values, so an entry that
 * predates the collision-aware form still highlights the right tool:
 *   - an entry that is already a current value stays as-is;
 *   - `<extId>.<name>` (raw, from a collision) resolves to its current value;
 *   - a bare name that resolves to exactly one tool resolves to its value;
 *   - an entry that matches nothing is kept verbatim (never silently dropped).
 *
 * It does NOT use `includes('.')` to detect "already qualified": a tool name
 * may itself contain a `.` (e.g. `model.image`), which would be misread as
 * `<extId>.<name>`. Matching is always against the REAL tool list.
 */
export function canonicalizeSelection(
  all: readonly ToolInfo[],
  entries: readonly string[],
): Set<string> {
  const values = new Set(all.map(t => toolValue(all, t)))
  const out = new Set<string>()
  for (const e of entries) {
    const raw = e.trim()
    if (raw === '') continue
    // Already a current value (bare-sanitized or qualified)?
    if (values.has(raw)) {
      out.add(raw)
      continue
    }
    // A qualified `<extId>.<name>` entry (raw name)?
    const qualified = all.find(t => `${t.category}.${t.name}` === raw)
    if (qualified !== undefined) {
      out.add(toolValue(all, qualified))
      continue
    }
    // A bare name that resolves to exactly one tool?
    const bare = all.filter(t => t.name === raw)
    if (bare.length === 1) {
      out.add(toolValue(all, bare[0]!))
      continue
    }
    // Unknown — keep verbatim so re-saving does not drop it.
    out.add(raw)
  }
  return out
}

/**
 * Why a tool cannot be switched on, or null when it can.
 *
 * THREE STATES, NOT TWO. "Required config is unmet" and "we cannot know whether it is met" are
 * different, and collapsing them loses data:
 *
 *   · UNMET (we have the config surface and a required knob is blank) — the tool would refuse at call
 *     time, so the picker greys it out.
 *   · UNKNOWN (no config has been fetched yet, or the fetch failed) — the picker must NOT grey
 *     anything out. It does not know, and a tool it wrongly bans disappears from a preset that was
 *     working. An empty `config` map is this state, not "every knob is blank".
 *
 * The difference is observable: UNKNOWN is `config === undefined` (the caller never asked), while an
 * empty object means the caller asked and the deployment has no config at all.
 */
export type IneligibleReason = 'config-unmet' | null

export function toolIneligible(
  tool: Pick<ToolInfo, 'name' | 'requiredConfig'>,
  config: Record<string, unknown> | undefined,
): IneligibleReason {
  if (tool.requiredConfig.length === 0) return null
  // NO ANSWER IS NOT A "NO". Without a config surface we cannot judge, so the tool stays usable.
  if (config === undefined) return null
  const vals = config[tool.name]
  const knobs =
    vals && typeof vals === 'object' && !Array.isArray(vals)
      ? (vals as Record<string, unknown>)
      : {}
  const unmet = tool.requiredConfig.some(name => {
    const v = knobs[name]
    return v == null || String(v) === ''
  })
  return unmet ? 'config-unmet' : null
}

/**
 * Which selected entries a config change has DISQUALIFIED.
 *
 * RETURNS THE OFFENDERS RATHER THAN A PRUNED SET, so the caller decides what to do with them. The
 * subtlety is the one that lost data: `config === undefined` means "not loaded", and pruning on that
 * basis deletes every configured tool from a preset the user never touched. Only a REAL, fetched
 * config can disqualify anything.
 *
 * AN ENTRY THAT MATCHES NO TOOL IS NEVER AN OFFENDER. `canonicalizeSelection` keeps unknown entries
 * verbatim so re-saving does not drop them; pruning them here would undo that in the same breath.
 */
export function disqualifiedByConfig(
  all: readonly ToolInfo[],
  selected: ReadonlySet<string>,
  config: Record<string, unknown> | undefined,
): string[] {
  if (config === undefined) return []
  const out: string[] = []
  for (const t of all) {
    const value = toolValue(all, t)
    if (!selected.has(value)) continue
    if (toolIneligible(t, config) !== null) out.push(value)
  }
  return out
}
