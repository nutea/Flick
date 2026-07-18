"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.constrainPanelBounds = constrainPanelBounds;
exports.placePanelNearPoint = placePanelNearPoint;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
function constrainPanelBounds(rect, workArea, margin = 8) {
    const width = Math.min(Math.max(1, Math.round(rect.width)), workArea.width - margin * 2);
    const height = Math.min(Math.max(1, Math.round(rect.height)), workArea.height - margin * 2);
    return {
        x: Math.round(clamp(rect.x, workArea.x + margin, workArea.x + workArea.width - margin - width)),
        y: Math.round(clamp(rect.y, workArea.y + margin, workArea.y + workArea.height - margin - height)),
        width,
        height,
    };
}
function placePanelNearPoint(anchor, size, workArea, gap = 12, margin = 8) {
    const constrained = constrainPanelBounds({ x: workArea.x, y: workArea.y, ...size }, workArea, margin);
    const below = anchor.y + gap;
    const above = anchor.y - gap - constrained.height;
    const maxY = workArea.y + workArea.height - margin - constrained.height;
    const minY = workArea.y + margin;
    const y = below <= maxY ? below : above >= minY ? above : below;
    return constrainPanelBounds({
        x: anchor.x - constrained.width / 2,
        y,
        width: constrained.width,
        height: constrained.height,
    }, workArea, margin);
}
