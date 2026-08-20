/**
 * Small, dependency-free color conversion helpers shared by the color picker.
 * RGB channels are 0-255; HSV uses h in degrees (0-360) and s/v in 0-1.
 */

export interface Rgb { r: number; g: number; b: number; }
export interface Hsv { h: number; s: number; v: number; }

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/**
 * Parse a hex color ('#RGB' or '#RRGGBB', with or without the leading #) into
 * {r,g,b}. Returns null when the string is not a valid hex color.
 */
export function hexToRgb(hex: string): Rgb | null {
    let v = (hex ?? '').trim().replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
    if (!/^[0-9A-F]{6}$/.test(v)) return null;
    return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16),
    };
}

/** {r,g,b} (0-255) -> '#RRGGBB' (uppercase). */
export function rgbToHex({ r, g, b }: Rgb): string {
    const to2 = (n: number) => clamp255(n).toString(16).toUpperCase().padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** {r,g,b} (0-255) -> {h: 0-360, s: 0-1, v: 0-1}. */
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        switch (max) {
            case rr: h = 60 * (((gg - bb) / d) % 6); break;
            case gg: h = 60 * (((bb - rr) / d) + 2); break;
            default: h = 60 * (((rr - gg) / d) + 4);
        }
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
}

/** {h: 0-360, s: 0-1, v: 0-1} -> {r,g,b} (0-255). */
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
    const hh = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = v - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hh < 60) { rp = c; gp = x; }
    else if (hh < 120) { rp = x; gp = c; }
    else if (hh < 180) { gp = c; bp = x; }
    else if (hh < 240) { gp = x; bp = c; }
    else if (hh < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    return {
        r: clamp255((rp + m) * 255),
        g: clamp255((gp + m) * 255),
        b: clamp255((bp + m) * 255),
    };
}

/** {r,g,b} (0-255) -> 'rgb(r, g, b)' css string. */
export function rgbToCss({ r, g, b }: Rgb): string {
    return `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`;
}
