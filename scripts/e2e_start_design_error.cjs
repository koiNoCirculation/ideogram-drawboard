/**
 * E2E: home page "Start Design" — a misconfigured LLM endpoint must surface
 * as a RED error line above the prompt bar (testID refine-error). Alert.alert
 * is a no-op on web, so previously a bad endpoint showed nothing at all.
 *
 *  S1: unreachable endpoint (connection refused) -> red line "Failed to
 *      fetch"; the line PERSISTS past the 5s transient window (final
 *      failures are not auto-dismissed); fixing the endpoint in localStorage
 *      and re-clicking clears the old error and navigates to /design.
 *  S2: endpoint answers HTTP 500 -> red line "LLM API Error (500): …",
 *      exactly 1 LLM call, no navigation.
 *  S3: empty self-hosted endpoint -> red line "Missing settings: LLM
 *      endpoint …", NO LLM request leaving the page, no navigation.
 *  S4: endpoint answers but with malformed JSON on every attempt -> red line
 *      "The LLM returned invalid JSON on every attempt." after exactly 3
 *      calls, no navigation.
 *
 * Run against `expo start --web` on :8081. Screenshots -> ./temp.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const RED = 'rgb(229, 57, 53)'; // refineErrorText color

const VALID_PROMPT = JSON.stringify({
    aspect_ratio: '4:3',
    high_level_description: 'A test scene.',
    style_description: {
        aesthetics: 'clean', lighting: 'even', medium: 'photograph',
        photo: '35mm', color_palette: ['#111111'],
    },
    compositional_deconstruction: {
        background: 'A plain backdrop.',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'A golden retriever sitting in the center.' }],
    },
});

const mkSettings = (vllm) => ({
    llmProvider: 'vLLM',
    llmProfiles: {
        OpenAI: { endpoint: '', secretKey: '', name: '' },
        Google: { endpoint: '', secretKey: '', name: '' },
        DeepSeek: { endpoint: '', secretKey: '', name: '' },
        GLM: { endpoint: '', secretKey: '', name: '' },
        Qwen: { endpoint: '', secretKey: '', name: '' },
        vLLM: vllm,
        SGLang: { endpoint: '', secretKey: '', name: '' },
        Ollama: { endpoint: '', secretKey: '', name: '' },
    },
    imageProvider: 'Custom',
    imageEndpoint: 'http://localhost:8000',
    imageSecretKey: 'img-key',
});

async function newPage(browser, settings) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    // RN-web's Alert.alert is a no-op on web; auto-dismiss any native dialog
    // just in case so it can never block a step.
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.addInitScript((s) => {
        if (s && !localStorage.getItem('drawboard.settings'))
            localStorage.setItem('drawboard.settings', JSON.stringify(s));
    }, settings);
    return { page, errors };
}

const errorLine = (page) => page.locator('[data-testid="refine-error"]');

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

    // ================= S1: unreachable endpoint (connection refused) =====
    await section('S1 unreachable endpoint: red error, persists, recovers', async () => {
        // Port 59999 is not listening: fetch rejects with "Failed to fetch".
        const { page, errors } = await newPage(browser,
            mkSettings({ endpoint: 'http://127.0.0.1:59999/v1', secretKey: '', name: 'mock-model' }));
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        ok((await errorLine(page).count()) === 0, 'no error line before the first attempt');

        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();

        await page.waitForSelector('[data-testid="refine-error"]', { timeout: 15000 });
        const text1 = await errorLine(page).textContent();
        ok(text1.includes('Failed to fetch'), `red line shows the fetch failure ("${text1}")`);
        const borderColor = await errorLine(page).evaluate((el) => getComputedStyle(el).borderTopColor);
        ok(borderColor === RED, `error line carries the red style (${borderColor})`);
        ok(!page.url().includes('/design'), 'no navigation on LLM failure');
        ok((await page.locator('[data-testid="start-design-button"] svg').count()) === 1,
            'send button re-enabled after the failure (arrow, not spinner)');
        await page.screenshot({ path: path.join(TEMP, 'shot_start_design_error_s1.png') });

        // Final failures persist: still visible well past the 5s transient
        // window (a misconfigured endpoint won't fix itself in 5s).
        await page.waitForTimeout(6000);
        ok((await errorLine(page).count()) === 1,
            'error line persists past the 5s auto-dismiss window');

        // Recovery: point the active profile at a reachable, mocked endpoint
        // (settings are re-read from localStorage on every click) and retry.
        await page.route('**/v1/chat/completions', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ choices: [{ message: { content: VALID_PROMPT } }] }),
        }));
        await page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem('drawboard.settings'));
            s.llmProfiles.vLLM.endpoint = 'http://localhost:8000/v1';
            localStorage.setItem('drawboard.settings', JSON.stringify(s));
        });
        await page.locator('[data-testid="start-design-button"]').click();
        await page.waitForURL('**/design**', { timeout: 10000 });
        ok(page.url().includes('/design'), 'fixed endpoint -> navigates to /design');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S2: HTTP 500 from the endpoint ===================
    await section('S2 HTTP 500 from the LLM endpoint', async () => {
        const { page, errors } = await newPage(browser,
            mkSettings({ endpoint: 'http://localhost:8000/v1', secretKey: '', name: 'mock-model' }));
        let llmCalls = 0;
        await page.route('**/v1/chat/completions', (route) => {
            llmCalls++;
            return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();

        await page.waitForSelector('[data-testid="refine-error"]', { timeout: 15000 });
        const text = await errorLine(page).textContent();
        ok(text.includes('LLM API Error (500)'), `red line shows the HTTP error ("${text}")`);
        ok(text.includes('boom'), 'red line carries the response body detail');
        ok(llmCalls === 1, 'exactly 1 LLM call before the error');
        ok(!page.url().includes('/design'), 'no navigation on HTTP error');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S3: empty self-hosted endpoint ===================
    await section('S3 missing (empty) LLM endpoint', async () => {
        const { page, errors } = await newPage(browser,
            mkSettings({ endpoint: '', secretKey: '', name: 'mock-model' }));
        const llmReqs = [];
        page.on('request', (r) => {
            if (/chat\/completions|api\/chat/.test(r.url())) llmReqs.push(r.url());
        });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();

        await page.waitForSelector('[data-testid="refine-error"]', { timeout: 15000 });
        const text = await errorLine(page).textContent();
        ok(text.includes('Missing settings:'), `red line names the problem ("${text}")`);
        ok(text.includes('LLM endpoint'), 'red line names the missing LLM endpoint');
        await page.waitForTimeout(300);
        ok(llmReqs.length === 0, 'no LLM request sent when the endpoint is missing');
        ok(!page.url().includes('/design'), 'no navigation on missing endpoint');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S4: malformed JSON on every attempt ===============
    await section('S4 invalid JSON on all 3 attempts', async () => {
        const { page, errors } = await newPage(browser,
            mkSettings({ endpoint: 'http://localhost:8000/v1', secretKey: '', name: 'mock-model' }));
        let llmCalls = 0;
        // A well-formed chat response whose CONTENT is not JSON.
        await page.route('**/v1/chat/completions', (route) => {
            llmCalls++;
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ choices: [{ message: { content: 'definitely not json' } }] }),
            });
        });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();

        await page.waitForSelector('[data-testid="refine-error"]', { timeout: 15000 });
        // The final (persistent) message replaces the transient "retrying".
        await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="refine-error"]');
            return el && el.textContent.includes('on every attempt');
        }, null, { timeout: 15000 });
        const text = await errorLine(page).textContent();
        ok(text === 'The LLM returned invalid JSON on every attempt.', `red line shows the final failure ("${text}")`);
        ok(llmCalls === 3, 'exactly 3 refine attempts were made');
        ok(!page.url().includes('/design'), 'no navigation after all attempts failed');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.screenshot({ path: path.join(TEMP, 'shot_start_design_error_s4.png') });
        await page.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('START-DESIGN-ERROR E2E ERROR:', e); process.exit(1); });
