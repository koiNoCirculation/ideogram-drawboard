// Aspect-ratio / resolution constants + helpers for the home page's size
// picker. "Custom" image provider: the preset ratio list + free W/H inputs.
// "Official" (Ideogram 4 official API): the resolution must be one of the
// fixed OFFICIAL_RESOLUTIONS; the home page offers them grouped by reduced
// aspect ratio in two rows (row 1 = ratios, row 2 = the selected ratio's
// resolutions).

export type Resolution = { w: number; h: number };

/** The free-form ratio presets of the "Custom" provider picker. */
export const PRESET_RATIOS = ['4:3', '3:4', '16:9', '16:10', '9:16', '10:16', '1:1'];

/** Every resolution the official Ideogram 4 API accepts (fixed set). */
export const OFFICIAL_RESOLUTIONS: readonly Resolution[] = [
    { w: 2048, h: 2048 },
    { w: 1440, h: 2880 },
    { w: 2880, h: 1440 },
    { w: 1664, h: 2496 },
    { w: 1792, h: 2240 },
    { w: 2240, h: 1792 },
    { w: 1440, h: 2560 },
    { w: 2560, h: 1440 },
    { w: 1600, h: 2560 },
    { w: 2560, h: 1600 },
    { w: 1728, h: 2304 },
    { w: 2304, h: 1728 },
    { w: 1296, h: 3168 },
    { w: 3168, h: 1296 },
    { w: 1152, h: 2944 },
    { w: 2944, h: 1152 },
    { w: 1248, h: 3328 },
    { w: 3328, h: 1248 },
    { w: 1280, h: 3072 },
    { w: 3072, h: 1280 },
    { w: 1024, h: 3072 },
    { w: 3072, h: 1024 },
    { w: 1024, h: 1024 },
    { w: 896, h: 1120 },
    { w: 1120, h: 896 },
    { w: 1152, h: 864 },
    { w: 832, h: 1248 },
    { w: 1248, h: 832 },
    { w: 800, h: 1280 },
    { w: 1280, h: 800 },
    { w: 720, h: 1280 },
    { w: 1280, h: 720 },
    { w: 720, h: 1440 },
    { w: 1440, h: 720 },
    { w: 512, h: 1536 },
    { w: 1536, h: 512 },
];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The reduced aspect-ratio label of a size: (1280, 720) → "16:9". */
export function ratioLabel(w: number, h: number): string {
    if (w <= 0 || h <= 0) return '1:1';
    const g = gcd(w, h);
    return `${w / g}:${h / g}`;
}

const nearestByArea = (candidates: readonly Resolution[], area: number): Resolution =>
    candidates.reduce((best, r) =>
        Math.abs(r.w * r.h - area) < Math.abs(best.w * best.h - area) ? r : best);

export type OfficialRatioGroup = { ratio: string; resolutions: Resolution[] };

/**
 * OFFICIAL_RESOLUTIONS grouped by reduced aspect ratio. Groups are ordered
 * landscape-first (ratio value descending); within a group the LARGER size
 * comes first — it's the default picked when the user selects the ratio.
 */
export const OFFICIAL_RATIO_GROUPS: readonly OfficialRatioGroup[] = (() => {
    const byRatio = new Map<string, Resolution[]>();
    for (const r of OFFICIAL_RESOLUTIONS) {
        const label = ratioLabel(r.w, r.h);
        const list = byRatio.get(label) ?? [];
        list.push(r);
        byRatio.set(label, list);
    }
    return [...byRatio.entries()]
        .map(([ratio, resolutions]) => ({
            ratio,
            resolutions: [...resolutions].sort((a, b) => b.w * b.h - a.w * a.h),
        }))
        .sort((a, b) => {
            const [aw, ah] = a.ratio.split(':').map(Number);
            const [bw, bh] = b.ratio.split(':').map(Number);
            return bw * ah - aw * bh; // ratio value (w/h) descending
        });
})();

/**
 * Snap a free-form W/H onto the official list (used when the image provider
 * switches to Official): an exact match wins; otherwise the nearest (by
 * area) resolution sharing the same reduced ratio; otherwise the nearest
 * 1:1 size (by area).
 */
export function pickOfficialSize(w: number, h: number): Resolution {
    const exact = OFFICIAL_RESOLUTIONS.find((r) => r.w === w && r.h === h);
    if (exact) return exact;
    if (w > 0 && h > 0) {
        const same = OFFICIAL_RATIO_GROUPS.find((g) => g.ratio === ratioLabel(w, h))?.resolutions;
        if (same && same.length > 0) return nearestByArea(same, w * h);
    }
    return nearestByArea(OFFICIAL_RESOLUTIONS.filter((r) => r.w === r.h), w * h);
}
