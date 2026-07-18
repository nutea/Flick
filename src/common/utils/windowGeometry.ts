export interface WindowPoint {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowRect extends WindowPoint, WindowSize {}

export interface RelativeWindowPosition {
  x: number;
  y: number;
}

/** A top-left preference relative to the work area, independent of window size. */
export type RelativeWindowAnchor = RelativeWindowPosition;

export interface WindowPlacementOptions {
  margin?: number;
}

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const positive = (value: number, fallback = 1) =>
  Math.max(1, Math.round(finite(value, fallback)));

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const normalizeMargin = (margin: number | undefined, workArea: WindowRect) =>
  clamp(
    Math.round(finite(margin ?? 8)),
    0,
    Math.floor(Math.min(workArea.width, workArea.height) / 2)
  );

/**
 * Constrains a transient window entirely to a display work area. Electron's
 * `screen` and BrowserWindow bounds both use DIP coordinates, so no scale-factor
 * conversion belongs in this layer.
 */
export function clampRectToWorkArea(
  rect: WindowRect,
  workArea: WindowRect,
  options: WindowPlacementOptions = {}
): WindowRect {
  const margin = normalizeMargin(options.margin, workArea);
  const availableWidth = Math.max(1, Math.round(workArea.width) - margin * 2);
  const availableHeight = Math.max(1, Math.round(workArea.height) - margin * 2);
  const width = Math.min(positive(rect.width), availableWidth);
  const height = Math.min(positive(rect.height), availableHeight);
  const minX = Math.round(workArea.x) + margin;
  const minY = Math.round(workArea.y) + margin;
  return {
    x: Math.round(
      clamp(finite(rect.x, minX), minX, minX + availableWidth - width)
    ),
    y: Math.round(
      clamp(finite(rect.y, minY), minY, minY + availableHeight - height)
    ),
    width,
    height,
  };
}

export function defaultLauncherBounds(
  workArea: WindowRect,
  size: WindowSize,
  options: WindowPlacementOptions & { verticalRatio?: number } = {}
): WindowRect {
  const verticalRatio = clamp(finite(options.verticalRatio ?? 1 / 3), 0, 1);
  return clampRectToWorkArea(
    {
      x: workArea.x + (workArea.width - size.width) / 2,
      y: workArea.y + workArea.height * verticalRatio - size.height / 2,
      ...size,
    },
    workArea,
    options
  );
}

export function relativePositionForBounds(
  bounds: WindowRect,
  workArea: WindowRect,
  options: WindowPlacementOptions = {}
): RelativeWindowPosition {
  const constrained = clampRectToWorkArea(bounds, workArea, options);
  const margin = normalizeMargin(options.margin, workArea);
  const travelX = Math.max(0, workArea.width - margin * 2 - constrained.width);
  const travelY = Math.max(
    0,
    workArea.height - margin * 2 - constrained.height
  );
  return {
    x: travelX ? (constrained.x - workArea.x - margin) / travelX : 0.5,
    y: travelY ? (constrained.y - workArea.y - margin) / travelY : 0.5,
  };
}

export function boundsFromRelativePosition(
  position: RelativeWindowPosition,
  workArea: WindowRect,
  size: WindowSize,
  options: WindowPlacementOptions = {}
): WindowRect {
  const margin = normalizeMargin(options.margin, workArea);
  const width = Math.min(
    positive(size.width),
    Math.max(1, workArea.width - margin * 2)
  );
  const height = Math.min(
    positive(size.height),
    Math.max(1, workArea.height - margin * 2)
  );
  const travelX = Math.max(0, workArea.width - margin * 2 - width);
  const travelY = Math.max(0, workArea.height - margin * 2 - height);
  return clampRectToWorkArea(
    {
      x: workArea.x + margin + travelX * clamp(finite(position.x, 0.5), 0, 1),
      y: workArea.y + margin + travelY * clamp(finite(position.y, 0.5), 0, 1),
      width,
      height,
    },
    workArea,
    options
  );
}

export function relativeAnchorForPoint(
  point: WindowPoint,
  workArea: WindowRect,
  options: WindowPlacementOptions = {}
): RelativeWindowAnchor {
  const margin = normalizeMargin(options.margin, workArea);
  const spanX = Math.max(1, workArea.width - margin * 2);
  const spanY = Math.max(1, workArea.height - margin * 2);
  return {
    x: clamp((finite(point.x) - workArea.x - margin) / spanX, 0, 1),
    y: clamp((finite(point.y) - workArea.y - margin) / spanY, 0, 1),
  };
}

export function boundsFromRelativeAnchor(
  anchor: RelativeWindowAnchor,
  workArea: WindowRect,
  size: WindowSize,
  options: WindowPlacementOptions = {}
): WindowRect {
  const margin = normalizeMargin(options.margin, workArea);
  const spanX = Math.max(1, workArea.width - margin * 2);
  const spanY = Math.max(1, workArea.height - margin * 2);
  return clampRectToWorkArea(
    {
      x: workArea.x + margin + spanX * clamp(finite(anchor.x, 0.5), 0, 1),
      y: workArea.y + margin + spanY * clamp(finite(anchor.y, 1 / 3), 0, 1),
      ...size,
    },
    workArea,
    options
  );
}

export function pointFromRelativeAnchor(
  anchor: RelativeWindowAnchor,
  workArea: WindowRect,
  options: WindowPlacementOptions = {}
): WindowPoint {
  const margin = normalizeMargin(options.margin, workArea);
  const spanX = Math.max(1, workArea.width - margin * 2);
  const spanY = Math.max(1, workArea.height - margin * 2);
  return {
    x: Math.round(
      workArea.x + margin + spanX * clamp(finite(anchor.x, 0.5), 0, 1)
    ),
    y: Math.round(
      workArea.y + margin + spanY * clamp(finite(anchor.y, 1 / 3), 0, 1)
    ),
  };
}

/**
 * Launcher resize policy: preserve the top-left anchor and consume only the
 * work-area space below it. Overflow belongs to the renderer's scroll area,
 * never to a window-position correction.
 */
export function fitRectBelowPoint(
  anchor: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  options: WindowPlacementOptions & { minHeight?: number } = {}
): WindowRect {
  const margin = normalizeMargin(options.margin, workArea);
  const availableWidth = Math.max(1, workArea.width - margin * 2);
  const width = Math.min(positive(size.width), availableWidth);
  const minHeight = Math.min(
    positive(options.minHeight ?? 1),
    Math.max(1, workArea.height - margin * 2)
  );
  const minX = workArea.x + margin;
  const maxX = workArea.x + workArea.width - margin - width;
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - margin - minHeight;
  const x = Math.round(clamp(finite(anchor.x, minX), minX, maxX));
  const y = Math.round(clamp(finite(anchor.y, minY), minY, maxY));
  const availableHeight = Math.max(
    minHeight,
    workArea.y + workArea.height - margin - y
  );
  return {
    x,
    y,
    width,
    height: Math.min(positive(size.height), availableHeight),
  };
}

/**
 * Builds one atomic native-window update. Actual bounds are used only to decide
 * whether a write is needed; the payload always uses the canonical desired
 * bounds. Feeding a platform-rounded actual origin back into the next request
 * would accumulate a one-DIP drift on every resize at fractional scale factors.
 */
export function rectForAtomicUpdate(
  actual: WindowRect,
  desired: WindowRect,
  tolerance = 0
): WindowRect | undefined {
  const allowedDifference = Math.max(0, finite(tolerance));
  const next = {
    x: Math.round(desired.x),
    y: Math.round(desired.y),
    width: positive(desired.width),
    height: positive(desired.height),
  };
  return Math.abs(next.x - actual.x) <= allowedDifference &&
    Math.abs(next.y - actual.y) <= allowedDifference &&
    Math.abs(next.width - actual.width) <= allowedDifference &&
    Math.abs(next.height - actual.height) <= allowedDifference
    ? undefined
    : next;
}

export function placePopoverNearPoint(
  anchor: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  options: WindowPlacementOptions & { gap?: number } = {}
): WindowRect {
  const margin = normalizeMargin(options.margin, workArea);
  const gap = Math.max(0, Math.round(finite(options.gap ?? 12)));
  const constrainedSize = clampRectToWorkArea(
    { x: workArea.x, y: workArea.y, ...size },
    workArea,
    options
  );
  const belowY = anchor.y + gap;
  const aboveY = anchor.y - gap - constrainedSize.height;
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - margin - constrainedSize.height;
  const fitsBelow = belowY <= maxY;
  const fitsAbove = aboveY >= minY;
  let y: number;
  if (fitsBelow) y = belowY;
  else if (fitsAbove) y = aboveY;
  else {
    const spaceBelow = workArea.y + workArea.height - margin - (anchor.y + gap);
    const spaceAbove = anchor.y - gap - (workArea.y + margin);
    y = spaceBelow >= spaceAbove ? belowY : aboveY;
  }
  return clampRectToWorkArea(
    {
      x: anchor.x - constrainedSize.width / 2,
      y,
      width: constrainedSize.width,
      height: constrainedSize.height,
    },
    workArea,
    options
  );
}

export function resizeRectKeepingTopLeft(
  bounds: WindowRect,
  size: WindowSize,
  workArea: WindowRect,
  options: WindowPlacementOptions = {}
): WindowRect {
  return clampRectToWorkArea(
    { x: bounds.x, y: bounds.y, ...size },
    workArea,
    options
  );
}
