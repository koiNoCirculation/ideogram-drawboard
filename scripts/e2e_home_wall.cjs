/**
 * e2e for the home page image wall (masonry of saved designs; run against
 * `expo start --web` on :8081). Verifies:
 *  - Home section: no wall title, wall is empty by default;
 *  - Recent Designs section: title shown; masonry tiles only for designs
 *    that HAVE images (each showing its LATEST image); newest-first DOM
 *    order; tile aspect follows the saved canvas size;
 *  - hovering a tile overlays the ORIGINAL prompt (rawPrompt; falls back to
 *    high_level_description for designs saved without one) and hides again
 *    on unhover;
 *  - clicking a tile opens the corresponding design;
 *  - no saved designs -> empty-state text.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const mkDesign = (over) => ({
    prompt: {
        aspect_ratio: '1:1',
        high_level_description: 'HLD',
        style_description: { medium: 'photograph', color_palette: ['#111111'] },
        compositional_deconstruction: {
            background: 'bg',
            elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'an element' }],
        },
    },
    images: [],
    size: { width: 512, height: 512 },
    updatedAt: 1000,
    ...over,
});

const DESIGNS = [
    // d1: newest, landscape 4:3, two images, has rawPrompt.
    mkDesign({
        id: 'd1',
        prompt: { ...mkDesign({}).prompt, high_level_description: 'HLD ONE' },
        images: [`${BASE}/regress-img-1.png`, `${BASE}/regress-img-2.png`],
        size: { width: 800, height: 600 },
        updatedAt: 3000,
        rawPrompt: 'RAW ONE',
    }),
    // d2: portrait 3:4, one image, NO rawPrompt (HLD fallback on hover).
    mkDesign({
        id: 'd2',
        prompt: { ...mkDesign({}).prompt, high_level_description: 'HLD TWO' },
        images: [`${BASE}/regress-img-3.png`],
        size: { width: 600, height: 800 },
        updatedAt: 2000,
    }),
    // d3: no images -> never appears in the wall.
    mkDesign({
        id: 'd3',
        prompt: { ...mkDesign({}).prompt, high_level_description: 'HLD THREE' },
        size: { width: 512, height: 512 },
        updatedAt: 1000,
        rawPrompt: 'RAW THREE',
    }),
];

(async () => {
    const browser = await chromium.launch();
    let pass = 0, fail = 0;
    const ok = (cond, name) => {
        if (cond) { pass++; console.log('  OK   ' + name); }
        else { fail++; console.log('  FAIL ' + name); }
    };
    const section = async (name, fn) => {
        console.log('\n== ' + name + ' ==');
        try { await fn(); } catch (e) { fail++; console.log('  ERROR ' + name + ': ' + (e && e.message)); }
    };

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript((d) => {
        if (!localStorage.getItem('drawboard.designs'))
            localStorage.setItem('drawboard.designs', JSON.stringify(d));
    }, DESIGNS);
    await page.route('**/regress-img-*.png', (route) =>
        route.fulfill({ contentType: 'image/png', body: PNG }));

    // ================= S1: home section — empty wall, no title =================
    await section('S1 home section: wall empty, no title', async () => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        // "Recent Designs" appears exactly once (the sidebar nav) — no wall title.
        ok(await page.getByText('Recent Designs', { exact: true }).count() === 1, 'home: sidebar nav only (no wall title)');
        ok(await page.locator('[data-testid^="wall-tile-"]').count() === 0, 'home: image wall empty');
        await page.screenshot({ path: path.join(TEMP, 'shot_home_wall_home.png') });
    });

    // ================= S2: recent section — masonry + hover overlays =================
    await section('S2 recent section: masonry tiles + hover overlays', async () => {
        await page.locator('[data-testid="nav-recent-designs"]').click();
        await page.waitForTimeout(600);
        ok(await page.getByText('Recent Designs', { exact: true }).count() === 2, 'recent: wall title shown');

        const tile = (id) => page.locator(`[data-testid="wall-tile-${id}"]`);
        ok(await tile('d1').count() === 1 && await tile('d2').count() === 1, 'tiles for the two designs with images');
        ok(await tile('d3').count() === 0, 'no tile for the design without images');
        ok(await page.locator('img[src*="regress-img-2"]').count() === 1, 'd1 tile shows its LATEST image (img-2)');

        // Newest first in DOM order (d1 before d2).
        const order = await page.evaluate(() => {
            const a = document.querySelector('[data-testid="wall-tile-d1"]');
            const b = document.querySelector('[data-testid="wall-tile-d2"]');
            return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
        });
        ok(order, 'newest design tile first in DOM order');

        // Tile aspect follows the saved canvas size (4:3 landscape / 3:4 portrait).
        const b1 = await tile('d1').boundingBox();
        const b2 = await tile('d2').boundingBox();
        const a1 = b1 && b1.width / b1.height;
        const a2 = b2 && b2.width / b2.height;
        ok(Math.abs(a1 - 800 / 600) < 0.02, `d1 tile aspect 4:3 (got ${a1 && a1.toFixed(3)})`);
        ok(Math.abs(a2 - 600 / 800) < 0.02, `d2 tile aspect 3:4 (got ${a2 && a2.toFixed(3)})`);

        // Hover d1 -> overlay with the ORIGINAL prompt (rawPrompt).
        await tile('d1').hover();
        await page.waitForTimeout(250);
        ok(await page.getByText('RAW ONE', { exact: true }).count() === 1, 'hover d1 overlays the rawPrompt');
        // Static styles are compiled to CSS classes by RN-web, so assert the
        // dim background via computed style, not the inline style attribute.
        const overlayBg = await page.locator('[data-testid="wall-tile-overlay"]')
            .evaluate((el) => getComputedStyle(el).backgroundColor);
        ok(overlayBg === 'rgba(0, 0, 0, 0.65)', `overlay dim background present (${overlayBg})`);
        await page.mouse.move(10, 10);
        await page.waitForTimeout(250);
        ok(await page.getByText('RAW ONE', { exact: true }).count() === 0, 'overlay gone after unhover');

        // Hover d2 (no rawPrompt) -> high_level_description fallback.
        await tile('d2').hover();
        await page.waitForTimeout(250);
        ok(await page.getByText('HLD TWO', { exact: true }).count() === 1, 'hover d2 falls back to high_level_description');
        await page.mouse.move(10, 10);
        await page.waitForTimeout(250);
        ok(await page.getByText('HLD TWO', { exact: true }).count() === 0, 'd2 overlay gone after unhover');
        await page.screenshot({ path: path.join(TEMP, 'shot_home_wall_recent.png') });
    });

    // ================= S3: click a tile -> opens the design =================
    await section('S3 click tile -> design opens', async () => {
        await page.locator('[data-testid="wall-tile-d2"]').click();
        await page.waitForURL('**/design**', { timeout: 10000 });
        await page.waitForTimeout(800);
        ok(await page.locator('input[placeholder="Untitled Design"]').inputValue() === 'HLD TWO',
            'design title restored from high_level_description');
        const canvas = await page.locator('[data-testid="design-canvas"]').boundingBox();
        ok(canvas && Math.abs(canvas.width / canvas.height - 600 / 800) < 0.02,
            `canvas restored to 600x800 ratio (${canvas && (canvas.width / canvas.height).toFixed(3)})`);
        ok(await page.getByText('Generated (1)').count() === 1, 'image history restored');

        // Back to home (native history back; the home page sets the flag).
        await page.locator('[data-testid="back-button"]').click();
        await page.waitForTimeout(800);
        ok(page.url() === BASE + '/', 'back returns to the home page');
        ok(await page.getByText('Recent Designs', { exact: true }).count() === 1,
            'home remounts in the Home section (wall title hidden again)');
    });

    // ================= S4: no saved designs -> empty state =================
    await section('S4 no saved designs -> empty state', async () => {
        const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page2.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page2.waitForTimeout(500);
        await page2.locator('[data-testid="nav-recent-designs"]').click();
        await page2.waitForTimeout(400);
        ok(await page2.getByText('No saved designs yet').count() === 1, 'empty-state text shown');
        ok(await page2.locator('[data-testid^="wall-tile-"]').count() === 0, 'no tiles');
        await page2.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HOME WALL E2E ERROR:', e); process.exit(1); });
