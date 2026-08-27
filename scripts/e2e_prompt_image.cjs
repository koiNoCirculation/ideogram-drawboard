/**
 * E2E: home page prompt bar accepts reference images from DRAG-AND-DROP and
 * the CLIPBOARD (Ctrl+V).
 *  - dropped/pasted image/* content converts to base64 data URIs and shows
 *    as small previews between the W/H row and the input bar (removable);
 *  - non-image files are ignored; a text-only paste is NOT consumed (the
 *    input's default text insertion still works);
 *  - dragging over the bar highlights it (blue border), leaving resets it;
 *  - on submit, the refine request carries the image(s) in the vLLM
 *    "image inputs" multimodal format (content array: text part + image_url
 *    parts with the data URIs); without images the content stays a plain
 *    string (back-compat).
 *
 * Synthetic drops are dispatched in-page with `new DragEvent(...)` (its
 * init takes dataTransfer); synthetic pastes with `new ClipboardEvent(...)`
 * (init takes clipboardData). S6 additionally exercises the REAL trusted
 * Ctrl+V path via the async Clipboard API (writeText / ClipboardItem).
 *
 * Run against `expo start --web` on :8081. Screenshots -> ./temp.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URI = `data:image/png;base64,${PNG_B64}`;
const BLUE = 'rgb(0, 122, 255)';
const GREY = 'rgb(221, 221, 221)';

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

const mkSettings = () => ({
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
    imageProvider: 'Custom',
    imageEndpoint: 'http://localhost:8000',
    imageSecretKey: 'img-key',
});

async function newPage(browser, settings) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    if (settings) {
        await page.addInitScript((s) => {
            if (s && !localStorage.getItem('drawboard.settings'))
                localStorage.setItem('drawboard.settings', JSON.stringify(s));
        }, settings);
    }
    return { page, errors };
}

// Dispatch a synthetic DragEvent on the prompt bar carrying the given files
// ([name, base64, type] triples) — the same native event a real drop fires.
async function dropFiles(page, files, type = 'drop') {
    return page.evaluate(([list, evType]) => {
        const dt = new DataTransfer();
        for (const [name, b64, mime] of list) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            dt.items.add(new File([bytes], name, { type: mime }));
        }
        const el = document.querySelector('[data-testid="prompt-dropzone"]');
        el.dispatchEvent(new DragEvent(evType, { dataTransfer: dt, bubbles: true, cancelable: true }));
        return true;
    }, [files, type]);
}

// Dispatch a synthetic ClipboardEvent('paste') on the prompt input carrying
// the given files ([name, base64, type] triples) and/or a text/plain item.
// Returns true when the app consumed the paste (preventDefault), i.e. image
// content was present.
async function pasteClipboard(page, files, text) {
    return page.evaluate(([list, text]) => {
        const dt = new DataTransfer();
        if (text !== null && text !== undefined) dt.setData('text/plain', text);
        for (const [name, b64, mime] of list) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            dt.items.add(new File([bytes], name, { type: mime }));
        }
        const el = document.querySelector('[data-testid="prompt-input"]');
        const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        return !el.dispatchEvent(evt);
    }, [files, text]);
}

const barBorder = (page) =>
    page.locator('[data-testid="prompt-dropzone"]').evaluate((el) => getComputedStyle(el).borderTopColor);
// Preview item Views only (the ^ prefix would also match the remove buttons).
const previews = (page) =>
    page.locator('[data-testid^="image-preview-"]:not([data-testid^="image-preview-remove-"])');

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

    // ================= S1: drop a PNG -> preview below W/H, above bar =====
    await section('S1 drop an image: preview shown and removable', async () => {
        const { page, errors } = await newPage(browser, null);
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        ok((await previews(page).count()) === 0, 'no previews before any drop');
        ok(await barBorder(page) === GREY, 'drop zone border idle (grey)');

        await dropFiles(page, [['ref.png', PNG_B64, 'image/png']]);
        await page.waitForSelector('[data-testid="image-preview-0"] img', { timeout: 5000 });
        const src = await page.locator('[data-testid="image-preview-0"] img').getAttribute('src');
        ok(src === PNG_DATA_URI, 'preview renders the dropped image data URI');

        const whBox = await page.locator('input[data-testid="height-input"]').boundingBox();
        const barBox = await page.locator('[data-testid="prompt-dropzone"]').boundingBox();
        const prevBox = await page.locator('[data-testid="image-preview-0"]').boundingBox();
        ok(prevBox.y > whBox.y && prevBox.y < barBox.y,
            `preview row positioned below W/H and above the input bar (${Math.round(prevBox.y)} between ${Math.round(whBox.y)} and ${Math.round(barBox.y)})`);
        await page.screenshot({ path: path.join(TEMP, 'shot_prompt_image_preview.png') });

        // A second drop appends; the remove button drops its preview and
        // the list re-indexes (the second image slides down to index 0).
        await dropFiles(page, [['ref2.png', PNG_B64, 'image/png']]);
        await page.waitForSelector('[data-testid="image-preview-1"] img', { timeout: 5000 });
        ok((await previews(page).count()) === 2, 'second drop appends a second preview');
        await page.locator('[data-testid="image-preview-remove-0"]').click();
        await page.waitForTimeout(300);
        ok((await previews(page).count()) === 1, 'remove button drops one preview');
        ok((await page.locator('[data-testid="image-preview-0"] img').count()) === 1,
            'the remaining image re-indexes to 0');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S2: non-image files are ignored ===================
    await section('S2 drop a non-image file: ignored', async () => {
        const { page, errors } = await newPage(browser, null);
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        const txtB64 = Buffer.from('just some notes').toString('base64');
        await dropFiles(page, [['notes.txt', txtB64, 'text/plain']]);
        await page.waitForTimeout(500);
        ok((await previews(page).count()) === 0, 'text file produces no preview');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S3: dragover highlight ============================
    await section('S3 dragover highlights the drop zone, dragleave resets', async () => {
        const { page, errors } = await newPage(browser, null);
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await dropFiles(page, [['ref.png', PNG_B64, 'image/png']], 'dragover');
        await page.waitForTimeout(200);
        ok(await barBorder(page) === BLUE, 'dragover: border turns blue');
        await dropFiles(page, [], 'dragleave');
        await page.waitForTimeout(200);
        ok(await barBorder(page) === GREY, 'dragleave: border back to grey');
        ok((await previews(page).count()) === 0, 'dragover alone adds no preview');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S4: submit with an image (multimodal request) =====
    await section('S4 submit with a reference image: image_url in the refine request', async () => {
        const { page, errors } = await newPage(browser, mkSettings());
        const llmBodies = [];
        await page.route('**/v1/chat/completions', (route) => {
            llmBodies.push(JSON.parse(route.request().postData() || '{}'));
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ choices: [{ message: { content: VALID_PROMPT } }] }),
            });
        });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await dropFiles(page, [['ref.png', PNG_B64, 'image/png']]);
        await page.waitForSelector('[data-testid="image-preview-0"] img', { timeout: 5000 });
        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();
        await page.waitForURL('**/design**', { timeout: 15000 });

        ok(llmBodies.length === 1, 'exactly 1 refine call');
        const content = llmBodies[0]?.messages?.[1]?.content;
        ok(Array.isArray(content), 'user message content is a multimodal array');
        ok(content?.[0]?.type === 'text' && content[0].text.includes('User idea: a test dog'),
            'first part is the text prompt');
        ok(JSON.stringify(content?.[1]) === JSON.stringify({ type: 'image_url', image_url: { url: PNG_DATA_URI } }),
            'second part is the dropped image as image_url (data URI verbatim)');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S5: submit without an image (back-compat) =========
    await section('S5 submit without an image: content stays a plain string', async () => {
        const { page, errors } = await newPage(browser, mkSettings());
        const llmBodies = [];
        await page.route('**/v1/chat/completions', (route) => {
            llmBodies.push(JSON.parse(route.request().postData() || '{}'));
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ choices: [{ message: { content: VALID_PROMPT } }] }),
            });
        });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await page.locator('[data-testid="prompt-input"]').fill('a test dog');
        await page.locator('[data-testid="start-design-button"]').click();
        await page.waitForURL('**/design**', { timeout: 15000 });

        ok(typeof llmBodies[0]?.messages?.[1]?.content === 'string', 'no images -> plain string content (unchanged wire format)');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S6: paste from the clipboard (multimodal) =========
    await section('S6 paste: clipboard image -> preview, text passes through', async () => {
        // A real Ctrl+V needs clipboard permissions, so use an explicit
        // context (browser.newPage's implicit one can't grant them).
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
        const page = await context.newPage();
        const errors = [];
        page.on('dialog', (d) => d.dismiss().catch(() => {}));
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        // Synthetic image paste: consumed by the app, becomes a preview.
        const consumed = await pasteClipboard(page, [['clip.png', PNG_B64, 'image/png']], null);
        await page.waitForSelector('[data-testid="image-preview-0"] img', { timeout: 5000 });
        ok(consumed === true, 'image paste is consumed (preventDefault)');
        ok((await previews(page).count()) === 1, 'pasted clipboard image shows as a preview');
        ok((await page.locator('[data-testid="image-preview-0"] img').getAttribute('src')) === PNG_DATA_URI,
            'preview renders the pasted image data URI');

        // Synthetic text-only paste: NOT consumed, no preview.
        const consumedText = await pasteClipboard(page, [], 'hello text');
        await page.waitForTimeout(300);
        ok(consumedText === false, 'text-only paste is not consumed (input default kept)');
        ok((await previews(page).count()) === 1, 'text-only paste adds no preview');

        // REAL trusted text paste (Ctrl+V) still inserts text.
        await page.evaluate(() => navigator.clipboard.writeText('pasted text'));
        await page.locator('[data-testid="prompt-input"]').click();
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(300);
        const value = await page.locator('[data-testid="prompt-input"]').inputValue();
        ok(value.includes('pasted text'), 'real Ctrl+V inserts text into the prompt');
        ok((await previews(page).count()) === 1, 'real text paste adds no preview');

        // REAL trusted image paste (ClipboardItem + Ctrl+V) appends a preview.
        await page.evaluate((b64) => {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const item = new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) });
            return navigator.clipboard.write([item]);
        }, PNG_B64);
        await page.locator('[data-testid="prompt-input"]').click();
        await page.keyboard.press('Control+V');
        await page.waitForSelector('[data-testid="image-preview-1"] img', { timeout: 5000 });
        ok((await previews(page).count()) === 2, 'real Ctrl+V of a clipboard image appends a preview');
        // The OS clipboard re-encodes PNG bytes (Chromium decodes + rewrites
        // the container), so compare the DECODED pixels, not the raw bytes.
        const pastedSrc = await page.locator('[data-testid="image-preview-1"] img').getAttribute('src');
        const [origImg, pastedImg] = await page.evaluate(([a, b]) => {
            const decode = (uri) => new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve({ w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) });
                };
                img.onerror = () => resolve(null);
                img.src = uri;
            });
            return Promise.all([decode(a), decode(b)]);
        }, [PNG_DATA_URI, pastedSrc]);
        ok(pastedImg !== null && pastedImg.w === origImg.w && pastedImg.h === origImg.h &&
            JSON.stringify(pastedImg.data) === JSON.stringify(origImg.data),
            'pasted clipboard image decodes to identical pixels');
        await page.screenshot({ path: path.join(TEMP, 'shot_prompt_image_paste.png') });
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await context.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('PROMPT-IMAGE E2E ERROR:', e); process.exit(1); });
