export type BoardSurface = 'photo' | 'diagram' | 'model' | 'chalk' | 'video';

export function boardPackFor(topic: string, extra = ''): BoardSurface[] {
  const t = `${topic} ${extra}`.toLowerCase();
  if (/triangle|pythagoras|hypotenuse|geometry|right.?angle|theorem|leg\b/.test(t)) {
    return ['photo', 'diagram', 'model', 'chalk'];
  }
  return ['photo', 'diagram', 'video', 'chalk'];
}

export function isGeometryPack(surfaces: BoardSurface[]): boolean {
  return surfaces.includes('model');
}
