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
