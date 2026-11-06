// Shared provider helpers.
/**
 * The modalities the console offers, in section order.
 *
 * THREE ARE MISSING ON PURPOSE: embedding, rerank and realtime. Nothing in this console calls them —
 * a chat turn is text, an attachment is read by a vision model, a card renders an image, an output
 * pane plays speech — so a section for them would be a picker whose models are never selectable. The
 * PROTOCOL still accepts them (the gateway serves them); this is a decision about what to show.
 */
export const MODEL_CAPABILITIES = ['text', 'image', 'video', 'speech', 'transcription'] as const

/** The api types that can serve a modality (from the server catalog). */
export function apiTypesForCapability(
  catalog: Record<string, string[]>,
  capability: string,
): string[] {
  const out = Object.entries(catalog)
    .filter(([, caps]) => caps.includes(capability))
    .map(([t]) => t)
    .sort()
  return out.length ? out : ['v4-gateway']
}

/** Localized capability label key. */
export function capabilityLabelKey(capability: string): string {
  switch (capability) {
    case 'image':
      return 'capImage'
    case 'video':
      return 'capVideo'
    case 'speech':
      return 'capSpeech'
    case 'transcription':
      return 'capTranscription'
    default:
      return 'capText'
  }
}

export function apiTypeLabelKey(apiType: string): string {
  switch (apiType) {
    // ONE PROTOCOL. The other branches that used to be here (openai-compatible, openai, anthropic,
    // gemini, deepseek, cohere) described wire formats this agent cannot speak and the server now
    // rejects — a label for them was a menu entry for something that would fail on first call.
    case 'v4-gateway':
    case 'vercel-compatible-gateway':
      return 'apiTypeGateway'
    default:
      return ''
  }
}
