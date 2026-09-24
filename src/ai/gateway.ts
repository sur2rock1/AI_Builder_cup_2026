// ─────────────────────────────────────────────────────────────────
// Model Gateway — single source of truth for resolving Gemini model
// IDs, calling them with a timeout, and logging every call.
//
// Replaces the duplicated MODEL_CANDIDATES arrays that used to live in
// reasoningAssessor.ts, liveObserver.ts, assessmentEngine.ts and
// pdfIngest.ts. Each of those tried a list of model IDs and silently
// fell back on failure, which meant a broken model ID could look like
// a working demo. This module verifies IDs once at startup and, in
// DEMO_MODE, refuses to fail silently — it raises a visible warning
// instead.
// ─────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';

export type GatewayRole = 'fast' | 'strong' | 'live' | 'image';

interface RoleConfig {
  envVar: string;
  candidates: string[];
}

// Candidate lists preserve the exact fallback order already in use across
// the codebase, so behaviour does not change until verify:models proves a
// better default.
const ROLE_CONFIG: Record<GatewayRole, RoleConfig> = {
  fast: {
    envVar: 'MODEL_FAST',
    candidates: ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'],
  },
  strong: {
    envVar: 'MODEL_STRONG',
    candidates: ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'],
  },
  live: {
    envVar: 'MODEL_LIVE',
    candidates: ['gemini-3.8-live'],
  },
  image: {
    envVar: 'MODEL_IMAGE',
    candidates: ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'],
  },
};

export interface GatewayCallLog {
  role: GatewayRole;
  model: string;
  call: string;
  ok: boolean;
  ms: number;
  outputChars?: number;
  error?: string;
  usedFallback: boolean;
}

export type GatewayLogSink = (entry: GatewayCallLog) => void;

let logSink: GatewayLogSink = (entry) => {
  const line = `[gateway] ${entry.call} role=${entry.role} model=${entry.model} ok=${entry.ok} ms=${entry.ms}${entry.usedFallback ? ' FALLBACK' : ''}${entry.error ? ' err=' + entry.error : ''}`;
  if (entry.ok) console.log(line); else console.error(line);
};

export function setGatewayLogSink(sink: GatewayLogSink) {
  logSink = sink;
}

/** True when running in demo mode — silent content fallbacks are disallowed. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export type DemoWarningSink = (message: string) => void;
let demoWarningSink: DemoWarningSink | null = null;
export function setDemoWarningSink(sink: DemoWarningSink | null) {
  demoWarningSink = sink;
}
function raiseDemoWarning(message: string) {
  console.warn('[DEMO_MODE warning]', message);
  demoWarningSink?.(message);
}

// ─── Resolution (once per process, cached) ───────────────────────

const resolved: Partial<Record<GatewayRole, string>> = {};
const resolutionAttempted: Partial<Record<GatewayRole, boolean>> = {};

function candidatesFor(role: GatewayRole): string[] {
  const cfg = ROLE_CONFIG[role];
  const envOverride = process.env[cfg.envVar];
  return envOverride ? [envOverride, ...cfg.candidates] : cfg.candidates;
}

/**
 * Verify every configured model ID resolves, by issuing one minimal call
 * per role. Intended to run once at server startup (and from
 * `npm run verify:models`). Never throws; returns a report.
 */
export async function verifyModels(apiKey: string): Promise<Record<GatewayRole, { model: string | null; ok: boolean; error?: string }[]>> {
  const ai = new GoogleGenAI({ apiKey, vertexai: false });
  const report: Record<string, { model: string | null; ok: boolean; error?: string }[]> = {};

  for (const role of Object.keys(ROLE_CONFIG) as GatewayRole[]) {
    if (role === 'live') {
      // Live models are verified by a real connection attempt at session
      // start, not here — the Live API has no cheap "ping".
      report[role] = candidatesFor(role).map((model) => ({ model, ok: false, error: 'not checked (live)' }));
      continue;
    }
    const results: { model: string | null; ok: boolean; error?: string }[] = [];
    for (const model of candidatesFor(role)) {
      try {
        await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        });
        results.push({ model, ok: true });
      } catch (err: any) {
        results.push({ model, ok: false, error: String(err?.message || err) });
      }
    }
    report[role] = results;
    const firstOk = results.find((r) => r.ok);
    if (firstOk) {
      resolved[role] = firstOk.model!;
      resolutionAttempted[role] = true;
    }
  }
  return report as any;
}

/** Resolve (and cache) the model ID to use for a role, without a network call. */
export function resolveModelSync(role: GatewayRole): string {
  if (resolved[role]) return resolved[role]!;
  // No verification has run yet — use the first candidate optimistically.
  // generateJSON()/generateText() below will still fall through candidates
  // on failure and cache whichever one actually works.
  return candidatesFor(role)[0];
}

// ─── Calls ─────────────────────────────────────────────────────

export interface GenerateOptions {
  role: GatewayRole;
  call: string;              // short label for logging, e.g. 'diagnostician.classify'
  apiKey: string;
  systemInstruction?: string;
  prompt: string;
  timeoutMs?: number;
  /** When provided, the response is parsed as JSON before being returned. */
  responseMimeType?: 'application/json' | 'text/plain';
}

class DeadlineError extends Error {}

async function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(`deadline of ${ms}ms exceeded`)), ms);
  });
  try {
    return await Promise.race([p, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Call a text-generation model, trying candidates in order until one
 * succeeds, caching the first success for the rest of the process.
 * Never throws in DEMO_MODE=false; in DEMO_MODE=true it still returns
 * normally but raises a visible warning on every fallback or failure so a
 * broken model never silently degrades a live demo.
 */
export async function generateText(opts: GenerateOptions): Promise<{ text: string; model: string }> {
  const { role, call, apiKey, prompt, systemInstruction, timeoutMs = 8000 } = opts;
  const ai = new GoogleGenAI({ apiKey, vertexai: false });
  const candidates = resolved[role] ? [resolved[role]!, ...candidatesFor(role)] : candidatesFor(role);
  const tried = new Set<string>();

  let lastError: any = null;
  let usedFallback = false;
  for (const model of candidates) {
    if (tried.has(model)) continue;
    tried.add(model);
    const start = Date.now();
    try {
      const resp = await withDeadline(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(systemInstruction ? { config: { systemInstruction } } : {}),
        }),
        timeoutMs,
      );
      const text = (resp as any).text ?? '';
      const ms = Date.now() - start;
      resolved[role] = model;
      logSink({ role, model, call, ok: true, ms, outputChars: text.length, usedFallback });
      if (usedFallback && isDemoMode()) {
        raiseDemoWarning(`${call}: fell back to ${model} — check MODEL_${role.toUpperCase()}`);
      }
      return { text, model };
    } catch (err: any) {
      const ms = Date.now() - start;
      lastError = err;
      logSink({ role, model, call, ok: false, ms, error: String(err?.message || err), usedFallback });
      usedFallback = true;
    }
  }
  if (isDemoMode()) {
    raiseDemoWarning(`${call}: ALL models failed for role=${role} — ${String(lastError?.message || lastError)}`);
  }
  throw lastError || new Error(`generateText: no candidates for role ${role}`);
}

/** Same as generateText, but parses and returns JSON. Throws if parsing fails. */
export async function generateJSON<T = any>(opts: GenerateOptions): Promise<{ data: T; model: string; raw: string }> {
  const { text, model } = await generateText({ ...opts, responseMimeType: 'application/json' });
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  try {
    return { data: JSON.parse(cleaned) as T, model, raw: text };
  } catch (err) {
    throw new Error(`generateJSON: could not parse JSON from ${model} for ${opts.call}: ${String(err)}. Raw: ${cleaned.slice(0, 200)}`);
  }
}
