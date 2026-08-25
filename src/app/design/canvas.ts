import { CanvasElement } from '../types';

/** Snap a 0-1000 coordinate to a grid of `cell` units, clamped to [0, 1000]. */
export const snapToGridValue = (v: number, cell: number): number =>
    Math.min(1000, Math.max(0, Math.round(v / cell) * cell));

/**
 * Clamp a normalized (0-1000) bbox so it stays fully inside the canvas,
 * rounding the result to integer coordinates.
 */
export const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
    const [yMin, xMin, yMax, xMax] = bbox;
    const x = Math.min(Math.max(xMin, 0), Math.max(1000 - (xMax - xMin), 0));
    const y = Math.min(Math.max(yMin, 0), Math.max(1000 - (yMax - yMin), 0));
    return [Math.round(y), Math.round(x), Math.round(y + (yMax - yMin)), Math.round(x + (xMax - xMin))];
};

/** Convert a normalized (0-1000) bbox into pixel geometry on the canvas. */
export const bboxToGeometry = (
    bbox: [number, number, number, number],
    displaySize: { width: number; height: number },
) => {
    const [yMin, xMin, yMax, xMax] = bbox;
    return {
        left: (xMin / 1000) * displaySize.width,
        top: (yMin / 1000) * displaySize.height,
        width: ((xMax - xMin) / 1000) * displaySize.width,
        height: ((yMax - yMin) / 1000) * displaySize.height,
    };
};

export type AlignGuides = {
    v: { x: number; index: number } | null;
    h: { y: number; index: number } | null;
};

/**
 * The nearest other element (one per axis) whose vertical (x-center) /
 * horizontal (y-center) center line is within `threshold` 0-1000 units of the
 * dragged element's center line.
 */
export const computeAlignGuides = (
    elements: CanvasElement[],
    index: number,
    clamped: [number, number, number, number],
    threshold: number,
): AlignGuides => {
    const myCx = (clamped[1] + clamped[3]) / 2;
    const myCy = (clamped[0] + clamped[2]) / 2;
    let bestV: AlignGuides['v'] = null;
    let bestH: AlignGuides['h'] = null;
    let bestVD = threshold + 1;
    let bestHD = threshold + 1;
    elements.forEach((el, i) => {
        if (i === index || !el.bbox) return;
        const dV = Math.abs((el.bbox[1] + el.bbox[3]) / 2 - myCx);
        if (dV <= bestVD) { bestVD = dV; bestV = { x: (el.bbox[1] + el.bbox[3]) / 2, index: i }; }
        const dH = Math.abs((el.bbox[0] + el.bbox[2]) / 2 - myCy);
        if (dH <= bestHD) { bestHD = dH; bestH = { y: (el.bbox[0] + el.bbox[2]) / 2, index: i }; }
    });
    return { v: bestV, h: bestH };
};
