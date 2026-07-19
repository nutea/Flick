"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.screen = exports.clipboard = exports.input = exports.system = exports.nativeRuntime = void 0;
const clipboard_1 = require("./clipboard");
Object.defineProperty(exports, "clipboard", { enumerable: true, get: function () { return clipboard_1.clipboard; } });
const input_1 = require("./input");
Object.defineProperty(exports, "input", { enumerable: true, get: function () { return input_1.input; } });
const system_1 = require("./system");
Object.defineProperty(exports, "system", { enumerable: true, get: function () { return system_1.system; } });
const screen_1 = require("./screen");
Object.defineProperty(exports, "screen", { enumerable: true, get: function () { return screen_1.screen; } });
exports.nativeRuntime = {
    system: system_1.system,
    input: input_1.input,
    clipboard: clipboard_1.clipboard,
    screen: screen_1.screen,
};
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map