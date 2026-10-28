// Per-tool "pretty" rendering of a tool call, as a PLAIN DESCRIPTION.
//
// `cardFor` returns a {@link CardSpec} and a component renders it; nothing here imports Svelte, so
// the mapping is unit-testable and the visual language stays in one place. Tools without a spec fall
// back to raw JSON plus the output text, which is what every card looked like before this existed.
//
// The registry lives in `./tool-cards/bundled.ts`. Bundled tools are the ones this app is built
// against, so knowing their payload shapes is not a layering mistake — the alternative, making the
// agent describe its own cards, would be a protocol for something the UI can already read.

import type { AppPage } from './nav'
import { bundledHandlers } from './tool-cards/bundled'
import { bareToolName, type CardCtx, type CardHandler } from './tool-cards/shared'

export type {
  CardBody,
  CardField,
  CardSection,
  CardSpec,
} from './tool-cards/shared'
export { bareToolName } from './tool-cards/shared'

const HANDLERS: CardHandler[] = [...bundledHandlers]

/**
 * Build a card for a tool, or null to fall back to raw JSON.
 *
 * `output` is the result TEXT, which some payloads live in exclusively (a diff, a fetched page);
 * `error` is the call's error text, so a handler can explain a refusal instead of showing an empty
 * success card.
 */
export function cardFor(
  rawTool: string,
  data: Record<string, unknown> | null | undefined,
  input: Record<string, unknown> | null | undefined,
  output = '',
  error = '',
): CardSpec | null {
  const ctx: CardCtx = {
    tool: bareToolName(rawTool),
    data: data ?? {},
    input: input ?? {},
    output,
    error,
  }
  for (const h of HANDLERS) {
    const spec = h(ctx)
    if (spec) return spec
  }
  return null
}

export type { AppPage }
