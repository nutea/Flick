import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  constrainPanelBounds,
  placePanelNearPoint,
} from '../apps/superx/node-src/panel-geometry';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('super panel geometry flips above screen edges and constrains later growth', () => {
  const area = { x: -1280, y: 0, width: 1280, height: 720 };
  assert.deepEqual(
    placePanelNearPoint({ x: -30, y: 700 }, { width: 240, height: 300 }, area),
    { x: -248, y: 388, width: 240, height: 300 }
  );
  assert.deepEqual(
    constrainPanelBounds({ x: -100, y: 650, width: 240, height: 400 }, area),
    { x: -248, y: 312, width: 240, height: 400 }
  );
});

test('window geometry has one main-process writer and versioned panel layout', () => {
  const app = read('src/renderer/App.vue');
  const preload = read('src/preload/main.ts');
  const api = read('src/main/common/api.ts');
  const resize = read('src/main/common/mainWindowContentResize.ts');
  const panel = read('apps/superx/src/panel/use-super-panel.ts');
  const panelWindow = read('apps/superx/node-src/panel-window.ts');
  const panelPreload = read('apps/superx/node-src/panel-preload.ts');
  const controller = read('src/main/common/windowGeometryController.ts');
  const resultView = read('src/renderer/components/result.vue');

  assert.doesNotMatch(app, /useDrag|onMouseDown/);
  assert.doesNotMatch(preload, /windowMoving|moveWindow/);
  assert.doesNotMatch(api, /windowMoving/);
  assert.doesNotMatch(resize, /for\s*\(/);
  assert.match(panel, /ResizeObserver/);
  assert.match(panel, /activeRequestId/);
  assert.match(panel, /lastReportedHeight/);
  assert.doesNotMatch(panel, /scrollWidth/);
  assert.match(panelWindow, /superPanel-report-layout/);
  assert.match(panelWindow, /const PANEL_WIDTH = 240/);
  assert.match(panelWindow, /will-move/);
  assert.doesNotMatch(panelWindow, /expectedProgrammaticBounds/);
  assert.doesNotMatch(panelPreload, /width:\s*number/);
  assert.doesNotMatch(panelWindow, /panelPositionAnchor|superPanel-setSize/);
  assert.match(controller, /setContentSize/);
  assert.match(controller, /setContentBounds/);
  assert.doesNotMatch(controller, /win\.setPosition\(/);
  assert.match(controller, /will-move/);
  assert.match(controller, /launcherAnchors/);
  assert.doesNotMatch(controller, /lastAppliedPosition/);
  assert.match(
    controller,
    /rectForAtomicUpdate\([\s\S]*win\.setContentBounds\(next, false\)/
  );
  assert.match(controller, /POSITION_ROUNDING_TOLERANCE_DIP/);
  assert.match(controller, /fitRectBelowPoint/);
  assert.match(controller, /desiredMainContentHeight/);
  assert.match(resultView, /\.options[\s\S]*overflow:\s*auto/);
  assert.match(app, /lastCommittedLauncherHeight/);
});
