/**
 * Show Prompt dialog e2e for DrawBoard (run against `expo start --web` on
 * :8081, with NODE_PATH pointing at a playwright install). Verifies:
 *  - the "Show Prompt" button sits to the right of Download Image;
 *  - re-opening a SAVED design with a recorded raw prompt: the dialog's LEFT
 *    pane shows the original prompt verbatim, the RIGHT pane shows the
 *    refined structured JSON (valid JSON, matching HLD);
 *  - a LEGACY saved design (no rawPrompt) shows an EMPTY left pane;
 *  - a FRESH design (handoff, i.e. just created via Start Design) shows its
 *    original prompt from the handoff;
 *  - the dialog closes via the X button;
 *  - the button is disabled when the page has no design data (bare /design).
 * NOTE: page.addInitScript runs in the PAGE's JS context (module-level vars
 * of this file don't exist there) and takes a SINGLE arg — payloads below are
 * single objects.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:8081';

const PROMPT_WITH_RAW = {
    id: 'sp-new',
    prompt: {
        aspect_ratio: '4:3',
        high_level_description: 'Cat bicycle design',
        style_description: { aesthetics: 'whimsical', medium: 'illustration', color_palette: ['#007AFF'] },
        compositional_deconstruction: {
            background: 'a crescent-moon studio',
            elements: [{ type: 'obj', bbox: [100, 200, 700, 800], desc: 'A cat riding a bicycle.' }],
        },
    },
    images: [`${BASE}/sp-img.png`],
    size: { width: 1024, height: 768 },
    updatedAt: 2000,
    rawPrompt: 'a cat riding a bicycle on the moon',
};
const PROMPT_LEGACY = {
    id: 'sp-legacy',
    prompt: {
        aspect_ratio: '1:1',
        high_level_description: 'Legacy design no raw prompt',
        compositional_deconstruction: {
            background: 'plain',
            elements: [{ type: 'obj', bbox: [0, 0, 500, 500], desc: 'A cube.' }],
        },
    },
    images: [`${BASE}/sp-img-legacy.png`],
    size: { width: 768, height: 768 },
    updatedAt: 1000,
};
const FRESH_HANDOFF = {
    id: 'sp-fresh',
    promptData: JSON.stringify({
        aspect_ratio: '16:9',
        high_level_description: 'Fresh handoff design',
        compositional_deconstruction: {
            background: 'open field',
            elements: [{ type: 'text', bbox: [400, 100, 600, 900], desc: 'headline', text: 'Hello' }],
        },
    }),
    size: { width: 1280, height: 720 },
    rawPrompt: 'fresh idea text',
};

(async () => {
    let pass = 0, fail = 0;
    const ok = (cond, label) => {
        if (cond) { pass++; console.log('  OK   ' + label); }
        else { fail++; console.log('  FAIL ' + label); }
    };
    const section = async (name, fn) => {
        console.log('\n== ' + name + ' ==');
        try { await fn(); } catch (e) { fail++; console.log('  ERROR ' + name + ': ' + (e && e.message)); }
    };

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    );
    // The wall only tiles designs that HAVE images: serve the seed images.
    await page.route('**/sp-img*.png', (route) =>
        route.fulfill({ contentType: 'image/png', body: PNG }));

    // Seed the design store + a fresh-design handoff (single payload object).
    await page.addInitScript((seed) => {
        localStorage.setItem('drawboard.designs', JSON.stringify([seed.withRaw, seed.legacy]));
        const handoff = { [seed.fresh.id]: seed.fresh };
        localStorage.setItem('drawboard.handoff', JSON.stringify(handoff));
    }, { withRaw: PROMPT_WITH_RAW, legacy: PROMPT_LEGACY, fresh: FRESH_HANDOFF });

    const openShowPrompt = async () => {
        await page.locator('[data-testid="show-prompt-button"]').click();
        await page.waitForTimeout(300);
    };
    // RN-web renders (read-only) TextInput as <textarea>: the content is the
    // element's value, not its DOM text.
    const paneText = (id) => page.evaluate(
        (tid) => document.querySelector(`[data-testid="${tid}"]`)?.value ?? '', id);
    const enhancedJson = async () => {
        try { return JSON.parse(await paneText('prompt-enhanced')); } catch (e) { return null; }
    };

    // ================= S1: saved design WITH raw prompt =================
    await section('S1 saved design (with raw prompt)', async () => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        // Open the saved design via the Recent Designs image wall.
        await page.locator('[data-testid="nav-recent-designs"]').click();
        await page.waitForTimeout(400);
        await page.locator('[data-testid="wall-tile-sp-new"]').click();
        await page.waitForTimeout(800);

        // Button row: Show Prompt sits right of Download Image.
        const dl = await page.locator('[data-testid="download-image-button"]').boundingBox();
        const sp = await page.locator('[data-testid="show-prompt-button"]').boundingBox();
        ok(dl && sp && sp.x >= dl.x + dl.width, 'Show Prompt button right of Download Image');

        await openShowPrompt();
        ok(await page.locator('[data-testid="prompt-original"]').count() === 1
            && await page.locator('[data-testid="prompt-enhanced"]').count() === 1,
            'dialog opens with both panes');
        ok((await paneText('prompt-original')).trim()
            === 'a cat riding a bicycle on the moon',
            'left pane shows the original prompt verbatim');
        const json = await enhancedJson();
        ok(json && json.high_level_description === 'Cat bicycle design'
            && Array.isArray(json.compositional_deconstruction?.elements),
            'right pane shows the refined structured JSON');
        await page.screenshot({ path: 'temp/shot_show_prompt.png' });
        // Both panes are read-only (editable=false → readonly attribute).
        const locked = await page.evaluate(() => {
            const els = ['prompt-original', 'prompt-enhanced']
                .map((id) => document.querySelector(`[data-testid="${id}"]`));
            return els.every((el) => el && (el.readOnly || el.disabled));
        });
        ok(locked, 'both panes are read-only');
        await page.locator('[data-testid="prompt-dialog-close"]').click();
        await page.waitForTimeout(200);
        ok(await page.locator('[data-testid="prompt-original"]').count() === 0, 'X closes the dialog');
    });

    // ================= S2: legacy saved design (no raw prompt) =================
    await section('S2 saved design (legacy, no raw prompt)', async () => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        // Open the legacy design via the Recent Designs image wall.
        await page.locator('[data-testid="nav-recent-designs"]').click();
        await page.waitForTimeout(400);
        await page.locator('[data-testid="wall-tile-sp-legacy"]').click();
        await page.waitForTimeout(800);

        await openShowPrompt();
        ok((await paneText('prompt-original')).trim() === '',
            'left pane empty when no original prompt was recorded');
        const json = await enhancedJson();
        ok(json && json.high_level_description === 'Legacy design no raw prompt',
            'right pane still shows the structured JSON');
        await page.screenshot({ path: 'temp/shot_show_prompt_legacy.png' });
        await page.locator('[data-testid="prompt-dialog-close"]').click();
        await page.waitForTimeout(200);
    });

    // ================= S3: fresh design via handoff (Start Design path) =================
    await section('S3 fresh design (handoff from Start Design)', async () => {
        await page.goto(`${BASE}/design?id=${FRESH_HANDOFF.id}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);

        await openShowPrompt();
        ok((await paneText('prompt-original')).trim() === 'fresh idea text',
            'left pane shows the fresh design\'s original prompt');
        const json = await enhancedJson();
        ok(json && json.high_level_description === 'Fresh handoff design'
            && json.compositional_deconstruction?.elements?.[0]?.text === 'Hello',
            'right pane shows the fresh design\'s structured JSON');
        await page.screenshot({ path: 'temp/shot_show_prompt_fresh.png' });
    });

    // ================= S4: bare /design — no data, button disabled =================
    await section('S4 bare /design (no data)', async () => {
        await page.goto(BASE + '/design', { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        // RN-web's disabled TouchableOpacity renders aria-disabled="true".
        const disabled = await page.locator('[data-testid="show-prompt-button"]')
            .evaluate((el) => el.getAttribute('aria-disabled') === 'true');
        ok(disabled, 'Show Prompt disabled without refinedData');
    });

    await browser.close();
    console.log(`\n${pass}/${pass + fail} checks passed`);
    process.exit(fail > 0 ? 1 : 0);
})();
