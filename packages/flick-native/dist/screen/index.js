"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.screen = void 0;
const tryLoadAddon = () => {
    try {
        return require('../../native');
    }
    catch {
        return null;
    }
};
exports.screen = {
    isAvailable() {
        var _a;
        return typeof ((_a = tryLoadAddon()) === null || _a === void 0 ? void 0 : _a.captureScreenRegion) === 'function';
    },
    async captureRegion(region) {
        const addon = tryLoadAddon();
        if (!(addon === null || addon === void 0 ? void 0 : addon.captureScreenRegion)) {
            throw new Error('Native screen capture is unavailable on this build');
        }
        const { x, y, width, height } = region;
        if (!Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0) {
            throw new TypeError('Screenshot region is invalid');
        }
        return addon.captureScreenRegion(Math.round(x), Math.round(y), width, height);
    },
};
//# sourceMappingURL=index.js.map