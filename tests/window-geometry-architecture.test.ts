import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  constrainPanelBounds,
  placePanelNearPoint,
} from '../apps/superx/node-src/panel-geometry';
import { boundsWithLockedHeight } from '../src/common/utils/windowResize';

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

test('launcher resize locks height while preserving horizontal resize', () => {
  const current = { x: 100, y: 80, width: 800, height: 240 };
  assert.equal(
    boundsWithLockedHeight(current, {
      x: 80,
      y: 60,
      width: 820,
      height: 260,
    })?.height,
    240
  );
  assert.deepEqual(
    boundsWithLockedHeight(current, {
      x: 80,
      y: 60,
      width: 820,
      height: 260,
    }),
    { x: 80, y: 80, width: 820, height: 240 }
  );
  assert.equal(
    boundsWithLockedHeight(current, {
      x: 80,
      y: 80,
      width: 820,
      height: 240,
    }),
    null
  );
});

test('window geometry has one main-process writer and versioned panel layout', () => {
  const app = read('src/renderer/App.vue');
  const preload = read('src/preload/main.ts');
  const api = read('src/main/common/api.ts');
  const resize = read('src/main/common/mainWindowContentResize.ts');
  const panel = read('apps/superx/src/panel/use-super-panel.ts');
  const panelApp = read('apps/superx/src/panel/App.vue');
  const panelEntry = read('apps/superx/src/panel/main.ts');
  const panelWindow = read('apps/superx/node-src/panel-window.ts');
  const panelPreload = read('apps/superx/node-src/panel-preload.ts');
  const controller = read('src/main/common/windowGeometryController.ts');
  const mainWindow = read('src/main/browsers/main.ts');
  const windowConstants = read('src/common/constans/common.ts');
  const resultView = read('src/renderer/components/result.vue');

  assert.doesNotMatch(app, /useDrag|onMouseDown/);
  assert.doesNotMatch(preload, /windowMoving|moveWindow/);
  assert.doesNotMatch(api, /windowMoving/);
  assert.doesNotMatch(resize, /for\s*\(/);
  assert.match(panel, /ResizeObserver/);
  assert.match(panel, /activeRequestId/);
  assert.match(panel, /lastReportedHeight/);
  assert.doesNotMatch(panel, /scrollWidth/);
  assert.doesNotMatch(panel, /scrollHeight/);
  assert.match(panel, /getBoundingClientRect\(\)\.height/);
  assert.match(panelApp, /html,[\s\S]*#app[\s\S]*overflow:\s*hidden/);
  assert.match(panelApp, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(panelApp, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(panelApp, /<a-modal|translation-modal/);
  assert.doesNotMatch(panelEntry, /\bModal\b|modal\/style/);
  assert.match(panelWindow, /superPanel-report-layout/);
  assert.match(panelWindow, /const PANEL_WIDTH = 240/);
  assert.match(panelWindow, /resizable:\s*false/);
  assert.match(panelWindow, /will-move/);
  assert.doesNotMatch(panelWindow, /expectedProgrammaticBounds/);
  assert.doesNotMatch(panelPreload, /width:\s*number/);
  assert.doesNotMatch(panelWindow, /panelPositionAnchor|superPanel-setSize/);
  assert.match(controller, /setContentSize/);
  assert.match(controller, /setContentBounds/);
  assert.doesNotMatch(controller, /win\.setPosition\(/);
  assert.match(controller, /will-move/);
  assert.match(controller, /will-resize/);
  assert.match(controller, /setPluginViewActive/);
  assert.match(controller, /setMinimumSize/);
  assert.match(controller, /setMaximumSize/);
  assert.match(controller, /setMinimumSize\(WINDOW_MIN_WIDTH/);
  assert.match(mainWindow, /minWidth:\s*WINDOW_MIN_WIDTH/);
  assert.match(windowConstants, /WINDOW_MIN_WIDTH\s*=\s*800/);
  assert.match(windowConstants, /WINDOW_WIDTH\s*=\s*WINDOW_MIN_WIDTH/);
  assert.match(controller, /launcherAnchors/);
  assert.doesNotMatch(controller, /lastAppliedPosition/);
  assert.match(
    controller,
    /rectForAtomicUpdate\([\s\S]*win\.setContentBounds\(next, false\)/
  );
  assert.match(controller, /POSITION_ROUNDING_TOLERANCE_DIP/);
  assert.match(controller, /fitRectBelowPoint/);
  assert.match(controller, /desiredMainContentHeight/);
  assert.match(controller, /desiredMainContentWidth/);
  assert.match(resultView, /\.options[\s\S]*overflow:\s*auto/);
  assert.match(app, /lastCommittedLauncherHeight/);
});
