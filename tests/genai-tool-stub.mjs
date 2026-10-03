// Fake @google/genai for T08's offline logic test
// (tests/smoke/tutor-turn-offline.mjs). Sibling to tests/genai-stub.mjs
// (which stubs the assessor's own retry/deadline scenarios in isolation) —
// this one additionally stubs the CONVERSATIONAL call server/routes/tutor.ts
// makes (with tool declarations, an array of Content turns), distinguishing
// it from reasoningAssessor.ts's diagnostic call (responseMimeType:
// 'application/json', a single string prompt) by inspecting the request,
// the same way the real Gemini endpoint is a single API serving both.
//
// Controlled via globalThis.STUB = { conversationQueue: [], diagnosisQueue: [], calls: [] }.
// Each queue is consumed FIFO, one entry per matching generateContent call;
// calling past the end of a queue throws loudly rather than silently
// returning something misleading.
export class GoogleGenAI {
  constructor(_opts) {}
  models = {
    generateContent: async (req) => {
      const S = globalThis.STUB;
      if (!S) throw new Error('genai-tool-stub: globalThis.STUB was not set before a generateContent call');
      const isDiagnostician = req.config?.responseMimeType === 'application/json';
      S.calls.push({ isDiagnostician, model: req.model });

      if (isDiagnostician) {
        const step = S.diagnosisQueue.shift();
        if (!step) throw new Error('genai-tool-stub: diagnosisQueue exhausted — scripted fewer diagnostician calls than the test triggered');
        if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
        if (step.throwError) throw new Error(step.throwError);
        return { text: JSON.stringify(step.json) };
      }

      const step = S.conversationQueue.shift();
      if (!step) throw new Error('genai-tool-stub: conversationQueue exhausted — scripted fewer conversational calls than the test triggered');
      if (step.throwError) throw new Error(step.throwError);

      if (step.functionCalls && step.functionCalls.length) {
        const parts = [];
        if (step.leadText) parts.push({ text: step.leadText });
        for (const fc of step.functionCalls) {
          parts.push({ functionCall: { id: fc.id || fc.name, name: fc.name, args: fc.args || {} } });
        }
        return {
          text: undefined,
          functionCalls: step.functionCalls.map((fc) => ({ id: fc.id || fc.name, name: fc.name, args: fc.args || {} })),
          candidates: [{ content: { role: 'model', parts } }],
        };
      }

      const text = step.text ?? '';
      return {
        text,
        functionCalls: undefined,
        candidates: [{ content: { role: 'model', parts: [{ text }] } }],
      };
    },
  };
}

export function createPartFromFunctionResponse(id, name, response) {
  return { functionResponse: { id, name, response } };
}

// liveConfig.ts imports these for ALL_TOOLS' schema and vadConfig() — never
// actually called from the request path this test exercises, but the module
// must import cleanly.
export const Type = {
  OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER',
};
export const EndSensitivity = { END_SENSITIVITY_HIGH: 'END_SENSITIVITY_HIGH', END_SENSITIVITY_LOW: 'END_SENSITIVITY_LOW' };
export const StartSensitivity = { START_SENSITIVITY_HIGH: 'START_SENSITIVITY_HIGH', START_SENSITIVITY_LOW: 'START_SENSITIVITY_LOW' };
export const Modality = { AUDIO: 'AUDIO', TEXT: 'TEXT', IMAGE: 'IMAGE' };
