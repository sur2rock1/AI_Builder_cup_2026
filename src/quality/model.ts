// The one seam between the quality layer and a model. Production uses the
// gateway (logged, timed, model-fallback); tests inject a scripted fake so the
// repair loops run offline (tests/smoke/lesson-gen.mjs).
import { generateJSON, GatewayRole } from '../ai/gateway';

export interface ModelCall {
  call: string;
  role: GatewayRole;
  prompt: string;
  timeoutMs?: number;
  /** Extra content parts sent before the prompt (e.g. an inline image for photo review). */
  parts?: unknown[];
}
export type JsonModel = (c: ModelCall) => Promise<{ data: any; model: string }>;

export function gatewayModel(apiKey: string, transientRetries = 0, defaultTimeoutMs = 60_000): JsonModel {
  return async (c) => {
    const r = await generateJSON({
      role: c.role, call: c.call, apiKey, prompt: c.prompt, parts: c.parts,
      timeoutMs: c.timeoutMs ?? defaultTimeoutMs, transientRetries,
    });
    return { data: r.data, model: r.model };
  };
}
