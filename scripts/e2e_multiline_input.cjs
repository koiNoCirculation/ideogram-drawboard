/**
 * E2E: the home prompt input is multiline and the prompt bar auto-grows.
 *  - the prompt input is a multiline textarea; Enter inserts a newline;
 *  - a single line keeps the capsule at 56px;
 *  - wrapped multiline text grows the bar (computed height > 56) up to a
 *    200px cap, beyond which the text scrolls inside the bar;
 *  - shrinking the text shrinks the bar back to 56px.
 *
 * Run against `expo start --web` on :8081. Screenshots -> ./temp.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const MIN_BAR = 56;
const MAX_BAR = 200;

const barHeight = (page) =>
    page.locator('[data-testid="prompt-dropzone"]').evaluate((el) => parseFloat(getComputedStyle(el).height));

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
    const newPage = async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        return { page, errors };
    };

    // ============ S1: multiline input, Enter inserts a newline ============
    await section('S1 prompt input is multiline; Enter makes a new line', async () => {
        const { page, errors } = await newPage();
        const isTextarea = await page.locator('[data-testid="prompt-input"]').evaluate((el) => el.tagName === 'TEXTAREA');
        ok(isTextarea, 'prompt input renders as a multiline textarea');
        ok(await barHeight(page) === MIN_BAR, `single-line state: bar height is ${MIN_BAR}px`);

        await page.locator('[data-testid="prompt-input"]').click();
        await page.keyboard.type('line one');
        await page.keyboard.press('Enter');
        await page.keyboard.type('line two');
        await page.keyboard.press('Enter');
        await page.keyboard.type('line three');
        const value = await page.locator('[data-testid="prompt-input"]').inputValue();
        ok(value === 'line one\nline two\nline three', 'Enter inserts newlines (value keeps them)');
        const h = await barHeight(page);
        ok(h > MIN_BAR && h <= MAX_BAR, `three lines grow the bar to ${Math.round(h)}px`);
        await page.screenshot({ path: path.join(TEMP, 'shot_multiline_input.png') });
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ============ S2: long text caps at 200px and scrolls ================
    await section('S2 long text caps the bar at 200px, text scrolls', async () => {
        const { page, errors } = await newPage();
        const longText = Array.from({ length: 40 }, (_, i) => `description line ${i + 1} with some extra words to wrap`).join('\n');
        await page.locator('[data-testid="prompt-input"]').fill(longText);
        await page.waitForTimeout(400);
        const h = await barHeight(page);
        ok(h === MAX_BAR, `bar height capped at ${MAX_BAR}px (got ${Math.round(h)})`);
        const scroll = await page.locator('[data-testid="prompt-input"]').evaluate((el) => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            overflowY: getComputedStyle(el).overflowY,
        }));
        ok(scroll.scrollHeight > scroll.clientHeight,
            `content taller than the bar scrolls (scrollHeight ${scroll.scrollHeight} > clientHeight ${scroll.clientHeight}, overflowY=${scroll.overflowY})`);
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ============ S3: clearing shrinks the bar back to 56px ==============
    await section('S3 shrinking the text shrinks the bar back', async () => {
        const { page, errors } = await newPage();
        await page.locator('[data-testid="prompt-input"]').fill('a\nb\nc\nd\ne');
        await page.waitForTimeout(300);
        ok(await barHeight(page) > MIN_BAR, 'multi-line text grows the bar');
        await page.locator('[data-testid="prompt-input"]').fill('one line');
        await page.waitForTimeout(300);
        ok(await barHeight(page) === MIN_BAR, 'back to a single line: bar is 56px again');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('MULTILINE-INPUT E2E ERROR:', e); process.exit(1); });
