/**
 * E2E for the home page's provider-dependent size picker (run against
 * `expo start --web` on :8081).
 * Official image provider: the resolution must be one of the fixed official
 * list — TWO rows of pills (row 1 = aspect ratios, row 2 = the selected
 * ratio's resolutions), no W/H inputs. Custom provider: the preset ratio
 * pills + the free W/H inputs (unchanged behavior).
 *   S1 Official default: 23 ratio pills, no W/H inputs; the page default
 *      4:3 1024x768 is snapped to 1152x864 (nearest official 4:3 size)
 *   S2 ratio pill 16:9 -> row 2 = [2560x1440, 1280x720], the LARGEST active
 *   S3 resolution pill 1280x720 -> submit: the LLM request carries
 *      "TARGET IMAGE ASPECT RATIO: 16:9" and the handoff size is 1280x720
 *   S4 settings: provider -> Custom -> save: preset pills + W/H inputs back,
 *      the official size (1152x864) kept in the inputs, ratio on 'custom'
 *   S5 settings: provider -> Official again -> save: W/H inputs gone, the
 *      official size 1152x864 kept as the active 4:3 resolution
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8081';

const PROMPT = {
    aspect_ratio: '16:9',
    high_level_description: 'Official resolution test scene.',
    style_description: {
        aesthetics: 'clean',
        lighting: 'even',
        medium: 'photograph',
        photo: '85mm',
        color_palette: ['#1A1A2E'],
    },
    compositional_deconstruction: {
        background: 'A plain studio backdrop.',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'A cat sitting in the center.' }],
    },
};

const mkSettings = (overrides = {}) => ({
    llmProvider: 'vLLM',
    llmProfiles: {
        OpenAI: { endpoint: '', secretKey: '', name: '' },
        Google: { endpoint: '', secretKey: '', name: '' },
        DeepSeek: { endpoint: '', secretKey: '', name: '' },
        GLM: { endpoint: '', secretKey: '', name: '' },
        Qwen: { endpoint: '', secretKey: '', name: '' },
        vLLM: { endpoint: 'http://localhost:8000/v1', secretKey: '', name: 'mock-model' },
        SGLang: { endpoint: '', secretKey: '', name: '' },
        Ollama: { endpoint: '', secretKey: '', name: '' },
    },
    imageProvider: 'Official',
    imageEndpoint: '',
    imageSecretKey: 'idk-e2e',
    ...overrides,
});

let pass = 0;
let fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  OK   ${label}`); }
    else { fail++; console.log(`  FAIL ${label}`); }
}
async function section(name, fn) {
    console.log(`\n== ${name} ==`);
    await fn();
}

// Seed localStorage then navigate (single-payload evaluate). The first goto
// may trigger a cold Metro compile — generous timeouts, and only the second
// (app-ready) load needs networkidle.
async function gotoSeeded(page, settings) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate((s) => localStorage.setItem('drawboard.settings', JSON.stringify(s)), settings);
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
}

// A pill is "active" when its (static-style) background is the accent blue.
const pillActive = (page, testID) => page
    .locator(`[data-testid="${testID}"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor === 'rgb(0, 122, 255)');

// Switch the image provider in the settings dialog and save.
async function setImageProvider(page, provider) {
    await page.locator('[data-testid="settings-gear"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="image-provider-select"]').click();
    await page.waitForTimeout(200);
    await page.locator(`[data-testid="image-provider-option-${provider}"]`).click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="settings-save"]').click();
    await page.waitForTimeout(500);
}

(async () => {
    const browser = await chromium.launch();
    const pageErrors = [];

    // ---------- S1: Official default — two pill rows, no W/H, default snapped ----------
    await section('S1 Official default picker', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        p.on('pageerror', (e) => pageErrors.push(String(e)));
        await gotoSeeded(p, mkSettings());

        ok(await p.locator('[data-testid^="official-ratio-"]').count() === 23,
            'row 1 shows the 23 official aspect ratios');
        ok(await p.locator('[data-testid="official-ratio-16:9"]').count() === 1, 'has a 16:9 ratio pill');
        ok(await p.locator('[data-testid="official-ratio-9:23"]').count() === 1, 'has a 9:23 ratio pill');
        ok(await p.locator('[data-testid="official-ratio-1:3"]').count() === 1, 'has a 1:3 ratio pill');
        ok(await p.locator('input[data-testid="width-input"]').count() === 0, 'no width input (Official)');
        ok(await p.locator('input[data-testid="height-input"]').count() === 0, 'no height input (Official)');

        // The page default (4:3 1024x768) is not an official size -> snapped
        // to the nearest 4:3 resolution, 1152x864.
        ok(await pillActive(p, 'official-ratio-4:3'), 'default 4:3 ratio active');
        const resPills = p.locator('[data-testid^="official-resolution-"]');
        ok(await resPills.count() === 2, 'row 2 shows the 4:3 resolutions');
        const labels = [];
        for (let i = 0; i < await resPills.count(); i++) labels.push(await resPills.nth(i).textContent());
        ok(labels.join(',') === '2304x1728,1152x864', `row 2 = [2304x1728, 1152x864] (got ${labels.join(',')})`);
        ok(await pillActive(p, 'official-resolution-1152x864'), 'default resolution 1152x864 active');
        ok(await pillActive(p, 'official-resolution-2304x1728') === false, '2304x1728 not active');
        await p.close();
    });

    // ---------- S2: ratio pill 16:9 — row 2 follows, largest active ----------
    await section('S2 Official: select the 16:9 ratio', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        p.on('pageerror', (e) => pageErrors.push(String(e)));
        await gotoSeeded(p, mkSettings());
        await p.locator('[data-testid="official-ratio-16:9"]').click();
        await p.waitForTimeout(300);

        const resPills = p.locator('[data-testid^="official-resolution-"]');
        const labels = [];
        for (let i = 0; i < await resPills.count(); i++) labels.push(await resPills.nth(i).textContent());
        ok(labels.join(',') === '2560x1440,1280x720', `row 2 = [2560x1440, 1280x720] (got ${labels.join(',')})`);
        ok(await pillActive(p, 'official-resolution-2560x1440'), 'the largest 16:9 resolution is selected');
        await p.close();
    });

    // ---------- S3: resolution pill 1280x720 — submit uses 16:9 + that size ----------
    await section('S3 Official: select 1280x720 and submit', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        p.on('pageerror', (e) => pageErrors.push(String(e)));
        const llmCalls = [];
        await p.route('http://localhost:8000/v1/chat/completions', (route) => {
            llmCalls.push(route.request().postDataJSON());
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(PROMPT) } }] }),
            });
        });
        await gotoSeeded(p, mkSettings());

        await p.locator('[data-testid="official-ratio-16:9"]').click();
        await p.waitForTimeout(200);
        await p.locator('[data-testid="official-resolution-1280x720"]').click();
        await p.waitForTimeout(300);
        ok(await pillActive(p, 'official-resolution-1280x720'), '1280x720 active after click');

        await p.locator('[data-testid="prompt-input"]').fill('a cat poster');
        await p.locator('[data-testid="start-design-button"]').click();
        await p.waitForURL('**/design**', { timeout: 15000 });

        ok(llmCalls.length === 1, 'exactly one LLM refine request');
        const content = llmCalls[0]?.messages?.[1]?.content;
        ok(typeof content === 'string' && content.includes('TARGET IMAGE ASPECT RATIO: 16:9'),
            'LLM request carries the selected 16:9 ratio');
        const handoffSize = await p.evaluate(() => {
            const h = JSON.parse(localStorage.getItem('drawboard.handoff') || '{}');
            const v = Object.values(h)[0];
            return v ? v.size : null;
        });
        ok(handoffSize && handoffSize.width === 1280 && handoffSize.height === 720,
            `handoff size is 1280x720 (got ${JSON.stringify(handoffSize)})`);
        await p.close();
    });

    // ---------- S4: switch provider to Custom — W/H inputs back, size kept ----------
    await section('S4 switch to Custom via settings', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        p.on('pageerror', (e) => pageErrors.push(String(e)));
        await gotoSeeded(p, mkSettings());
        ok(await p.locator('[data-testid^="official-ratio-"]').count() === 23, 'starts in Official mode');

        await setImageProvider(p, 'Custom');

        ok(await p.locator('[data-testid="preset-ratio-row"]').count() === 1, 'preset ratio row back');
        ok(await p.locator('[data-testid="ratio-custom"]').count() === 1, 'custom ratio pill present');
        ok(await p.locator('[data-testid^="official-ratio-"]').count() === 0, 'official ratio row gone');
        ok(await p.locator('input[data-testid="width-input"]').count() === 1, 'width input back');
        ok(await p.locator('input[data-testid="height-input"]').count() === 1, 'height input back');
        // The official size (default-snapped 1152x864) is KEPT in the inputs.
        ok(await p.locator('input[data-testid="width-input"]').inputValue() === '1152', 'W kept at 1152');
        ok(await p.locator('input[data-testid="height-input"]').inputValue() === '864', 'H kept at 864');
        ok(await pillActive(p, 'ratio-custom'), "ratio parked on 'custom' (no preset reset)");

        // Custom mode: ratio is 'custom' -> W/H are independent (no linkage).
        await p.locator('input[data-testid="width-input"]').fill('800');
        await p.waitForTimeout(300);
        ok(await p.locator('input[data-testid="height-input"]').inputValue() === '864',
            'custom mode: W=800 does not recompute H (independent)');
        await p.close();
    });

    // ---------- S5: switch back to Official — the size is official, kept ----------
    await section('S5 switch back to Official', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        p.on('pageerror', (e) => pageErrors.push(String(e)));
        await gotoSeeded(p, mkSettings({ imageProvider: 'Custom', imageEndpoint: 'http://127.0.0.1:8000' }));
        // Pick a W/H that is ALSO an official resolution (1280x720); use the
        // 'custom' ratio so the preset linkage doesn't recompute the values.
        await p.locator('[data-testid="ratio-custom"]').click();
        await p.waitForTimeout(200);
        await p.locator('input[data-testid="width-input"]').fill('1280');
        await p.locator('input[data-testid="height-input"]').fill('720');
        await p.waitForTimeout(300);

        await setImageProvider(p, 'Official');

        ok(await p.locator('input[data-testid="width-input"]').count() === 0, 'width input gone again');
        ok(await p.locator('input[data-testid="height-input"]').count() === 0, 'height input gone again');
        ok(await pillActive(p, 'official-ratio-16:9'), '16:9 ratio active (1280x720 is official)');
        ok(await pillActive(p, 'official-resolution-1280x720'), '1280x720 kept as the active resolution');
        await p.close();
    });

    ok(pageErrors.length === 0, `no page errors (${pageErrors.join(' | ') || 'none'})`);

    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
