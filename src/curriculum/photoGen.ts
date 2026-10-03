// ─────────────────────────────────────────────────────────────────
// Lesson photo: lesson-specific, vision-verified, honestly labelled.
//
// The old pipeline asked for "a photorealistic photo of <topic label>" (so every
// maths concept got the same student-at-a-desk stock scene), never looked at what
// came back, and fell back to an Unsplash keyword search that could return anything.
// Now (docs/BOARD_VISUALS.md §Photos, decision D6):
//   1. a scene is planned from THIS concept's key facts (one idea, real-world, no text in the image);
//   2. the image is generated;
//   3. a vision reviewer looks at it: does it show the concept, anything false/garbled?
//   4. only a verified image is stored/served, with the reviewer's neutral caption and an
//      "AI-generated" label. Unverified → no photo (the tab is hidden), never a stock fallback.
// ─────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import { JsonModel } from '../quality/model';
import { reviewPhoto } from '../quality/critic';
import { QualityIssue } from '../quality/types';
import type { VisualConceptContext } from '../visual/prompt';
import { conceptBlock } from '../visual/prompt';

export interface RawImage { mimeType: string; data: string }
export type ImageGenerator = (prompt: string) => Promise<RawImage | null>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const transient = (e: any) => /\b(429|500|502|503|504)\b|overload|too many|resource.?exhausted|rate.?limit|temporarily|unavailable/i.test(String(e?.message ?? e));

/** The production generator: Gemini image models, 16:9, small retry on transient errors. */
export function geminiImageGenerator(apiKey: string): ImageGenerator {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  // Keep in sync with the `image` role in src/ai/gateway.ts.
  const models = process.env.MODEL_IMAGE
    ? [process.env.MODEL_IMAGE, 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']
    : ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'];
  return async (prompt) => {
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r: any = await ai.models.generateContent({
            model, contents: { parts: [{ text: prompt }] },
            config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } } as any,
          });
          for (const p of r?.candidates?.[0]?.content?.parts ?? []) {
            if (p.inlineData?.data) return { mimeType: p.inlineData.mimeType || 'image/png', data: p.inlineData.data };
          }
          break; // model answered without an image — try the next model
        } catch (e: any) {
          if (transient(e) && attempt < 2) { await sleep(4000 * 2 ** attempt); continue; }
          break;
        }
      }
    }
    return null;
  };
}

export interface PhotoPlan { intent: string; prompt: string }

const NO_TEXT = 'Do not put any words, letters, numbers, equations, labels or signs anywhere in the image.';

/** Deterministic fallback plan: the first key fact as the scene, never the bare topic label. */
export function fallbackPhotoPlan(ctx: VisualConceptContext): PhotoPlan {
  const decided = ctx.presentation?.photo?.useful ? ctx.presentation.photo.scene : undefined;
  const fact = decided || ctx.keyFacts[0] || ctx.topic;
  const intent = decided ? `A real-world scene: ${decided}` : `A real-world scene where this is true: ${fact}`;
  return {
    intent,
    prompt: `A clear, realistic educational photograph or illustration for a ${ctx.grade} ${ctx.subjectLabel || ''} lesson on "${ctx.topic}". It shows a real-world situation in which this is visibly true: ${fact}. One clear subject, uncluttered, natural lighting. ${NO_TEXT}`,
  };
}

export async function planPhoto(model: JsonModel, ctx: VisualConceptContext, avoid: string[] = []): Promise<PhotoPlan> {
  const prompt = `You are choosing the ONE real-world image that will sit beside a lesson for a ${ctx.grade} learner.

${conceptBlock(ctx)}

Choose a concrete real-world scene in which ONE key fact above is visible and true — something a child could point at and say "that's it". The scene must be specific to THIS concept (a generic classroom, a student at a desk or a stack of books is not acceptable). The image must contain no text, numbers, equations or labels (image models garble them).${avoid.length ? `\nDo NOT repeat these earlier attempts, which were rejected:\n${avoid.map((a) => '- ' + a).join('\n')}` : ''}

Return ONLY JSON: {"intent":"<one sentence: what the image shows and which key fact it makes visible>","prompt":"<the image-generation prompt: subject, setting, camera/style, everything visible; ends with: ${NO_TEXT}>"}`;
  try {
    const r = await model({ call: 'photo.plan', role: 'fast', prompt, timeoutMs: 30_000 });
    const intent = typeof r.data?.intent === 'string' ? r.data.intent.trim().slice(0, 240) : '';
    let p = typeof r.data?.prompt === 'string' ? r.data.prompt.trim().slice(0, 900) : '';
    if (!intent || !p) return fallbackPhotoPlan(ctx);
    if (!/no (any )?(words|text)/i.test(p)) p += ` ${NO_TEXT}`;
    return { intent, prompt: p };
  } catch {
    return fallbackPhotoPlan(ctx);
  }
}

export interface PhotoOutcome {
  /** data URI of a VERIFIED image, else null. */
  photoUrl: string | null;
  meta: { verified: boolean; caption: string; intent: string; source: 'ai-generated'; reviewedAt: string; issues?: QualityIssue[] } | null;
  attempts: number;
  reviewRan: boolean;
  error?: string;
}

export async function generateVerifiedPhoto(
  ctx: VisualConceptContext,
  opts: { model: JsonModel; imageGen: ImageGenerator; maxAttempts?: number; /** Build the image prompt from the key fact in code (no planning call). */ deterministicPlan?: boolean },
): Promise<PhotoOutcome> {
  const max = Math.max(1, opts.maxAttempts ?? 2);
  const rejected: string[] = [];
  let last: PhotoOutcome = { photoUrl: null, meta: null, attempts: 0, reviewRan: false, error: 'no image generated' };
  for (let attempt = 1; attempt <= max; attempt++) {
    const plan = opts.deterministicPlan ? fallbackPhotoPlan(ctx) : await planPhoto(opts.model, ctx, rejected);
    let img: RawImage | null = null;
    try { img = await opts.imageGen(plan.prompt); } catch (e: any) { last = { ...last, attempts: attempt, error: String(e?.message || e) }; continue; }
    if (!img) { last = { ...last, attempts: attempt, error: 'the image model returned no image' }; continue; }
    const review = await reviewPhoto(opts.model, ctx, plan.intent, img);
    if (!review.ran) {
      // Never ship an image nobody has looked at.
      return { photoUrl: null, meta: null, attempts: attempt, reviewRan: false, error: `photo review unavailable: ${review.error}` };
    }
    const meta = { verified: review.ok, caption: review.caption, intent: plan.intent, source: 'ai-generated' as const, reviewedAt: new Date().toISOString(), issues: review.issues.length ? review.issues : undefined };
    if (review.ok) return { photoUrl: `data:${img.mimeType};base64,${img.data}`, meta, attempts: attempt, reviewRan: true };
    rejected.push(`${plan.intent} — rejected: ${review.issues.map((i) => i.message).join('; ').slice(0, 160)}`);
    last = { photoUrl: null, meta, attempts: attempt, reviewRan: true, error: 'the reviewer rejected the image' };
  }
  return last;
}
