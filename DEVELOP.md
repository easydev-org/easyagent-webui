# Developing easyagent-webui

Developer notes for the Svelte 5 (runes) SPA. For what the app is and how to
run/deploy it, see `README.md`.

## Commands

```bash
npm install            # deps; the SDK come from the in-cluster artifact registry
npm run dev            # vite dev server
npm run test           # vitest (unit tests under src/lib/*.test.ts)
npm run check          # biome check . (lint + format) — the gate
npm run check:svelte   # svelte-check --tsconfig ./tsconfig.json
npm run check:types    # tsc --noEmit
npm run build          # vite build -> dist/
```

## Dependencies: agent.v1 (locally generated)

Types + the `AgentService` client come from the locally generated
`src/gen/agent/v1/agent_pb.ts` (generated from `proto/agent/v1/agent.proto` via
buf). There is no external SDK dependency: the wire types are generated
locally, and all other dependencies resolve from the public npm registry
(`.npmrc` carries no private scope).

To refresh the generated file, regenerate it from the `agent` repo (`proto/agent/v1/agent.proto`) (buf) — do NOT
edit `src/gen/agent/v1/agent_pb.ts` by hand.

## Staying in sync with the `agent` repo (`proto/agent/v1/agent.proto`) (the agent contract)

the `agent` repo (`proto/agent/v1/agent.proto`) is the source of truth for `agent.v1`; `src/gen/agent/v1/agent_pb.ts`
is generated from it. When the proto changes, regenerate the local `agent_pb.ts`
and update the hand-written code:
the `agent` repo (`proto/agent/v1/agent.proto`) is the source of truth for `agent.v1`; the SDK is regenerated from
it and released as a tag (e.g. `v0.30.0`). When the proto changes, bump the SDK
here and update the hand-written code:

- **Token fields (proto #4).** `Session.input_tokens/output_tokens/total_tokens`
  (7/8/9) were **removed**; only the single-step `last_input_tokens` /
  `last_output_tokens` (10/11) remain. A "total" is `lastInputTokens +
  lastOutputTokens` (see `Chat.svelte`'s context label). Nothing reads the
  cumulative counters any more.
- **`WatchSession` resume anchors (proto #2/#3).** `WatchSessionRequest` carries
  `since_seq` (int64, the newest `WatchSessionResponse.seq` the client saw) and
  `since_msg` (message-id fallback). Resume rules — see `session-stream.ts`:

  | case | `sinceSeq` | `sinceMsg` |
  | --- | --- | --- |
  | page refresh / new instance (`lastSeq === 0`) | `0` | `MessageSync.syncedTipId` |
  | same-page reconnect (seq in memory) | `lastSeq` (resume **after** it) | `''` |
  | switch to a different session | `0` | tip of the new session |

  The sequence anchor is **in-memory only** (`SessionStream.lastSeq`,
  deliberately NOT persisted): a non-zero `since_seq` makes the server skip the
  turn still RUNNING, and a refresh has no local in-progress state, so resuming
  "after the last seq" would drop the running step's early structural events
  (reasoning-start/delta, tool-input-*). `since_seq` WINS when both are set.
  `SessionStream.handleEvent` advances `lastSeq` from `StreamEvent.seq`, and a
  non-zero `sinceSeq` is why a refresh **must** pass `sinceMsg` to rebuild the
  in-progress bubble (thinking + tool cards).
  `session-stream.test.ts` locks this behaviour down.

## Testing

When changing the stream transport (`session-stream.ts`, `api.ts`'s
`streamEvents`, `events.ts`), keep `session-stream.test.ts` (resume anchors) and
`messages.test.ts` (the controller state machine over a scripted fake AgentApi)
green. The fake `streamEvents` signature must mirror the real one:
`(sid, sinceSeq, signal, sinceMsg)`.

## Local sqlite store: NO message mirror

`db.ts` / `local-store.ts` (sqlite-wasm over OPFS, in a worker) persist only
what is genuinely device-local: the **session list**, **drafts** and **read
watermarks**. The message CHAIN is **not** mirrored. Reasons:

- Switching sessions always needs the network anyway — `Chat.svelte` rebuilds
  and `init()`s a fresh `MessagesController` per session, so a baseline fetch
  happens regardless; a mirror would only save the first frame.
- A mirror is a SECOND source of truth: it forces hydrate + cache-consistency
  checks + a per-page DELETE+reinsert, all for no offline win.

So `MessageSync` keeps the tip anchor in memory and `MessageStore` holds the
window in memory; `LocalStore` exposes no `loadMessages`/`persistMessages`.
`local-store.ts`'s `migrate()` **drops** legacy `local_messages` /
`local_sync_state` tables (`DROP TABLE IF EXISTS`) so an upgraded install sheds
stale rows. The message-chain JSON codecs (`partToJson`, `messagePartToJson`,
`chatPartFromJson`, `toolState*`) were removed with the mirror; only the draft
attachment codec (`fileToJson`/`fileFromJson`) remains.

The Flutter / Compose / SwiftUI clients carry the same local mirror and must be
slimmed the same way (drop the message tables + their read/write paths).

## Component mount tests (required for `.svelte` changes)

**Every new or changed `.svelte` component SHOULD get a mount smoke test.** The
static gates (`biome`, `tsc`, `svelte-check`) and the pure-TS unit tests CANNOT
catch a crash that only happens when a component MOUNTS. Real example: a Svelte
5 `$effect` that READS and WRITES the same `$state` loops forever
(`effect_update_depth_exceeded`) — it passed every gate and only blew up when the
picker actually rendered. Mount the component for real:

```ts
import { mount, unmount } from 'svelte'
const app = mount(ToolPicker, { target: document.body, props: { tools, selected } })
expect(document.body.textContent).toContain('todo-write')
unmount(app)
```

`vitest.config.ts` provides the environment (jsdom). **`resolve.conditions:
['browser']` is REQUIRED** — without it Svelte resolves to its SERVER build and
`mount()` throws `mount(...) is not available on the server`. When adding a
component test, keep the jsdom `environment` and the `$lib` alias in sync with
`vite.config.ts`.

## `sandbox-submit-mr` and large directories (silent truncation → phantom deletes)

`sandbox-submit-mr` reads the sandbox repo dir through the worker's `FileList`,
which is **capped at 10000 entries** (worker `internal/filesvc` `List`, the
`limit > 10000` clamp). The cap is **truncated and dropped — no signal**:
`FileListResponse` carries only `is_dir` + `files`, and the worker's `FileList`
handler discards the service's `truncated` flag. The extension then diffs the
(truncated) listing against `base`, so **every base file not seen in the listing
is submitted as a DELETE** — a large tree can therefore ship a spurious mass
deletion, and it is **not** a function of file depth.

Guard against it:

- keep `node_modules` / `dist` OUT of the workspace (they also blow up the diff);
- if the tree may exceed ~10k entries, keep the repo dir small (submit a subtree,
  or split the change);
- after submitting, compare the MR's file set against `base` and confirm nothing
  you did not touch is missing;
- `git init` the workspace root and commit is a workaround for a *different*
  issue (making the submit honor `.gitignore`/tracking); keep `.git` **outside**
  the repository directory or submit fails with `invalid path component: ".git"`.

## `package-lock.json` registry (artifact vs. npmjs)

`.npmrc` is **scope-only** (`n/a so only
`the SDK` resolves from the in-cluster **artifact** mirror; every OTHER
dependency resolves from the default registry (npmjs). When (re)generating the
lock, make sure a stray **global** npmrc does not redirect the default registry:
the lock's `resolved` URLs should be `registry.npmjs.org` for non-scoped
packages and `artifact.worker.svc.cluster.local` **only** for `the SDK`. A
quick check:

```sh
grep -oE '"resolved": "https?://[^/]+' package-lock.json | sort | uniq -c
```
