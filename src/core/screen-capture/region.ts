import type { NativeScreenRegion } from 'flick-native';

export type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Validates an untrusted renderer payload and clips it to its source display. */
export function normalizeCaptureRegion(
  value: unknown,
  bounds: DisplayBounds
): NativeScreenRegion | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height)
  ) {
    return null;
  }

  const left = Math.max(bounds.x, Math.round(candidate.x));
  const top = Math.max(bounds.y, Math.round(candidate.y));
  const right = Math.min(
    bounds.x + bounds.width,
    Math.round(candidate.x + candidate.width)
  );
  const bottom = Math.min(
    bounds.y + bounds.height,
    Math.round(candidate.y + candidate.height)
  );
  const width = right - left;
  const height = bottom - top;
  return width >= 2 && height >= 2 ? { x: left, y: top, width, height } : null;
}
