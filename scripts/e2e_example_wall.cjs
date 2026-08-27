/**
 * e2e for the home page's DEFAULT wall (run against `expo start --web` on
 * :8081). The Home section (the page default) is now populated from the
 * bundled example collection (public/example_collection/example.json) instead
 * of being empty. Verifies:
 *  - Home section: the wall shows one tile per example under the "Collections"
 *    section title, each rendering its example image;
 *  - hovering a tile overlays the example's ORIGINAL prompt and hides again
 *    on unhover;
 *  - clicking a tile opens a NEW design seeded from the example: the reference
 *    image on the canvas, the element boxes, the title (HLD), a one-image
 *    history, and the Show Prompt dialog (original prompt left / structured
 *    JSON right); back returns to the home page.
 * Assertions are driven by the on-disk example.json so they track the file.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const EXAMPLES = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'public', 'example_collection', 'example.json'), 'utf8'));
// First example drives the interaction assertions.
const EX = EXAMPLES[0];

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
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const tile = (id) => page.locator(`[data-testid="wall-tile-${id}"]`);
    const firstId = EX.url.split('/').pop().replace(/\.[^.]+$/, '');

    // ================= S1: home (default) wall shows the examples =================
    await section('S1 home default wall: example collection, no title', async () => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        // The home wall carries its own "Collections" title: "Recent Designs"
        // appears only as the sidebar nav.
        ok(await page.getByText('Recent Designs', { exact: true }).count() === 1,
            'home: Recent Designs is the sidebar nav only');
        ok(await page.getByText('Collections', { exact: true }).count() === 1,
            'home: Collections wall title shown');
        // One tile per example.
        ok(await page.locator('[data-testid^="wall-tile-"]').count() === EXAMPLES.length,
            `wall shows one tile per example (${EXAMPLES.length})`);
        ok(await tile(firstId).count() === 1, 'first example tile present');
        // Each tile renders its example image, resolved from the IndexedDB
        // image store as a data URI (images are IDB-only refs now).
        const tileImgs = page.locator('[data-testid^="wall-tile-"] img');
        ok(await tileImgs.count() === EXAMPLES.length
            && (await tileImgs.first().getAttribute('src')).startsWith('data:image/'),
            'all example tiles render their image (IDB data URI)');
        await page.screenshot({ path: path.join(TEMP, 'shot_example_wall_home.png') });
    });

    // ================= S2: hover an example tile -> original prompt overlay =================
    await section('S2 hover example tile overlays the original prompt', async () => {
        await tile(firstId).hover();
        await page.waitForTimeout(250);
        ok(await page.getByText(EX.prompt, { exact: true }).count() === 1,
            'hover overlays the example\'s ORIGINAL prompt');
        const overlay = await page.locator('[data-testid="wall-tile-overlay"]')
            .evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => 'n/a');
        ok(overlay === 'rgba(0, 0, 0, 0.65)', `overlay dim background present (${overlay})`);
        await page.mouse.move(10, 10);
        await page.waitForTimeout(250);
        ok(await page.getByText(EX.prompt, { exact: true }).count() === 0, 'overlay gone after unhover');
    });

    // ================= S3: click an example tile -> new design seeded from it =================
    await section('S3 click example tile opens a design seeded from it', async () => {
        await tile(firstId).click();
        await page.waitForURL('**/design**', { timeout: 10000 });
        await page.waitForTimeout(1200);

        // Title restored from the example's high_level_description.
        ok(await page.locator('input[placeholder="Untitled Design"]').inputValue() === EX.jsonprompt.high_level_description,
            'design title restored from the example HLD');

        // Canvas at the example's aspect ratio (1:1) with the reference image.
        const canvas = await page.locator('[data-testid="design-canvas"]').boundingBox();
        const ratio = canvas ? canvas.width / canvas.height : 0;
        const [rw, rh] = EX.jsonprompt.aspect_ratio.split(':').map(Number);
        ok(Math.abs(ratio - rw / rh) < 0.02, `canvas at the example aspect ratio (${ratio.toFixed(3)})`);
        // The reference image is the example's persisted IDB record — a data
        // URI, not the bundled file's url.
        const canvasImg = await page.locator('[data-testid="design-canvas"] img').first().getAttribute('src');
        ok(!!canvasImg && canvasImg.startsWith('data:image/'),
            'reference image shown on the canvas (IDB data URI)');

        // The example image seeds the generated-image history (one image).
        ok(await page.getByText('Generated (1)').count() === 1, 'image history seeded with the example image');

        // Element boxes from the example's jsonprompt are on the canvas.
        const boxCount = await page.locator(
            'div[style*="left:"][style*="top:"][style*="width:"][style*="height:"]:visible:not([data-testid="design-canvas"])'
        ).count();
        const elCount = EX.jsonprompt.compositional_deconstruction.elements.length;
        ok(boxCount === elCount, `element boxes rendered (${boxCount}/${elCount})`);

        // Show Prompt: original prompt on the left, structured JSON on the right.
        await page.locator('[data-testid="show-prompt-button"]').click();
        await page.waitForTimeout(400);
        ok(await page.locator('[data-testid="prompt-original"]').inputValue() === EX.prompt,
            'Show Prompt left pane = the original prompt');
        const enhanced = await page.locator('[data-testid="prompt-enhanced"]').inputValue();
        ok(enhanced.includes(EX.jsonprompt.high_level_description),
            'Show Prompt right pane = the structured JSON');
        await page.screenshot({ path: path.join(TEMP, 'shot_example_wall_design.png') });
        await page.locator('[data-testid="prompt-dialog-close"]').click();
        await page.waitForTimeout(200);

        // Back to home (the home page set the navigation flag on open).
        await page.locator('[data-testid="back-button"]').click();
        await page.waitForTimeout(800);
        ok(page.url() === BASE + '/', 'back returns to the home page');
        ok(await page.locator('[data-testid^="wall-tile-"]').count() === EXAMPLES.length,
            'home remounts showing the example wall again');
    });

    ok(pageErrors.length === 0, `no page errors (${pageErrors[0] || 'none'})`);

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('EXAMPLE WALL E2E ERROR:', e); process.exit(1); });
