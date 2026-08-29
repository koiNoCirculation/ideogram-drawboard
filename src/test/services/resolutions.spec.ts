import {
    OFFICIAL_RESOLUTIONS,
    OFFICIAL_RATIO_GROUPS,
    PRESET_RATIOS,
    pickOfficialSize,
    ratioLabel,
} from '../../app/services/resolutions';

// The exact official resolution set the requirement pins (36 entries).
const EXPECTED_OFFICIAL = [
    '2048x2048', '1440x2880', '2880x1440', '1664x2496', '1792x2240', '2240x1792',
    '1440x2560', '2560x1440', '1600x2560', '2560x1600', '1728x2304', '2304x1728',
    '1296x3168', '3168x1296', '1152x2944', '2944x1152', '1248x3328', '3328x1248',
    '1280x3072', '3072x1280', '1024x3072', '3072x1024', '1024x1024', '896x1120',
    '1120x896', '1152x864', '832x1248', '1248x832', '800x1280', '1280x800',
    '720x1280', '1280x720', '720x1440', '1440x720', '512x1536', '1536x512',
];

describe('resolutions', () => {
    it('OFFICIAL_RESOLUTIONS is exactly the official set (36 entries, no dupes)', () => {
        expect(OFFICIAL_RESOLUTIONS).toHaveLength(36);
        const actual = OFFICIAL_RESOLUTIONS.map((r) => `${r.w}x${r.h}`).sort();
        expect(actual).toEqual([...EXPECTED_OFFICIAL].sort());
        expect(new Set(actual).size).toBe(36);
    });

    it('PRESET_RATIOS keeps the custom-provider presets', () => {
        expect(PRESET_RATIOS).toEqual(['4:3', '3:4', '16:9', '16:10', '9:16', '10:16', '1:1']);
    });

    it('ratioLabel reduces a size to its reduced ratio label', () => {
        expect(ratioLabel(1280, 720)).toBe('16:9');
        expect(ratioLabel(1024, 1024)).toBe('1:1');
        expect(ratioLabel(1152, 2944)).toBe('9:23');
        expect(ratioLabel(1296, 3168)).toBe('9:22');
        expect(ratioLabel(1248, 3328)).toBe('3:8');
        expect(ratioLabel(1664, 2496)).toBe('2:3');
        expect(ratioLabel(1536, 512)).toBe('3:1');
        expect(ratioLabel(1152, 864)).toBe('4:3');
        // degenerate input falls back to 1:1
        expect(ratioLabel(0, 0)).toBe('1:1');
        expect(ratioLabel(0, 100)).toBe('1:1');
    });

    it('groups the official resolutions by reduced ratio (23 groups, all 36 covered)', () => {
        expect(OFFICIAL_RATIO_GROUPS).toHaveLength(23);
        expect(OFFICIAL_RATIO_GROUPS.reduce((n, g) => n + g.resolutions.length, 0)).toBe(36);
        for (const g of OFFICIAL_RATIO_GROUPS) {
            expect(g.resolutions.length).toBeGreaterThan(0);
            for (const r of g.resolutions) {
                expect(ratioLabel(r.w, r.h)).toBe(g.ratio);
            }
        }
    });

    it('orders groups landscape-first (ratio value strictly descending)', () => {
        const values = OFFICIAL_RATIO_GROUPS.map((g) => {
            const [w, h] = g.ratio.split(':').map(Number);
            return w / h;
        });
        for (let i = 1; i < values.length; i++) {
            expect(values[i - 1]).toBeGreaterThan(values[i]);
        }
        expect(OFFICIAL_RATIO_GROUPS[0].ratio).toBe('3:1');
        expect(OFFICIAL_RATIO_GROUPS[OFFICIAL_RATIO_GROUPS.length - 1].ratio).toBe('1:3');
    });

    it('orders resolutions within a group largest-first (group default = largest)', () => {
        const labels = (ratio: string) =>
            OFFICIAL_RATIO_GROUPS.find((g) => g.ratio === ratio)?.resolutions
                .map((r) => `${r.w}x${r.h}`);
        expect(labels('16:9')).toEqual(['2560x1440', '1280x720']);
        expect(labels('1:1')).toEqual(['2048x2048', '1024x1024']);
        expect(labels('9:23')).toEqual(['1152x2944']);
        expect(labels('1:3')).toEqual(['1024x3072', '512x1536']);
    });

    it('pickOfficialSize: exact match wins', () => {
        expect(pickOfficialSize(1280, 720)).toEqual({ w: 1280, h: 720 });
        expect(pickOfficialSize(2048, 2048)).toEqual({ w: 2048, h: 2048 });
        expect(pickOfficialSize(1536, 512)).toEqual({ w: 1536, h: 512 });
    });

    it('pickOfficialSize: same reduced ratio -> nearest by area', () => {
        // 16:9 (area 90000) -> 1280x720, not 2560x1440
        expect(pickOfficialSize(800, 450)).toEqual({ w: 1280, h: 720 });
        // 16:9 (area 3240000) -> the larger one
        expect(pickOfficialSize(2400, 1350)).toEqual({ w: 2560, h: 1440 });
        // 4:3 page default (1024x768) -> 1152x864, not 2304x1728
        expect(pickOfficialSize(1024, 768)).toEqual({ w: 1152, h: 864 });
        // 9:16 (area 1440000) -> 720x1280, not 1440x2560
        expect(pickOfficialSize(900, 1600)).toEqual({ w: 720, h: 1280 });
    });

    it('pickOfficialSize: no ratio match -> nearest 1:1 by area; degenerate sizes safe', () => {
        expect(pickOfficialSize(700, 400)).toEqual({ w: 1024, h: 1024 });
        expect(pickOfficialSize(100, 100)).toEqual({ w: 1024, h: 1024 });
        expect(pickOfficialSize(0, 0)).toEqual({ w: 1024, h: 1024 });
        expect(pickOfficialSize(0, 500)).toEqual({ w: 1024, h: 1024 });
    });
});
