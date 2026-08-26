/**
 * Full business-logic e2e regression for DrawBoard (run against `expo start --web` on :8081).
 * LLM + image-generation endpoints are mocked with page.route; localStorage is
 * seeded per page via addInitScript. Temporary file — not committed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8081';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const BASE_PROMPT = {
    aspect_ratio: '4:3',
    high_level_description: 'A test scene with a dog and a label.',
    style_description: {
        aesthetics: 'clean, minimal',
        lighting: 'even',
        medium: 'photograph',
        photo: '85mm',
        color_palette: ['#1a1a2e', '#F5A623'],
    },
    compositional_deconstruction: {
        background: 'A plain studio backdrop.',
        elements: [
            { type: 'obj', bbox: [100, 100, 400, 500], desc: 'A golden retriever sitting in the center.' },
            { type: 'text', bbox: [500, 100, 600, 900], text: 'HELLO', desc: 'A label reading HELLO on the right.' },
        ],
    },
};

const NORM_PROMPT = {
    aspect_ratio: '4:3',
    high_level_description: 'norm test',
    style_description: {
        aesthetics: 'a1',
        lighting: 'l1',
        photo: 'PHOTO SHOULD BE DROPPED',
        art_style: 'impressionist, pastel',
        medium: 'watercolor painting',
        color_palette: ['#abcdef', '12345', 'zzz', '#00FF00'],
    },
    compositional_deconstruction: {
        background: 'bg',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'a normalized object' }],
    },
};

const REWRITTEN_VLLM = JSON.stringify({
    ...BASE_PROMPT,
    compositional_deconstruction: {
        ...BASE_PROMPT.compositional_deconstruction,
        elements: [
            { type: 'obj', bbox: [100, 100, 400, 500], desc: 'REWRITTEN DESC' },
            { type: 'text', bbox: [500, 100, 600, 900], text: 'HELLO', desc: 'A label reading HELLO on the right.' },
        ],
    },
});
const REWRITTEN_OLLAMA = REWRITTEN_VLLM.replace('REWRITTEN DESC', 'OLLAMA REWRITE');
const REWRITE_SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '..', 'public', 'system_prompt_rewrite_adapt_bbox.txt'), 'utf8');

// Load the design page directly, the same way the home page now does: the
// prompt payload travels via the localStorage handoff (too big for URL query
// params — HTTP 431), the URL carries only the id.
const DIRECT_DESIGN_ID = 'reg-direct-design';
async function openDesign(page, prompt, size) {
    const [w, h] = size.split(',');
    await page.addInitScript(([id, p, w, h]) => {
        let map = {};
        try { map = JSON.parse(localStorage.getItem('drawboard.handoff') || '{}'); } catch (e) {}
        if (!map[id]) map[id] = { promptData: p, size: { width: Number(w), height: Number(h) } };
        localStorage.setItem('drawboard.handoff', JSON.stringify(map));
    }, [DIRECT_DESIGN_ID, JSON.stringify(prompt), w, h]);
    await page.goto(`${BASE}/design?id=${DIRECT_DESIGN_ID}`, { waitUntil: 'networkidle' });
}

// ---------- shared helpers ----------

const mkSettings = (over = {}) => ({
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
    imageSecretKey: 'img-key-123',
    ...over,
});

async function newPage(browser, { settings, designs } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const alerts = [];
    const errors = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.dismiss().catch(() => {}); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    if (settings || designs) {
        // Seed only when absent: addInitScript re-runs on every navigation
        // (incl. page.reload()) and would otherwise wipe what the page itself
        // saved to localStorage. Fresh newPage() contexts start empty, so the
        // first load always sees the seed.
        await page.addInitScript(([s, d]) => {
            if (s && !localStorage.getItem('drawboard.settings'))
                localStorage.setItem('drawboard.settings', JSON.stringify(s));
            if (d && !localStorage.getItem('drawboard.designs'))
                localStorage.setItem('drawboard.designs', JSON.stringify(d));
        }, [settings, designs]);
    }
    return { page, alerts, errors };
}

function parseMultipart(raw) {
    const out = {};
    const re = /Content-Disposition: form-data; name="([^"]+)"\r\n\r\n([\s\S]*?)(?=\r\n--|\r*$)/g;
    let m;
    while ((m = re.exec(raw))) out[m[1]] = m[2];
    return out;
}

/** Mock the LLM (OpenAI-dialect /chat/completions, Ollama /api/chat) and the
 *  Ideogram generate endpoint. Returns a request log for assertions. */
async function mockApis(page, { llmContent = null, genFail = false } = {}) {
    const log = { llm: [], gen: [] };
    const llmFulfill = (route, native) => {
        log.llm.push({
            url: route.request().url(),
            headers: route.request().headers(),
            body: JSON.parse(route.request().postData() || '{}'),
        });
        const content = llmContent || 'null';
        const payload = native
            ? { message: { content } }
            : { choices: [{ message: { content } }] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    };
    await page.route('**/v1/chat/completions', (route) => llmFulfill(route, false));
    await page.route('**/api/chat', (route) => llmFulfill(route, true));
    let genCount = 0;
    await page.route('**/v1/ideogram-v4/generate', async (route) => {
        const req = route.request();
        log.gen.push({
            url: req.url(),
            headers: req.headers(),
            form: parseMultipart(req.postData() || ''),
        });
        genCount += 1;
        if (genFail) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ data: [{ url: `${BASE}/regress-img-${genCount}.png` }] }),
        });
    });
    await page.route('**/regress-img-*.png', (route) =>
        route.fulfill({ contentType: 'image/png', body: PNG }));
    return log;
}

// Element boxes: the only VISIBLE divs with inline left/top/width/height
// (the canvas itself now carries those too, so exclude it by testID).
const boxes = (page) => page.locator('div[style*="left:"][style*="top:"][style*="width:"][style*="height:"]:visible:not([data-testid="design-canvas"])');
// The canvas itself (its frame wrapper — canvas + outward rulers — carries
// the margin:auto, so the testID is the stable canvas handle).
const canvasLoc = (page) => page.locator('[data-testid="design-canvas"]');

async function dragOn(page, x, y, dxPx, dyPx, beforeUp) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    // RN-web's PanResponder measures the gesture delta from the GRANT point,
    // which is where the +6px trigger move ends. The final target therefore
    // carries the +6 offset so the effective delta is exactly (dxPx, dyPx).
    await page.mouse.move(x + 6, y + 6, { steps: 2 });
    await page.mouse.move(x + 6 + dxPx, y + 6 + dyPx, { steps: 8 });
    if (beforeUp) await beforeUp();
    await page.mouse.up();
}

const boxCenter = (bb) => ({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });

/** box px position -> 0-1000 units relative to the canvas. */
async function boxUnits(page, box) {
    const [bb, cb] = await Promise.all([box.boundingBox(), canvasLoc(page).boundingBox()]);
    return {
        x: (bb.x - cb.x) / cb.width * 1000,
        y: (bb.y - cb.y) / cb.height * 1000,
        w: bb.width / cb.width * 1000,
        h: bb.height / cb.height * 1000,
    };
}

const toolStroke = (page, id) =>
    page.locator(`[data-testid="${id}"] svg`).first().evaluate((el) => getComputedStyle(el).stroke);
const BLUE = 'rgb(0, 122, 255)';
const GREY = 'rgb(204, 204, 204)';

// ---------- run ----------

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

    // ================= S1: home — ratios, dimensions, guards =================
    await section('S1 home: ratios / dimensions / guards', async () => {
        const { page } = await newPage(browser, {});
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const w = page.locator('input').nth(0);
        const h = page.locator('input').nth(1);

        // Waits for the W/H inputs to reach the expected values (React's
        // re-render after a ratio click is async; reading too early is flaky).
        const expectWH = async (wv, hv, name) => {
            try {
                await page.waitForFunction(([ew, eh]) => {
                    const i = document.querySelectorAll('input');
                    return i[0] && i[1] && i[0].value === ew && i[1].value === eh;
                }, [wv, hv], { timeout: 2000 });
                ok(true, name);
            } catch {
                ok(false, `${name} (got W=${await w.inputValue()} H=${await h.inputValue()})`);
            }
        };

        await expectWH('1024', '768', 'default 4:3 -> 1024x768');
        // Default UI locale is en-US, so the home page renders English chrome.
        ok(await page.getByText('No saved designs yet').count() === 1, 'empty recent-designs placeholder');

        await w.fill('800');
        await expectWH('800', '600', 'W=800 at 4:3 -> H=600');
        await page.getByText('16:9', { exact: true }).click();
        await expectWH('1024', '576', 'select 16:9 -> 1024x576');
        await page.getByText('3:4', { exact: true }).click();
        await expectWH('768', '1024', 'select 3:4 -> 768x1024 (height baseline)');
        await page.getByText('custom', { exact: true }).click();
        await expectWH('768', '1024', 'custom keeps last values');
        await w.fill('640');
        await expectWH('640', '1024', 'custom: W change does not link H');
        await h.fill('321');
        await expectWH('640', '321', 'custom: H change does not link W');

        // Guards: RN-web's Alert.alert is a no-op (no dialog reaches the
        // browser), so verify the block itself — no navigation and no LLM
        // request leaving the page.
        const reqs = [];
        page.on('request', (r) => {
            if (/chat\/completions|api\/chat/.test(r.url())) reqs.push(r.url());
        });
        await page.getByText('Start Design', { exact: true }).click();
        await page.waitForTimeout(400);
        ok(!page.url().includes('/design') && reqs.length === 0,
            'empty prompt blocks start (no navigation, no LLM request)');

        await page.locator('textarea').fill('hello world');
        await page.getByText('Start Design', { exact: true }).click();
        await page.waitForTimeout(400);
        ok(!page.url().includes('/design') && reqs.length === 0,
            'missing LLM settings block start (no navigation, no LLM request)');
        await page.close();
    });

    // ================= S2: home — start design with mocked LLM =================
    await section('S2 home: start design (mock LLM)', async () => {
        const { page } = await newPage(browser, { settings: mkSettings() });
        const log = await mockApis(page, { llmContent: JSON.stringify(BASE_PROMPT) });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        await page.locator('textarea').fill('a test dog');
        await page.getByText('Start Design', { exact: true }).click();
        await page.waitForURL('**/design**', { timeout: 10000 });
        await page.waitForTimeout(700);

        ok(log.llm.length === 1, 'exactly 1 LLM refine call');
        ok(log.llm[0]?.url === 'http://localhost:8000/v1/chat/completions', 'vLLM base + /chat/completions');
        ok(log.llm[0]?.body.model === 'mock-model', 'model from active profile');
        ok(log.llm[0]?.body.messages?.[1]?.content?.includes('TARGET IMAGE ASPECT RATIO: 4:3 (width:height)'), 'user msg carries ratio');
        ok(log.llm[0]?.body.messages?.[1]?.content?.includes('User idea: a test dog'), 'user msg carries prompt');
        ok(!log.llm[0]?.headers['authorization'], 'no Authorization header with empty key');
        ok(await boxes(page).count() === 2, 'design page renders the refined elements');
        await page.close();
    });

    // ================= S3: settings dialog =================
    await section('S3 settings dialog', async () => {
        const settings = mkSettings({
            llmProfiles: {
                ...mkSettings().llmProfiles,
                SGLang: { endpoint: '', secretKey: 'sg-key', name: 'sg-model' },
            },
        });
        const { page } = await newPage(browser, { settings });
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await page.locator('[data-testid="settings-gear"]').click();
        await page.waitForTimeout(300);
        ok(await page.getByText('Settings', { exact: true }).count() === 1, 'dialog opens');

        const llmEp = page.locator('input[placeholder="http://localhost:8000/v1"]');
        const llmKey = page.locator('input[placeholder="sk-..."]');
        const llmName = page.locator('input[placeholder="gpt-4o"]');
        const imgEp = page.locator('input[placeholder="http://127.0.0.1:8000"]');
        const pick = async (id, opt) => {
            await page.locator(`[data-testid="${id}-select"]`).click();
            await page.locator(`[data-testid="${id}-option-${opt}"]`).click();
            await page.waitForTimeout(120);
        };
        // RN's editable={false} renders as a DOM `readonly` attribute, not
        // `disabled` — Playwright's isDisabled() does not see it.
        const isLocked = (loc) => loc.evaluate((el) => el.readOnly || el.disabled);

        ok(await llmEp.inputValue() === 'http://localhost:8000/v1' && !(await isLocked(llmEp)),
            'vLLM endpoint editable with raw base');
        await pick('llm-provider', 'OpenAI');
        ok(await llmEp.inputValue() === 'https://api.openai.com/v1/chat/completions', 'vendor shows full chat URL');
        ok(await isLocked(llmEp), 'vendor endpoint read-only');
        await pick('llm-provider', 'vLLM');
        ok(await llmEp.inputValue() === 'http://localhost:8000/v1', 'vLLM profile preserved after switching back');
        await pick('llm-provider', 'SGLang');
        ok(await llmEp.inputValue() === 'http://localhost:30000/v1', 'SGLang default prefilled when empty');
        ok(await llmKey.inputValue() === 'sg-key' && await llmName.inputValue() === 'sg-model',
            'per-provider profile (key/name) preserved');
        await pick('llm-provider', 'Ollama');
        ok(await llmEp.inputValue() === 'http://localhost:11434', 'Ollama default prefilled (no /v1)');

        await pick('image-provider', 'Official');
        ok(await imgEp.inputValue() === 'https://api.ideogram.ai' && await isLocked(imgEp),
            'Official image endpoint read-only');
        await pick('image-provider', 'Custom');
        ok(await imgEp.inputValue() === 'http://localhost:8000' && !(await isLocked(imgEp)),
            'Custom image endpoint editable');

        await page.locator('[data-testid="settings-save"]').click();
        await page.waitForTimeout(200);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drawboard.settings')));
        ok(stored.llmProvider === 'Ollama', 'save persists active provider');
        ok(stored.llmProfiles.SGLang.secretKey === 'sg-key' && stored.llmProfiles.vLLM.endpoint === 'http://localhost:8000/v1',
            'save keeps other providers\' profiles');

        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await page.locator('[data-testid="settings-gear"]').click();
        await page.waitForTimeout(200);
        ok((await page.locator('[data-testid="llm-provider-select"]').innerText()).includes('Ollama'),
            'reload restores provider selection');
        ok(await llmEp.inputValue() === 'http://localhost:11434', 'reload restores endpoint value');
        await page.close();
    });

    // ================= S4: canvas display, zoom, grid =================
    await section('S4 canvas: display toggles / zoom / grid snap', async () => {
        const { page } = await newPage(browser, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);

        // Metadata bar content (read-only tags).
        ok(await page.getByText('clean', { exact: true }).count() === 1, 'aesthetics tag "clean"');
        ok(await page.getByText('85mm', { exact: true }).count() === 1, 'photo tag "85mm"');
        ok(await page.getByText('Art Style', { exact: true }).count() === 0, 'empty art_style section hidden');

        // Show elements toggle (visibility, not DOM count).
        await page.locator('[data-testid="show-elements-toggle"]').click();
        await page.waitForTimeout(150);
        ok(await boxes(page).count() === 0, 'show-elements off hides boxes');
        ok(await page.getByText('Canvas Area').count() === 0, 'no placeholder while elements exist');
        await page.locator('[data-testid="show-elements-toggle"]').click();
        await page.waitForTimeout(150);
        ok(await boxes(page).count() === 2, 'show-elements on restores boxes');

        // Show grid toggle. Match the grid's specific line color (alpha 0.45)
        // — the canvas rulers' minor-tick strips also use a
        // repeating-linear-gradient (alpha 0.5) and must not count.
        const gridOverlay = () => page.locator('div[style*="rgba(0, 0, 0, 0.45)"]').count();
        ok(await gridOverlay() === 1, 'grid overlay on by default');
        await page.locator('[data-testid="show-grid-toggle"]').click();
        await page.waitForTimeout(150);
        ok(await gridOverlay() === 0, 'show-grid off hides overlay');
        await page.locator('[data-testid="show-grid-toggle"]').click();
        await page.waitForTimeout(150);

        // Grid snapping (zoom 1 -> cell 10 units).
        const canvasW = (await canvasLoc(page).boundingBox()).width;
        const box0 = boxes(page).nth(0);
        const c0 = boxCenter(await box0.boundingBox());
        // +30px -> ~50.9 units from x=100 -> 150.9 -> snaps to 150.
        await dragOn(page, c0.x, c0.y, 30, 0);
        let u = await boxUnits(page, boxes(page).nth(0));
        ok(Math.abs(u.x - 150) <= 1.5, `grid on: drag snaps to 150 (got ${u.x.toFixed(1)})`);
        // Grid off: +13px from 150 -> 172.1 -> rounds to 172 (not a multiple of 10).
        await page.locator('[data-testid="show-grid-toggle"]').click();
        await page.waitForTimeout(120);
        const c1 = boxCenter(await boxes(page).nth(0).boundingBox());
        await dragOn(page, c1.x, c1.y, 13, 0);
        u = await boxUnits(page, boxes(page).nth(0));
        ok(Math.abs(u.x - 172) <= 1.5, `grid off: free move to 172 (got ${u.x.toFixed(1)})`);
        await page.locator('[data-testid="show-grid-toggle"]').click();
        await page.waitForTimeout(120);

        // Wheel zoom: 2 steps in -> x1.21, centered scroll, scrollable sizer.
        const sizer = page.locator('[data-testid="canvas-sizer"]');
        const sb = await sizer.boundingBox();
        await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
        const baseW = (await canvasLoc(page).boundingBox()).width;
        await page.mouse.wheel(0, -120);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(400);
        const zoomedW = (await canvasLoc(page).boundingBox()).width;
        ok(Math.abs(zoomedW / baseW - 1.21) < 0.02, `zoom in x2 -> 1.21 (ratio ${ (zoomedW / baseW).toFixed(3) })`);
        ok((await sizer.evaluate((el) => getComputedStyle(el).overflowY)) === 'scroll', 'zoomed sizer is scrollable');
        const scroll = await sizer.evaluate((el) => ({ sl: el.scrollLeft, sw: el.scrollWidth, cw: el.clientWidth }));
        ok(Math.abs(scroll.sl - (scroll.sw - scroll.cw) / 2) < 3, 'auto-scrolled to center');
        // 3 steps out -> clamps back to exactly 1.
        await page.mouse.wheel(0, 120);
        await page.mouse.wheel(0, 120);
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(400);
        const backW = (await canvasLoc(page).boundingBox()).width;
        ok(Math.abs(backW / baseW - 1) < 0.001, `zoom out -> back to 1.0 (ratio ${(backW / baseW).toFixed(4)})`);
        ok((await sizer.evaluate((el) => getComputedStyle(el).overflowY)) !== 'scroll', 'unzoomed sizer not scrollable');
        await page.close();
    });

    // ================= S5: element operations =================
    await section('S5 elements: drag / align / tooltip / menu / resize / delete', async () => {
        const { page } = await newPage(browser, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const canvasW = (await canvasLoc(page).boundingBox()).width;

        // Plain drag.
        const b0 = await boxes(page).nth(0).boundingBox();
        await dragOn(page, b0.x + b0.width / 2, b0.y + b0.height / 2, 40, 20);
        const b0a = await boxes(page).nth(0).boundingBox();
        ok(b0a.x > b0.x + 20 && b0a.y > b0.y + 10, 'drag moves the box');

        // Alignment guide: after the first drag the obj box sits at x=170
        // (center 370); dragging +130 units right puts its center on 500, the
        // text box's x-center.
        const b1 = await boxes(page).nth(0).boundingBox();
        const guides = () => page.locator('div[style*="rgba(255, 59, 48, 0.9)"]').count();
        let guideSeen = 0;
        await dragOn(page, b1.x + b1.width / 2, b1.y + b1.height / 2, 130 / 1000 * canvasW, 0, async () => {
            guideSeen = await guides();
            const border = await boxes(page).nth(1).evaluate((el) => getComputedStyle(el).borderColor);
            ok(guideSeen >= 1, 'vertical alignment guide visible mid-drag');
            ok(border === 'rgb(255, 59, 48)', 'aligned element highlighted red mid-drag');
        });
        await page.waitForTimeout(200);
        ok(await guides() === 0, 'guides gone after release');
        const u0 = await boxUnits(page, boxes(page).nth(0));
        ok(Math.abs(u0.x - 300) <= 2, `alignment drag landed at x=300 (got ${u0.x.toFixed(1)})`);

        // Hover tooltip on the text element (shows its desc).
        const bt = await boxes(page).nth(1).boundingBox();
        await page.mouse.move(bt.x + bt.width / 2, bt.y + bt.height / 2);
        await page.waitForTimeout(250);
        const tip = page.locator('div[style*="width: 260px"]');
        ok(await tip.count() === 1 && (await tip.innerText()).includes('A label reading HELLO on the right.'),
            'hover tooltip shows the text element desc');
        await page.mouse.move(bt.x + bt.width / 2, bt.y + bt.height + 40);
        await page.waitForTimeout(250);
        ok(await tip.count() === 0, 'tooltip gone after unhover');

        // Context menu: obj has no "Edit text"; text has all three.
        const bm = await boxes(page).nth(0).boundingBox();
        await page.mouse.click(bm.x + bm.width / 2, bm.y + bm.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('Edit description', { exact: true }).count() === 1
            && await page.getByText('Edit text', { exact: true }).count() === 0
            && await page.getByText('Delete', { exact: true }).count() === 1,
            'obj menu: Edit description + Delete only');
        // Close via backdrop. The click must land on the backdrop, NOT the
        // top 64px: expo-router's Stack header (white bar, z above the
        // screen layer) intercepts clicks there and the backdrop never
        // sees them. (10, 400) is over the toolbar, where the backdrop's
        // z=90 wins.
        await page.mouse.click(10, 400);
        await page.waitForTimeout(150);
        const bt2 = await boxes(page).nth(1).boundingBox();
        await page.mouse.click(bt2.x + bt2.width / 2, bt2.y + bt2.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('Edit text', { exact: true }).count() === 1, 'text menu adds Edit text');
        await page.mouse.click(10, 400);
        await page.waitForTimeout(150);

        // Right-click EMPTY canvas -> a Paste-only menu (shares the in-app
        // clipboard with the element menus). (0.15, 0.7) is clear of both
        // boxes at this point (obj dragged to x 300-700, text at y 500-600).
        const cnv = await canvasLoc(page).boundingBox();
        const cx = cnv.x + 0.15 * cnv.width;
        const cy = cnv.y + 0.7 * cnv.height;
        await page.mouse.click(cx, cy, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('Paste', { exact: true }).count() === 1
            && await page.getByText('Copy', { exact: true }).count() === 0
            && await page.getByText('Edit description', { exact: true }).count() === 0
            && await page.getByText('Delete', { exact: true }).count() === 0,
            'canvas empty-area menu: Paste only');
        await page.mouse.click(10, 400);
        await page.waitForTimeout(150);
        // Copy the obj from its (full) menu, then paste from the canvas menu.
        const bm2 = await boxes(page).nth(0).boundingBox();
        await page.mouse.click(bm2.x + bm2.width / 2, bm2.y + bm2.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('Copy', { exact: true }).count() === 1, 'element menu still has Copy');
        await page.getByText('Copy', { exact: true }).click();
        await page.waitForTimeout(200);
        await page.mouse.click(cx, cy, { button: 'right' });
        await page.waitForTimeout(200);
        await page.getByText('Paste', { exact: true }).click();
        await page.waitForTimeout(200);
        ok(await boxes(page).count() === 3, 'canvas-menu paste adds a box');
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(250);
        ok(await boxes(page).count() === 2, 'undo reverts the canvas-menu paste');

        // Resize: SE corner extends right/down; top-left corner stays.
        const br = await boxes(page).nth(1).boundingBox();
        await dragOn(page, br.x + br.width, br.y + br.height, 30, 10);
        const bra = await boxes(page).nth(1).boundingBox();
        ok(Math.abs(bra.x - br.x) < 1.5 && Math.abs(bra.y - br.y) < 1.5, 'SE resize keeps top-left corner');
        ok(bra.width > br.width + 15 && bra.height > br.height + 5, 'SE resize grows the box');
        await page.waitForTimeout(150); // let the post-release re-render settle

        // Min-size clamp: drag NW corner far past the opposite edge.
        // +500px x pushes xMin past xMax-20 -> width clamps to 20 units; the
        // grabbed NW corner moves, the opposite SE corner stays. The drag is
        // purely horizontal on purpose: with a vertical component the pointer
        // outruns the (clamped) corner and leaves the handle's hit region,
        // which freezes the RN-web resize gesture mid-drag.
        const uBefore = await boxUnits(page, boxes(page).nth(1));
        const bnw = await boxes(page).nth(1).boundingBox();
        await dragOn(page, bnw.x, bnw.y, 500, 0);
        await page.waitForTimeout(150); // let the post-release re-render settle
        // Measure the inline style (the exact CSS px the app wrote), not the
        // rendered rect: at 20 units on this canvas the box is 11.8px wide,
        // smaller than its own chrome (12px padding + 2px border), so the
        // browser clamps the RENDERED width to 14px and boundingBox() would
        // report the clamped value instead of the data.
        const stAfter = await boxes(page).nth(1).evaluate((el) => {
            const s = el.getAttribute('style') || '';
            const px = (k) => parseFloat((s.match(new RegExp(k + ': ([\\d.]+)px')) || [])[1]);
            return { left: px('left'), width: px('width') };
        });
        ok(Math.abs(stAfter.width / canvasW * 1000 - 20) < 1.5,
            `NW overdrag clamps width to 20 units (${(stAfter.width / canvasW * 1000).toFixed(1)})`);
        ok(Math.abs((stAfter.left + stAfter.width) / canvasW * 1000 - (uBefore.x + uBefore.w)) <= 1.5,
            `NW overdrag keeps the opposite (right) edge at ${(uBefore.x + uBefore.w).toFixed(0)}`);

        // Delete + undo.
        const bd = await boxes(page).nth(0).boundingBox();
        await page.mouse.click(bd.x + bd.width / 2, bd.y + bd.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        await page.getByText('Delete', { exact: true }).click();
        await page.waitForTimeout(250);
        ok(await boxes(page).count() === 1, 'delete removes the box');
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(250);
        ok(await boxes(page).count() === 2, 'undo restores the deleted box');
        await page.close();
    });

    // ================= S6: edit dialog + font options + save =================
    await section('S6 edit dialog, font options, save', async () => {
        const { page } = await newPage(browser, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const bt = await boxes(page).nth(1).boundingBox();
        const rightClick = async (i) => {
            const bb = await boxes(page).nth(i).boundingBox();
            await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
            await page.waitForTimeout(200);
        };
        const dialogSave = () => page.getByText('Save', { exact: true }).last().click();
        const rowSave = () => page.getByText('Save', { exact: true }).first().click();

        // Edit text with font options.
        await rightClick(1);
        await page.getByText('Edit text', { exact: true }).click();
        await page.waitForTimeout(200);
        const ta = page.locator('textarea');
        ok(await page.getByText('Edit text', { exact: true }).count() === 1 && (await ta.inputValue()) === 'HELLO',
            'dialog opens seeded with current text');
        await ta.fill('');
        await dialogSave();
        await page.waitForTimeout(200);
        ok(await page.getByText('Edit text', { exact: true }).count() === 1, 'empty draft: Save is a no-op (dialog stays)');
        await ta.fill('WORLD');
        await page.locator('[data-testid="font-size-menu"]').click();
        await page.locator('[data-testid="font-size-24"]').click();
        await page.locator('[data-testid="font-choice-select"]').click();
        await page.locator('[data-testid="font-choice-option-Georgia"]').click();
        await page.locator('[data-testid="font-bold"]').click();
        await page.locator('[data-testid="font-italic"]').click();
        await dialogSave();
        await page.waitForTimeout(300);
        ok((await boxes(page).nth(1).innerText()).includes('WORLD'), 'new text renders on the box');
        const fstyle = await boxes(page).nth(1).evaluate((el) => {
            const t = [...el.querySelectorAll('div')].find((d) => d.textContent === 'WORLD');
            const cs = getComputedStyle(t);
            return { fs: cs.fontSize, fw: cs.fontWeight, fi: cs.fontStyle, ff: cs.fontFamily };
        });
        ok(fstyle.fs === '24px' && fstyle.ff.includes('Georgia') && fstyle.fw === '700' && fstyle.fi === 'italic',
            `font options applied on canvas (${JSON.stringify(fstyle)})`);

        // Design save -> extra_fontoption stores exactly the non-default keys.
        await rowSave();
        await page.waitForTimeout(250);
        ok(await page.getByText('Saved ✓').count() === 1, '"Saved ✓" confirmation shown');
        let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drawboard.designs')));
        ok(stored.length === 1, 'first save creates one design');
        let el = stored[0].prompt.compositional_deconstruction.elements[1];
        ok(JSON.stringify(el.extra_fontoption) === JSON.stringify({ size: 24, font: 'Georgia', bold: true, italic: true }),
            `extra_fontoption = non-default subset (${JSON.stringify(el.extra_fontoption)})`);

        // Revert all font options -> the field is removed entirely.
        await rightClick(1);
        await page.getByText('Edit text', { exact: true }).click();
        await page.waitForTimeout(200);
        ok(await page.locator('[data-testid="font-size-input"]').inputValue() === '24', 'dialog re-seeds stored font size');
        await page.locator('[data-testid="font-bold"]').click();
        await page.locator('[data-testid="font-italic"]').click();
        await page.locator('[data-testid="font-choice-select"]').click();
        await page.locator('[data-testid="font-choice-option-Default"]').click();
        await page.locator('[data-testid="font-size-input"]').fill('13');
        await dialogSave();
        await page.waitForTimeout(300);
        await rowSave();
        await page.waitForTimeout(250);
        stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drawboard.designs')));
        ok(stored.length === 1, 'second save upserts the same design');
        el = stored[0].prompt.compositional_deconstruction.elements[1];
        ok(el.extra_fontoption === undefined, 'reverted options remove extra_fontoption');
        const fs2 = await boxes(page).nth(1).evaluate((el2) => {
            const t = [...el2.querySelectorAll('div')].find((d) => d.textContent === 'WORLD');
            return getComputedStyle(t).fontWeight;
        });
        ok(fs2 !== '700', 'canvas back to default weight');
        await page.waitForTimeout(2100);
        ok(await page.getByText('Saved ✓').count() === 0, '"Saved ✓" auto-hides after ~1.8s');

        // Edit description on an obj element.
        await rightClick(0);
        await page.getByText('Edit description', { exact: true }).click();
        await page.waitForTimeout(200);
        await page.locator('textarea').fill('A fresh object description.');
        await dialogSave();
        await page.waitForTimeout(300);
        ok((await boxes(page).nth(0).innerText()).includes('A fresh object description.'),
            'obj desc edit renders on the box');
        await page.close();
    });

    // ================= S7: undo / redo =================
    await section('S7 undo / redo', async () => {
        const { page } = await newPage(browser, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const undoStroke = () => toolStroke(page, 'undo-button');
        const redoStroke = () => toolStroke(page, 'redo-button');

        ok(await undoStroke() === GREY && await redoStroke() === GREY, 'both buttons greyed initially');

        // Drag = one step; undo/redo round-trip.
        const Porig = await boxes(page).nth(0).boundingBox();
        const bb = await boxes(page).nth(0).boundingBox();
        await dragOn(page, bb.x + bb.width / 2, bb.y + bb.height / 2, 40, 20);
        const P1 = await boxes(page).nth(0).boundingBox();
        ok(Math.abs(P1.x - Porig.x) > 5, 'drag actually moved the box (grid-snapped)');
        ok(await undoStroke() === BLUE, 'drag arms undo');
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(200);
        const P0 = await boxes(page).nth(0).boundingBox();
        ok(Math.abs(P0.x - Porig.x) < 1.5 && Math.abs(P0.y - Porig.y) < 1.5, 'undo restores pre-drag position');
        ok(await redoStroke() === BLUE, 'redo armed after undo');
        await page.locator('[data-testid="redo-button"]').click();
        await page.waitForTimeout(200);
        const P1r = await boxes(page).nth(0).boundingBox();
        ok(Math.abs(P1r.x - P1.x) < 1.5 && Math.abs(P1r.y - P1.y) < 1.5, 'redo re-applies the drag');

        // No-op drag against the edge records no step: push to the left edge,
        // nudge further left (clamped, unchanged), then ONE undo must land on
        // P1 (the real drag), not on a phantom no-op step.
        const canvasW = (await canvasLoc(page).boundingBox()).width;
        let be = await boxes(page).nth(0).boundingBox();
        await dragOn(page, be.x + be.width / 2, be.y + be.height / 2, -4 * canvasW / 10, 0);
        be = await boxes(page).nth(0).boundingBox();
        await dragOn(page, be.x + be.width / 2, be.y + be.height / 2, -3, 0); // clamped no-op
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(250);
        const Pa = await boxes(page).nth(0).boundingBox();
        ok(Math.abs(Pa.x - P1.x) < 1.5 && Math.abs(Pa.y - P1.y) < 1.5,
            'no-op edge drag recorded no step (one undo -> real drag state)');

        // Three atomic actions -> exactly three undos revert them in order.
        const bb2 = await boxes(page).nth(0).boundingBox();
        await page.mouse.click(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        await page.getByText('Edit description', { exact: true }).click();
        await page.waitForTimeout(200);
        await page.locator('textarea').fill('Undo step one.');
        await page.getByText('Save', { exact: true }).last().click();
        await page.waitForTimeout(250);
        ok((await boxes(page).nth(0).innerText()).includes('Undo step one.'), 'desc edit applied');

        await page.locator('[data-testid="palette-add"]').click();
        await page.waitForTimeout(250);
        ok(await page.locator('[data-testid="color-picker-popover"]').count() === 1, 'palette add popover opens');
        const swatches = page.locator('[data-testid^="palette-swatch-"]');
        const swBefore = await swatches.count();
        await page.locator('input[placeholder="#RRGGBB"]').fill('FF0000');
        await page.locator('input[placeholder="#RRGGBB"]').press('Enter');
        // Scope to the popover action row: the popover title is also "Add color".
        await page.locator('[data-testid="color-actions"]').getByText('Add color', { exact: true }).click();
        await page.waitForTimeout(250);
        ok(await swatches.count() === swBefore + 1, 'palette add appends a swatch');
        const lastSwatchColor = await swatches.nth(swBefore).evaluate((el) =>
            getComputedStyle(el.querySelector('div')).backgroundColor);
        ok(lastSwatchColor === 'rgb(255, 0, 0)', 'added swatch is #FF0000');

        const sizer = await page.locator('[data-testid="canvas-sizer"]').boundingBox();
        await page.locator('[data-testid="tool-text"]').click();
        // Stay well inside the canvas: a rectangle running past the bottom
        // edge clamps to a 20-unit sliver whose rendered center sits on the
        // sizer clip line (right-click there misses the box).
        await dragOn(page, sizer.x + sizer.width * 0.5, sizer.y + sizer.height * 0.45, 150, 60);
        await page.waitForTimeout(300);
        ok(await boxes(page).count() === 3, 'created element adds a third box');

        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(250);
        ok(await boxes(page).count() === 2, 'undo 1: created element removed');
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(255);
        ok(await swatches.count() === swBefore, 'undo 2: palette color removed');
        await page.locator('[data-testid="undo-button"]').click();
        await page.waitForTimeout(255);
        ok(!(await boxes(page).nth(0).innerText()).includes('Undo step one.'), 'undo 3: desc edit reverted');

        // A new action clears the redo stack.
        ok(await redoStroke() === BLUE, 'redo armed with 3 pending steps');
        const bb3 = await boxes(page).nth(0).boundingBox();
        await dragOn(page, bb3.x + bb3.width / 2, bb3.y + bb3.height / 2, 20, 10);
        ok(await redoStroke() === GREY, 'new action clears redo');
        await page.close();
    });

    // ================= S8: creation tools =================
    await section('S8 creation tools', async () => {
        const { page } = await newPage(browser, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const sizer = await page.locator('[data-testid="canvas-sizer"]').boundingBox();
        // 0.45 (not 0.85): leaves room for the drag below the origin so the
        // created rectangle stays well inside the canvas.
        const sx = sizer.x + sizer.width * 0.5, sy = sizer.y + sizer.height * 0.45;

        await page.locator('[data-testid="tool-text"]').click();
        await page.waitForTimeout(150);
        ok((await canvasLoc(page).evaluate((el) => getComputedStyle(el).cursor)) === 'crosshair',
            'armed tool -> crosshair cursor');
        await dragOn(page, sx, sy, 150, 60);
        await page.waitForTimeout(300);
        ok(await boxes(page).count() === 3, 'create-drag adds an element');
        // An idle tool icon is BLUE (#007AFF); only the armed one is white.
        ok(await toolStroke(page, 'tool-text') === BLUE, 'tool auto-deactivates after create');
        ok((await canvasLoc(page).evaluate((el) => getComputedStyle(el).cursor)) !== 'crosshair', 'cursor restored');

        await page.locator('[data-testid="tool-obj"]').click();
        await page.waitForTimeout(150);
        await page.mouse.click(sx, sy); // plain click: no drag
        await page.waitForTimeout(300);
        ok(await boxes(page).count() === 3, 'plain click creates nothing');

        await page.locator('[data-testid="tool-text"]').click();
        await page.waitForTimeout(150);
        ok(await toolStroke(page, 'tool-text') === 'rgb(255, 255, 255)', 'armed tool icon is white');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        ok(await toolStroke(page, 'tool-text') === BLUE, 'Esc cancels the armed tool');

        await page.locator('[data-testid="tool-obj"]').click();
        await page.waitForTimeout(150);
        await dragOn(page, sx, sy, 20, 20);
        await page.waitForTimeout(300);
        ok(await boxes(page).count() === 4, 'tiny drag (>12px) still creates');
        const u = await boxUnits(page, boxes(page).nth(3));
        ok(u.w >= 19 && u.h >= 19, `new box respects the 20-unit minimum (got ${u.w.toFixed(1)}x${u.h.toFixed(1)})`);
        await page.close();
    });

    // ================= S9: generation flow =================
    await section('S9 generation: guards, rewrite, headers, failure', async () => {
        const { page } = await newPage(browser, { settings: mkSettings() });
        const log = await mockApis(page, { llmContent: REWRITTEN_VLLM });
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const generate = async () => {
            await page.getByText('Generate', { exact: true }).first().click();
            await page.waitForTimeout(700);
        };

        // Unedited generate: no LLM call, one generate request.
        await generate();
        ok(log.llm.length === 0, 'unedited generate skips the LLM rewrite');
        ok(log.gen.length === 1, 'one generate request');
        ok(log.gen[0].url === 'http://localhost:8000/v1/ideogram-v4/generate', 'generate URL from Custom endpoint');
        ok(log.gen[0].headers['api-key'] === 'img-key-123', 'Api-Key header sent when key set');
        ok(log.gen[0].form.response_type === 'url' && log.gen[0].form.resolution === '1024x768', 'form fields response_type/resolution');
        const jp1 = JSON.parse(log.gen[0].form.json_prompt);
        ok(jp1.compositional_deconstruction.elements[0].desc === 'A golden retriever sitting in the center.',
            'json_prompt carries the original desc');
        ok(await page.getByText('Generated (1)').count() === 1, 'history shows Generated (1)');
        ok((await canvasLoc(page).locator('img').first().getAttribute('src')).includes('regress-img-1'),
            'new image shown on the canvas');

        // Dragged generate: exactly one rewrite LLM call, descs merged back.
        const canvasW = (await canvasLoc(page).boundingBox()).width;
        const bb = await boxes(page).nth(0).boundingBox();
        await dragOn(page, bb.x + bb.width / 2, bb.y + bb.height / 2, canvasW * 0.1, 0);
        await generate();
        ok(log.llm.length === 1, 'edited generate issues one rewrite call');
        ok(log.llm[0].body.messages[0].content === REWRITE_SYSTEM_PROMPT, 'rewrite system prompt = the bbox-adapt file');
        const sentCaption = JSON.parse(log.llm[0].body.messages[1].content);
        ok(sentCaption.compositional_deconstruction.elements.length === 2, 'caption sent verbatim (2 elements)');
        ok(!log.llm[0].headers['authorization'], 'no Authorization with empty vLLM key');
        const jp2 = JSON.parse(log.gen[1].form.json_prompt);
        ok(jp2.compositional_deconstruction.elements[0].desc === 'REWRITTEN DESC', 'rewritten desc merged into json_prompt');
        ok((await boxes(page).nth(0).innerText()).includes('REWRITTEN DESC'), 'merged desc also written back to the canvas');
        ok(await page.getByText('Generated (2)').count() === 1, 'history shows Generated (2)');

        // After a successful rewrite the flag resets: next generate skips LLM.
        await generate();
        ok(log.llm.length === 1 && log.gen.length === 3, 'post-rewrite generate skips LLM again');
        ok(await page.getByText('Generated (3)').count() === 1, 'history shows Generated (3)');

        // Empty element blocks generation with a red highlight. The generated
        // history strip has shrunk the sizer, so draw the rectangle well inside
        // the canvas (a drag past the bottom edge clamps to a degenerate
        // sliver whose center falls on the sizer clip line).
        const sizer = await page.locator('[data-testid="canvas-sizer"]').boundingBox();
        await page.locator('[data-testid="tool-text"]').click();
        await dragOn(page, sizer.x + sizer.width * 0.5, sizer.y + sizer.height * 0.45, 150, 60);
        await page.waitForTimeout(300);
        const createdBox = await boxes(page).nth(2).boundingBox();
        ok(createdBox.height >= 30, `created box is healthy, not a clamped sliver (${createdBox.height.toFixed(1)}px)`);
        await generate();
        ok(await page.locator('text=/Element 3 is empty/').count() === 1, 'empty element -> blocking error naming it');
        ok(log.gen.length === 3, 'no generate request when blocked');
        const emptyBorder = await boxes(page).nth(2).evaluate((el) => {
            const cs = getComputedStyle(el);
            return cs.borderColor + ' ' + cs.borderStyle;
        });
        ok(emptyBorder.startsWith('rgb(255, 59, 48)'), `empty box highlighted red (${emptyBorder})`);

        // Fill it in -> generation proceeds (no rewrite: no bbox edit).
        const be = await boxes(page).nth(2).boundingBox();
        await page.mouse.click(be.x + be.width / 2, be.y + be.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        await page.getByText('Edit text', { exact: true }).click();
        await page.waitForTimeout(200);
        await page.locator('textarea').fill('HI');
        await page.getByText('Save', { exact: true }).last().click();
        await page.waitForTimeout(300);
        await generate();
        ok(log.llm.length === 1 && log.gen.length === 4, 'filled element -> generate proceeds without rewrite');
        ok(await page.locator('text=/is empty/').count() === 0, 'error line cleared');
        ok(await page.getByText('Generated (4)').count() === 1, 'history shows Generated (4)');

        // Failed generate: error shown, no image added. A later route for the
        // same pattern fully replaces the mockApis handler, so log the
        // request here too.
        await page.route('**/v1/ideogram-v4/generate', (route) => {
            const req = route.request();
            log.gen.push({
                url: req.url(),
                headers: req.headers(),
                form: parseMultipart(req.postData() || ''),
            });
            return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        });
        await generate();
        ok(log.gen.length === 5, 'failing request still sent');
        ok(await page.locator('text=/status 500/').count() === 1, 'failure surfaces the status');
        ok(await page.getByText('Generated (4)').count() === 1, 'no image added on failure');

        // History strip: 4 thumbnails + the canvas image = 5 <img>s in the DOM
        // (the canvas img comes first, so thumbnail i is nth(i+1)).
        const allImgs = page.locator('img[src*="regress-img-"]');
        ok(await allImgs.count() === 5, `4 thumbnails + 1 canvas image (got ${await allImgs.count()})`);
        await allImgs.nth(1).click(); // first thumbnail = generated image #1
        await page.waitForTimeout(300);
        ok((await canvasLoc(page).locator('img').first().getAttribute('src')).includes('regress-img-1'),
            'clicking a thumbnail switches the canvas image');
        await page.close();
    });

    // ================= S10: normalization in the generate payload =================
    await section('S10 normalizePromptForIdeogram in flight', async () => {
        const { page } = await newPage(browser, { settings: mkSettings() });
        const log = await mockApis(page, {});
        await openDesign(page, NORM_PROMPT, '640,480');
        await page.waitForTimeout(700);
        await page.getByText('Generate', { exact: true }).first().click();
        await page.waitForTimeout(700);
        const jp = JSON.parse(log.gen[0].form.json_prompt);
        const sd = jp.style_description;
        ok(!('photo' in sd), 'photo dropped (medium is not a photograph)');
        ok(sd.art_style === 'impressionist, pastel', 'art_style kept');
        ok(JSON.stringify(Object.keys(sd)) === JSON.stringify(['aesthetics', 'lighting', 'medium', 'art_style', 'color_palette']),
            `key order rebuilt (${Object.keys(sd).join(',')})`);
        ok(JSON.stringify(sd.color_palette) === JSON.stringify(['#ABCDEF', '#00FF00']),
            `palette cleaned (${JSON.stringify(sd.color_palette)})`);
        ok(log.gen[0].form.resolution === '640x480', 'resolution from the size param');
        await page.close();
    });

    // ================= S11: Api-Key omitted when empty =================
    await section('S11 Api-Key header omitted when key empty', async () => {
        const { page } = await newPage(browser, { settings: mkSettings({ imageSecretKey: '' }) });
        const log = await mockApis(page, {});
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        await page.getByText('Generate', { exact: true }).first().click();
        await page.waitForTimeout(700);
        ok(log.gen.length === 1 && !log.gen[0].headers['api-key'], 'no Api-Key header with empty key');
        await page.close();
    });

    // ================= S12: Ollama native dialect =================
    await section('S12 Ollama native /api/chat dialect', async () => {
        const settings = mkSettings();
        settings.llmProvider = 'Ollama';
        settings.llmProfiles.Ollama = { endpoint: 'http://localhost:11434', secretKey: '', name: 'ollama-model' };
        const { page } = await newPage(browser, { settings });
        const log = await mockApis(page, { llmContent: REWRITTEN_OLLAMA });
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        const canvasW = (await canvasLoc(page).boundingBox()).width;
        const bb = await boxes(page).nth(0).boundingBox();
        await dragOn(page, bb.x + bb.width / 2, bb.y + bb.height / 2, canvasW * 0.1, 0);
        await page.getByText('Generate', { exact: true }).first().click();
        await page.waitForTimeout(800);
        ok(log.llm.length === 1 && log.llm[0].url === 'http://localhost:11434/api/chat', 'Ollama native /api/chat URL');
        const b = log.llm[0].body;
        ok(b.model === 'ollama-model' && b.stream === false, 'native body: model + stream:false');
        ok(b.options?.temperature === 1.0 && b.temperature === undefined, 'temperature under options, not top-level');
        ok(!('think' in b), 'no think/reasoning fields');
        ok(log.gen.length === 1 && (await boxes(page).nth(0).innerText()).includes('OLLAMA REWRITE'),
            'native response parsed, rewrite applied');
        await page.close();
    });

    // ================= S13: missing-settings generate guard =================
    await section('S13 generate guard: missing settings', async () => {
        // vLLM provider with an empty profile -> name + endpoint missing.
        const settings = mkSettings();
        settings.llmProfiles.vLLM = { endpoint: '', secretKey: '', name: '' };
        const { page } = await newPage(browser, { settings });
        const reqs = [];
        page.on('request', (r) => {
            if (/chat\/completions|api\/chat|ideogram-v4/.test(r.url())) reqs.push(r.url());
        });
        await openDesign(page, BASE_PROMPT, '1024,768');
        await page.waitForTimeout(700);
        await page.getByText('Generate', { exact: true }).first().click();
        await page.waitForTimeout(500);
        ok(await page.locator('text=/Cannot generate — missing settings: LLM name, LLM endpoint/').count() === 1,
            'missing-settings error names the items');
        ok(reqs.length === 0, 'zero outgoing requests when settings missing');
        await page.close();
    });

    // ================= S14: recent designs + reopen =================
    await section('S14 recent designs list + reopen', async () => {
        const designs = [
            {
                id: 'd1',
                prompt: {
                    aspect_ratio: '4:3',
                    high_level_description: 'Reopened design',
                    style_description: { aesthetics: 'a', medium: 'photograph', color_palette: ['#111111'] },
                    compositional_deconstruction: {
                        background: 'bg',
                        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'a reopened element' }],
                    },
                },
                images: [`${BASE}/regress-img-1.png`, `${BASE}/regress-img-2.png`],
                size: { width: 800, height: 600 },
                updatedAt: 2000,
            },
            {
                id: 'd2',
                prompt: {
                    aspect_ratio: '1:1',
                    high_level_description: 'Older design without images',
                    style_description: { medium: 'photograph', color_palette: [] },
                    compositional_deconstruction: { background: 'bg', elements: [] },
                },
                images: [],
                size: { width: 512, height: 512 },
                updatedAt: 1000,
            },
        ];
        const { page } = await newPage(browser, { settings: mkSettings(), designs });
        await page.route('**/regress-img-*.png', (route) =>
            route.fulfill({ contentType: 'image/png', body: PNG }));
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        ok(await page.getByText('Reopened design', { exact: true }).count() === 1, 'card shows high_level_description');
        // d1 has images, d2 does not -> exactly one card thumbnail on the page.
        ok(await page.locator('img[src*="regress-img-"]').count() === 1, 'card shows a thumbnail only for the design with images');
        // Newest first: the d1 card text sits above the d2 card text.
        const r1 = await page.getByText('Reopened design', { exact: true }).boundingBox();
        const r2 = await page.getByText('Older design without images', { exact: true }).boundingBox();
        ok(r1 && r2 && r1.y < r2.y, 'newest design listed first');

        await page.getByText('Reopened design', { exact: true }).click();
        await page.waitForURL('**/design**', { timeout: 10000 });
        await page.waitForTimeout(800);
        ok(await page.locator('input[placeholder="Untitled Design"]').inputValue() === 'Reopened design',
            'title restored from high_level_description');
        const cb = await canvasLoc(page).boundingBox();
        ok(Math.abs(cb.width / cb.height - 800 / 600) < 0.02, `canvas restored to 800x600 ratio (${(cb.width / cb.height).toFixed(3)})`);
        ok(await page.getByText('Generated (2)').count() === 1, 'image history restored');
        ok((await canvasLoc(page).locator('img').first().getAttribute('src')).includes('regress-img-2'),
            'latest image shown on reopen');
        await page.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('REGRESSION ERROR:', e); process.exit(1); });
