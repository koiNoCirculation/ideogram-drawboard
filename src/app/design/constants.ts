import { RefinedPrompt } from '../types';

/** Minimum drag distance in canvas pixels for a create-drag to count (vs a click). */
export const MIN_CREATE_DRAG_PX = 12;

// Wheel zoom of the canvas (elements scale with it; the surrounding UI does not).
export const CANVAS_MIN_ZOOM = 1;
export const CANVAS_MAX_ZOOM = 8;
export const CANVAS_WHEEL_ZOOM_FACTOR = 1.1;

/**
 * Center-alignment guides: while dragging, the nearest other element's center
 * line is shown (and its element highlighted) when its center is within this
 * many 0-1000 units of the dragged element's center.
 */
export const ALIGN_GUIDE_THRESHOLD = 10;

/**
 * Grid cell size in Ideogram bbox units (0-1000 space). The grid gets finer
 * with each pair of wheel steps (×factor per step): 100×100 cells (10 units)
 * at the base level, 200×200 (5) after 2 steps, 500×500 (2) after 4, and
 * 1000×1000 (1) from 6 steps up to max zoom.
 */
export const gridCellUnits = (zoom: number): number => {
    const f = CANVAS_WHEEL_ZOOM_FACTOR;
    if (zoom >= f ** 6) return 1;
    if (zoom >= f ** 4) return 2;
    if (zoom >= f ** 2) return 5;
    return 10;
};

// Ruler strip sizes (px): the left strip's width and the top strip's height.
// The strips extend OUTWARD from the canvas (above its top edge, left of its
// left edge) so they never occlude the canvas content.
export const RULER_LEFT_WIDTH = 30;
export const RULER_TOP_HEIGHT = 20;

/**
 * Base ruler number density in bbox units (0-1000 space), tiered by the same
 * wheel levels as the grid: a number every 100 units at levels 0-1, every 50
 * at 2-3, every 20 at 4-5, and every 10 from level 6 up. Each step is a
 * multiple of that level's grid cell, so numbers always sit on grid lines.
 * This is the LONG axis's step; see rulerSteps for the short axis.
 */
export const rulerLabelStep = (zoom: number): number => {
    const f = CANVAS_WHEEL_ZOOM_FACTOR;
    if (zoom >= f ** 6) return 10;
    if (zoom >= f ** 4) return 20;
    if (zoom >= f ** 2) return 50;
    return 100;
};

/**
 * Per-axis ruler number steps. The long axis keeps rulerLabelStep; on a
 * non-square canvas the short axis is made sparser by the aspect ratio (its
 * label step is scaled up by long/short) so the per-pixel number density
 * roughly matches on both sides. The short-axis step is always a multiple of
 * 10 — rounded UP (sparser) when the scaled value is not one, so it stays a
 * multiple of the grid cell.
 */
export const rulerSteps = (zoom: number, width: number, height: number): { top: number; left: number } => {
    const base = rulerLabelStep(zoom);
    if (width === height) return { top: base, left: base };
    const ratio = Math.max(width, height) / Math.min(width, height);
    // The 1e-9 absorbs float noise around exact multiples of 10.
    const shortStep = Math.ceil((base * ratio - 1e-9) / 10) * 10;
    return width > height ? { top: base, left: shortStep } : { top: shortStep, left: base };
};

/**
 * Undo/redo history: one snapshot per completed user action (a drag/resize
 * that actually moved, a text/desc edit, an element add/remove, a palette
 * change). Capped at 50 entries.
 */
export type Snapshot = { data: RefinedPrompt | null; palette: string[] };
export const UNDO_HISTORY_LIMIT = 50;

/** Default canvas text size in px — matches ElementBox's elementTextContent style. */
export const DEFAULT_TEXT_FONT_SIZE = 13;
/** Preset sizes offered by the font-size dropdown (any integer can also be typed). */
export const FONT_SIZE_PRESETS = [12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];
/** Common fonts offered in the font dropdown. */
export const FONT_CHOICES = [
    'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS',
    'Courier New', 'Garamond', 'Palatino', 'Impact', 'Comic Sans MS', 'Brush Script MT',
    'Noto Sans CJK SC', 'SimSun', 'KaiTi',
];
