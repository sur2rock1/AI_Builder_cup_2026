import { GoogleGenAI } from '@google/genai';

/** AI Studio / Gemini Developer API. Never Vertex — GOOGLE_CLOUD_PROJECT would 403 the key. */
export function studioAi(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}
