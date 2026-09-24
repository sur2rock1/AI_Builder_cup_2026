// docs/TUTOR_PERSONA.md §12.3 — channel-specific constraints.
export type Channel = 'voice' | 'text';

export function renderChannelSurface(channel: Channel): string {
  if (channel === 'voice') {
    return [
      'CHANNEL: Voice.',
      '  Every tool call pauses your speech until it returns — batch board calls BETWEEN spoken chunks, never mid-sentence.',
      '  Never read the board aloud. Never narrate the board ("as you can see on screen").',
      '  Wait time: after a question, stay silent; a learner needs several seconds to think.',
      '  One idea per turn. No spoken lists.',
    ].join('\n');
  }
  return [
    'CHANNEL: Text.',
    '  Short messages; one question per message.',
    '  Board content, when relevant, goes in a clearly labelled inline block.',
    '  Confidence is offered as three explicit choices (unsure / fairly sure / sure), not inferred from wording alone.',
  ].join('\n');
}
