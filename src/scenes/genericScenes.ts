// ─────────────────────────────────────────────────────────────────
// Generic scene registry.
//
// Re-exports the SceneDef types and provides a subject-agnostic
// getScene() that returns null when no scene matches, rather than
// falling back to a hardcoded Pythagoras scene.
//
// Any subject-specific scene files can register their scenes here.
// ─────────────────────────────────────────────────────────────────

export type { SceneVertices, SceneDef } from './pythagorasScenes';
import { PYTHAGORAS_SCENES } from './pythagorasScenes';
import type { SceneDef } from './pythagorasScenes';

/** All registered scenes across all subjects. */
const ALL_SCENES: SceneDef[] = [
  ...PYTHAGORAS_SCENES,
  // Add scenes for other subjects here as they are created.
];

/**
 * Look up a scene by id.
 * Returns null when the id is not found — no Pythagoras default.
 * ImmersiveStage renders a neutral lit silhouette when scene is null.
 */
export function getScene(id?: string | null): SceneDef | null {
  if (!id) return null;
  return ALL_SCENES.find(s => s.id === id) ?? null;
}
