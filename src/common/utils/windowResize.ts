export interface ResizeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Keep the launcher's current height while preserving the horizontal part of
 * a native resize gesture. Returning null means the gesture did not attempt to
 * change height and can be handled by the window manager unchanged.
 */
export function boundsWithLockedHeight(
  current: ResizeBounds,
  proposed: ResizeBounds
): ResizeBounds | null {
  if (proposed.height === current.height) return null;
  return {
    x: proposed.x,
    y: current.y,
    width: proposed.width,
    height: current.height,
  };
}
