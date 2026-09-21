// Fake @google/genai: behaviour controlled by globalThis.STUB
export class GoogleGenAI {
  constructor() {
    this.models = { generateContent: async (req) => {
      const S = globalThis.STUB; S.calls.push({ model: req.model, thinking: !!req.config?.thinkingConfig });
      const rule = S.models[req.model];
      if (!rule) throw new Error(`models/${req.model} is not found`);
      if (rule.rejectThinking && req.config?.thinkingConfig) throw new Error('thinking_level is not supported for this model');
      await new Promise(r => setTimeout(r, rule.delay));
      return { text: JSON.stringify({ classification: 'misconception_behind_correct', understandingDepth: 'memorised',
        candidateMisconceptionIds: ['finding-hypotenuse::m1', 'bogus::id'], confidence: 'high',
        reasoningSummary: 'added the sides', shouldProbe: true, probeQuestion: 'What does your method give for 6 and 8?',
        nextStrategy: 'worked_example', tutorGuidance: 'Ask the probe.' }) };
    } };
  }
}
export const Modality = { AUDIO: 'AUDIO', IMAGE: 'IMAGE', TEXT: 'TEXT' };
