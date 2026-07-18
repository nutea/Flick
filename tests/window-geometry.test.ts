import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundsFromRelativePosition,
  boundsFromRelativeAnchor,
  fitRectBelowPoint,
  rectForAtomicUpdate,
  clampRectToWorkArea,
  defaultLauncherBounds,
  placePopoverNearPoint,
  relativePositionForBounds,
  relativeAnchorForPoint,
  resizeRectKeepingTopLeft,
} from '../src/common/utils/windowGeometry';

test('launcher defaults to the horizontal center and first vertical third', () => {
  assert.deepEqual(
    defaultLauncherBounds(
      { x: 0, y: 0, width: 1920, height: 1080 },
      { width: 800, height: 60 }
    ),
    { x: 560, y: 330, width: 800, height: 60 }
  );
});

test('clamp supports displays with negative coordinates', () => {
  assert.deepEqual(
    clampRectToWorkArea(
      { x: -2500, y: -400, width: 800, height: 900 },
      { x: -1920, y: -180, width: 1920, height: 1080 }
    ),
    { x: -1912, y: -172, width: 800, height: 900 }
  );
});

test('relative positions survive work-area and DPI-related size changes', () => {
  const oldArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const relative = relativePositionForBounds(
    { x: 900, y: 520, width: 800, height: 300 },
    oldArea
  );
  const moved = boundsFromRelativePosition(
    relative,
    { x: -1280, y: 0, width: 1280, height: 680 },
    { width: 700, height: 220 }
  );
  assert.equal(moved.x >= -1272, true);
  assert.equal(moved.y >= 8, true);
  assert.equal(moved.x + moved.width <= -8, true);
  assert.equal(moved.y + moved.height <= 672, true);
});

test('preferred top-left anchor does not drift when content height changes', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const anchor = relativeAnchorForPoint({ x: 560, y: 330 }, area);
  assert.equal(
    boundsFromRelativeAnchor(anchor, area, { width: 800, height: 60 }).y,
    330
  );
  assert.equal(
    boundsFromRelativeAnchor(anchor, area, { width: 800, height: 400 }).y,
    330
  );
});

test('temporary edge avoidance does not change the preferred anchor', () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 };
  const anchor = relativeAnchorForPoint({ x: 240, y: 500 }, area);
  const expanded = boundsFromRelativeAnchor(anchor, area, {
    width: 800,
    height: 500,
  });
  const collapsed = boundsFromRelativeAnchor(anchor, area, {
    width: 800,
    height: 60,
  });
  assert.equal(expanded.y, 212);
  assert.equal(collapsed.y, 500);
});

test('launcher grows downward without moving its top edge', () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 };
  assert.deepEqual(
    fitRectBelowPoint({ x: 240, y: 500 }, { width: 800, height: 500 }, area, {
      minHeight: 60,
    }),
    { x: 240, y: 500, width: 800, height: 212 }
  );
  assert.deepEqual(
    fitRectBelowPoint({ x: 240, y: 500 }, { width: 800, height: 130 }, area, {
      minHeight: 60,
    }),
    { x: 240, y: 500, width: 800, height: 130 }
  );
});

test('height changes keep the canonical anchor out of the DIP feedback loop', () => {
  assert.deepEqual(
    rectForAtomicUpdate(
      { x: 241, y: 501, width: 800, height: 130 },
      { x: 240, y: 500, width: 800, height: 340 },
      1
    ),
    { x: 240, y: 500, width: 800, height: 340 }
  );
  assert.equal(
    rectForAtomicUpdate(
      { x: 241, y: 501, width: 800, height: 340 },
      { x: 240, y: 500, width: 800, height: 341 },
      1
    ),
    undefined
  );
});

test('popover flips above the cursor when it does not fit below', () => {
  const bounds = placePopoverNearPoint(
    { x: 960, y: 1000 },
    { width: 240, height: 300 },
    { x: 0, y: 0, width: 1920, height: 1040 }
  );
  assert.deepEqual(bounds, { x: 840, y: 688, width: 240, height: 300 });
});

test('oversized popovers and later resize stay fully visible', () => {
  const area = { x: 100, y: 100, width: 500, height: 400 };
  assert.deepEqual(
    placePopoverNearPoint(
      { x: 590, y: 490 },
      { width: 900, height: 900 },
      area
    ),
    { x: 108, y: 108, width: 484, height: 384 }
  );
  assert.deepEqual(
    resizeRectKeepingTopLeft(
      { x: 550, y: 450, width: 240, height: 50 },
      { width: 240, height: 300 },
      area
    ),
    { x: 352, y: 192, width: 240, height: 300 }
  );
});
