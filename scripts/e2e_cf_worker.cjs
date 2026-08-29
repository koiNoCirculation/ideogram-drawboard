/**
 * E2E for the image generation endpoints (run against `expo start --web` on
 * :8081). "Official" requests the bare root-relative path /v1/ideogram-v4/generate
 * with no host prefix (read-only in settings, resolved against the app's own
 * origin); the cf-worker CORS proxy (separate project) is used as a "Custom"
 * endpoint — the browser can't call api.ideogram.ai cross-origin, so that's
 * how generations run in practice with the worker.
 * The mock "worker" is a page.route interception; its CORS preflight responses
 * are what make the browser let the custom Api-Key header through.
 *   S1 settings dialog: Official shows the hardcoded path /v1/ideogram-v4/generate
 *      read-only; Custom editable (stored value survives switching), save persists
 *   S2 Custom + worker endpoint: generate POSTs to
 *      <worker>/v1/ideogram-v4/generate with the Api-Key header; image round-trips
 *      (note: page.route interception absorbs the CORS preflight — the real
 *      worker's OPTIONS handling is covered by that project's own tests)
 *   S3 Official: requests the bare path /v1/ideogram-v4/generate with no prefix
 *      (a stored endpoint is ignored; the request resolves on the app origin)
 *   S4 worker answers 401: red float shows the Settings-problem wording
 *   S5 worker returns a root-relative image_proxy url (what the real
 *      cf-worker rewrites data[].url to): the app fetches it from the WORKER
 *      origin, not its own
 *   S6 worker answers 422 with the official {"error": "…"} body (e.g. the
 *      prompt safety check): the float shows the upstream error text verbatim
 *      (replacing the generic friendly wording)
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8081';
const WORKER = 'http://cf-worker.mock:8443';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);
const DATA_URI = `data:image/png;base64,${PNG.toString('base64')}`;
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Api-Key, Authorization',
};

const PROMPT = {
    aspect_ratio: '4:3',
    high_level_description: 'Cf worker test scene.',
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

const DESIGN_ID = 'cfworker-design';
const IMG_PATH = '/cfe2e-img.png';

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
    imageSecretKey: 'idk-cf-e2e',
    ...overrides,
});

// Seed localStorage then navigate (single-payload evaluate — page functions
// can't see module-level variables).
async function gotoSeeded(page, url, payload) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(({ designId, settings, handoff }) => {
        if (settings) localStorage.setItem('drawboard.settings', JSON.stringify(settings));
        if (handoff) localStorage.setItem('drawboard.handoff', JSON.stringify({ [designId]: handoff }));
    }, { designId: DESIGN_ID, ...payload });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
}

const canvasImgSrc = (page) =>
    page.locator('[data-testid="design-canvas"] img').first().getAttribute('src');

(async () => {
    const browser = await chromium.launch();

    // ---------- S1: settings dialog — Official hardcoded read-only, Custom editable ----------
    await section('S1 settings dialog image endpoint', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await gotoSeeded(p, `${BASE}/`, { settings: mkSettings({ imageProvider: 'Custom', imageEndpoint: 'http://127.0.0.1:8000' }) });
        await p.locator('[data-testid="settings-gear"]').click();
        await p.waitForTimeout(300);
        const input = p.locator('[data-testid="settings-image-endpoint"]');
        // RN's editable={false} renders a DOM `readonly` attribute.
        const isReadOnly = (loc) => loc.evaluate((el) => el.readOnly || el.disabled);
        // Custom: value = the stored endpoint, placeholder = the local base.
        ok(await input.getAttribute('placeholder') === 'http://127.0.0.1:8000', 'Custom: placeholder is the local base');
        ok(await input.inputValue() === 'http://127.0.0.1:8000', 'Custom: shows the stored endpoint');
        ok(!(await isReadOnly(input)), 'Custom: field is editable');
        // Switch to Official: the HARDCODED official path shows read-only.
        await p.locator('[data-testid="image-provider-select"]').click();
        await p.locator('[data-testid="image-provider-option-Official"]').click();
        await p.waitForTimeout(200);
        ok(await input.inputValue() === '/v1/ideogram-v4/generate', 'Official: shows the hardcoded path');
        ok(await isReadOnly(input), 'Official: field is read-only (URL is hardcoded)');
        // Switch back to Custom: the stored endpoint is restored (the Official
        // display value did not overwrite it).
        await p.locator('[data-testid="image-provider-select"]').click();
        await p.locator('[data-testid="image-provider-option-Custom"]').click();
        await p.waitForTimeout(200);
        ok(await input.inputValue() === 'http://127.0.0.1:8000', 'Custom: stored endpoint restored after switching back');
        // Enter a worker URL and save — it must persist with the Custom provider.
        await input.fill('https://my-cf-worker.example.workers.dev/');
        await p.locator('[data-testid="settings-save"]').click();
        await p.waitForTimeout(300);
        const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('drawboard.settings')));
        ok(saved.imageProvider === 'Custom' && saved.imageEndpoint === 'https://my-cf-worker.example.workers.dev/',
            'save persists the worker endpoint with the Custom provider');
        await p.close();
    });

    // ---------- S2: Custom + worker endpoint — generate targets the worker ----------
    await section('S2 generate POSTs to <worker>/v1/ideogram-v4/generate', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const seen = { url: null, apiKey: null, contentType: null };
        await p.route(`${WORKER}/**`, (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') { return route.fulfill({ status: 204, headers: CORS }); }
            if (req.url().endsWith('/v1/ideogram-v4/generate')) {
                seen.url = req.url();
                seen.apiKey = req.headers()['api-key'] ?? null;
                seen.contentType = req.headers()['content-type'] ?? null;
                return route.fulfill({
                    contentType: 'application/json',
                    headers: CORS,
                    body: JSON.stringify({ data: [{ url: `${BASE}${IMG_PATH}` }] }),
                });
            }
            return route.fallback();
        });
        await p.route(`**${IMG_PATH}`, (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings({ imageProvider: 'Custom', imageEndpoint: WORKER }),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        ok(seen.url === `${WORKER}/v1/ideogram-v4/generate`, `generate targets the worker (${seen.url})`);
        ok(seen.apiKey === 'idk-cf-e2e', 'Api-Key header is sent to the worker');
        ok((seen.contentType || '').startsWith('multipart/form-data'), 'body stays a multipart form (unchanged)');
        ok(await canvasImgSrc(p) === DATA_URI, 'generated image persists and renders on the canvas');
        await p.close();
    });

    // ---------- S3: Official — the bare path, no prefix, app origin ----------
    await section('S3 Official requests the bare path with no prefix (app origin)', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const seen = { url: null, options: 0 };
        // Official has NO host prefix — the request is root-relative and resolves
        // against the app's own origin, so intercept the app origin's generate path.
        await p.route(`${BASE}/v1/ideogram-v4/generate`, (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') { seen.options++; return route.fulfill({ status: 204, headers: CORS }); }
            seen.url = req.url();
            return route.fulfill({
                contentType: 'application/json',
                headers: CORS,
                body: JSON.stringify({ data: [{ url: `${BASE}${IMG_PATH}` }] }),
            });
        });
        await p.route(`**${IMG_PATH}`, (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
        // A stored endpoint is IGNORED for Official — no prefix at all, the bare
        // root-relative path is requested on the app's own origin.
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings({ imageProvider: 'Official', imageEndpoint: 'http://ignored.example:9999' }),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        ok(seen.url === `${BASE}/v1/ideogram-v4/generate`,
            `Official requests the bare path on the app origin, ignoring the stored endpoint (${seen.url})`);
        ok(await canvasImgSrc(p) === DATA_URI, 'generated image persists and renders on the canvas');
        await p.close();
    });

    // ---------- S4: worker 401 -> Settings-problem float ----------
    await section('S4 worker 401 shows the Settings-problem float', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await p.route(`${WORKER}/**`, (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            if (req.url().endsWith('/v1/ideogram-v4/generate')) {
                return route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    headers: CORS,
                    body: JSON.stringify({ error: { message: 'invalid api key' } }),
                });
            }
            return route.fallback();
        });
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings({ imageProvider: 'Custom', imageEndpoint: WORKER }),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForSelector('[data-testid="error-float"]', { timeout: 15000 });
        const text = await p.locator('[data-testid="error-float"]').textContent();
        ok(text.includes('Settings problem'), `401 is framed as a settings problem ("${text}")`);
        ok(text.includes('status 401'), 'float carries the status code');
        ok(!text.includes('invalid api key'), 'float never leaks the upstream response body');
        ok(await p.locator('[data-testid="design-canvas"] img').count() === 0, 'no canvas image for the 401 generation');
        await p.close();
    });

    // ---------- S5: root-relative image_proxy url resolves against the worker ----------
    await section('S5 worker-relative image_proxy url fetches from the worker', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const seen = { appOriginImageFetches: 0, workerImageFetches: 0 };
        // A root-relative url fetched WITHOUT resolution would land on the app
        // origin (the dev server) — count those to prove it does not happen.
        await p.route(`${BASE}/**/image_proxy*`, (route) => {
            seen.appOriginImageFetches++;
            return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not on the app origin' });
        });
        await p.route(`${WORKER}/**`, (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            if (req.url().endsWith('/v1/ideogram-v4/generate')) {
                return route.fulfill({
                    contentType: 'application/json',
                    headers: CORS,
                    // What the real cf-worker returns: a ROOT-RELATIVE path on itself.
                    body: JSON.stringify({
                        data: [{ url: `/v1/ideogram-v4/image_proxy?url=${encodeURIComponent('https://upstream.test/a.png')}` }],
                    }),
                });
            }
            if (req.url().includes('/v1/ideogram-v4/image_proxy')) {
                seen.workerImageFetches++;
                return route.fulfill({ contentType: 'image/png', body: PNG, headers: CORS });
            }
            return route.fallback();
        });
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings({ imageProvider: 'Custom', imageEndpoint: WORKER }),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        ok(seen.workerImageFetches === 1, 'the image_proxy url was fetched from the WORKER origin');
        ok(seen.appOriginImageFetches === 0, 'no image fetch landed on the app origin');
        ok(await canvasImgSrc(p) === DATA_URI, 'proxied image persists and renders on the canvas');
        await p.close();
    });

    // ---------- S6: official {"error": "…"} body is surfaced verbatim ----------
    await section('S6 the official {"error": "…"} body text is shown in the float', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const SAFETY = 'Prompt provided failed safety check due to the inclusion of prohibited content.';
        await p.route(`${WORKER}/**`, (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            if (req.url().endsWith('/v1/ideogram-v4/generate')) {
                return route.fulfill({
                    status: 422,
                    contentType: 'application/json',
                    headers: CORS,
                    body: JSON.stringify({ error: SAFETY }),
                });
            }
            return route.fallback();
        });
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings({ imageProvider: 'Custom', imageEndpoint: WORKER }),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForSelector('[data-testid="error-float"]', { timeout: 15000 });
        const text = await p.locator('[data-testid="error-float"]').textContent();
        ok(text.includes(SAFETY), `float shows the upstream error text verbatim ("${text}")`);
        ok(!text.includes('Settings problem'), 'the generic settings wording is replaced, not kept');
        ok(!text.includes('status 422'), 'no status-code wording when the upstream text is shown');
        ok(await p.locator('[data-testid="design-canvas"] img').count() === 0, 'no canvas image for the 422 generation');
        await p.close();
    });

    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('CF_WORKER E2E ERROR:', e); process.exit(1); });
