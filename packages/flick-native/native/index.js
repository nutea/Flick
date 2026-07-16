'use strict';

const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, 'flick_native.node'),
  path.join(__dirname, 'target', 'debug', 'flick_native.node'),
  path.join(__dirname, 'target', 'release', 'flick_native.node'),
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    module.exports = require(candidate);
    return;
  }
}

throw new Error(
  '[flick-native] native addon not found. Run `pnpm --filter flick-native run native:build` first.'
);
