/**
 * E2E for the IndexedDB image store (run against `expo start --web` on :8081).
 * Generated images are persisted as base64 data URIs under random ids; the
 * generation endpoint is mocked with page.route. Designs / settings / IDB
 * records are seeded in-page (single-payload evaluate — page functions can't
 * see module-level variables, so the design id travels inside the payload).
 * NOTE (S4): the mock image URL fails only for saveGeneratedImage's fetch;
 * a URL that 500s on every load makes RN-web's Image drop itself from the DOM
 * (ERRORED state, no defaultSource), so the browser's own <img> loads must
 * succeed for the fallback image to stay visible.
 * Temporary file — not committed.
 * takes ONE arg). Temporary file — not committed.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8081';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);
const DATA_URI = `data:image/png;base64,${PNG.toString('base64')}`;

const PROMPT = {
    aspect_ratio: '4:3',
    high_level_description: 'Image store test scene.',
    style_description: {
        aesthetics: 'clean',
        lighting: 'even',
        medium: 'photograph',
        photo: '85mm',
        color_palette: ['#1A1A2E'],
    },
    compositional_deconstruction: {
        background: 'A plain studio backdrop.',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'A dog sitting in the center.' }],
    },
};

const DESIGN_ID = 'imgstore-design';
const SEED_IDB_ID = 'img-seed-1';
const LEGACY_URL = `${BASE}/legacy-img.png`;

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
    imageSecretKey: '',
});

// Seed localStorage + the IndexedDB image store in the page, then navigate.
// (Runs after a real document load so the evaluate Promise is awaited; the
// handoff/designs land in localStorage before the design page reads them.)
async function gotoSeeded(page, url, payload) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    // The page function only sees its payload — no module-level variables, so
    // the handoff design id travels inside it.
    await page.evaluate(({ designId, settings, handoff, designs, idbRecords }) => {
        if (settings) localStorage.setItem('drawboard.settings', JSON.stringify(settings));
        if (handoff) localStorage.setItem('drawboard.handoff', JSON.stringify({ [designId]: handoff }));
        if (designs) localStorage.setItem('drawboard.designs', JSON.stringify(designs));
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('drawboard-images', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
            };
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('images', 'readwrite');
                (idbRecords || []).forEach((r) => tx.objectStore('images').put(r));
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });
    }, { designId: DESIGN_ID, ...payload });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
}

const canvasImgSrc = (page) =>
    page.locator('[data-testid="design-canvas"] img').first().getAttribute('src');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // ---------- S1: open a saved design whose image lives in IndexedDB ----------
    await section('S1 design with IDB-backed image', async () => {
        const designs = [{
            id: 'idb-design', prompt: PROMPT, images: [SEED_IDB_ID],
            size: { width: 800, height: 600 }, updatedAt: 1000, rawPrompt: 'seeded',
        }];
        await gotoSeeded(page, `${BASE}/design?id=idb-design`, {
            designs,
            idbRecords: [{ id: SEED_IDB_ID, uri: DATA_URI, createdAt: 1 }],
        });
        ok(await canvasImgSrc(page) === DATA_URI, 'canvas image resolved from IndexedDB (data URI)');
        ok(await page.getByText('Generated (1)').count() === 1, 'history shows Generated (1)');
        ok(await page.locator('[data-testid="history-thumb-0"] img').getAttribute('src') === DATA_URI,
            'history thumbnail resolved from IndexedDB');
        await page.close();
    });

    // ---------- S2: generate persists base64 under a random id ----------
    await section('S2 generate persists base64 under a random id', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await p.route('**/v1/ideogram-v4/generate', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ data: [{ url: `${BASE}/iseed-img.png` }] }),
        }));
        await p.route('**/iseed-img.png', (route) =>
            route.fulfill({ contentType: 'image/png', body: PNG }));
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings(),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        ok(await canvasImgSrc(p) === DATA_URI, 'canvas shows the generated image as a base64 data URI');
        ok(!(await canvasImgSrc(p)).includes('iseed-img'), 'raw URL is not stored as the image ref');
        const stored = await p.evaluate(() => new Promise((resolve, reject) => {
            const req = indexedDB.open('drawboard-images', 1);
            req.onsuccess = () => {
                const tx = req.result.transaction('images', 'readonly');
                const all = tx.objectStore('images').getAll();
                all.onsuccess = () => resolve(all.result);
                all.onerror = () => reject(all.error);
            };
            req.onerror = () => reject(req.error);
        }));
        ok(stored.length === 1 && /^img-/.test(stored[0].id) && stored[0].uri === DATA_URI,
            'exactly one IDB record with an img-* id holding the data URI');
        await p.close();
    });

    // ---------- S3: Save persists the id; reopen resolves from IDB ----------
    await section('S3 save persists the id, reopen resolves from IDB', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await p.route('**/v1/ideogram-v4/generate', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ data: [{ url: `${BASE}/iseed-img.png` }] }),
        }));
        await p.route('**/iseed-img.png', (route) =>
            route.fulfill({ contentType: 'image/png', body: PNG }));
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings(),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        await p.locator('[data-testid="save-button"]').click();
        await p.waitForTimeout(500);
        const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('drawboard.designs') || '[]'));
        const d = saved.find((x) => x.id === DESIGN_ID);
        ok(d && d.images.length === 1 && /^img-/.test(d.images[0]), 'saved design stores the img-* id, not a URL');
        await p.reload({ waitUntil: 'networkidle' });
        await p.waitForTimeout(1000);
        ok(await canvasImgSrc(p) === DATA_URI, 'after reload the image still resolves from IDB');
        await p.close();
    });

    // ---------- S4: conversion failure falls back to the raw URL ----------
    await section('S4 conversion failure falls back to the raw URL', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const failUrl = `${BASE}/iseed-fail.png`;
        await p.route('**/v1/ideogram-v4/generate', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ data: [{ url: failUrl }] }),
        }));
        // The conversion fetch (first hit) fails -> saveGeneratedImage must keep
        // the raw URL. Later hits are the browser's own <img> loads, which
        // succeed — a URL that 500s on every load makes RN-web's Image drop
        // itself from the DOM entirely (ERRORED state, no defaultSource).
        let failImgHits = 0;
        await p.route('**/iseed-fail.png', (route) => {
            failImgHits++;
            if (failImgHits === 1) {
                return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
            }
            return route.fulfill({ contentType: 'image/png', body: PNG });
        });
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings(),
            handoff: { promptData: JSON.stringify(PROMPT), size: { width: 800, height: 600 } },
        });
        await p.getByText('Generate', { exact: true }).first().click();
        await p.waitForTimeout(1200);
        ok(await canvasImgSrc(p) === failUrl, 'failed conversion keeps the raw URL as the image ref');
        ok(await p.locator('[data-testid="history-thumb-0"] img').getAttribute('src') === failUrl,
            'history thumbnail also keeps the raw URL');
        ok(await p.getByText('Generated (1)').count() === 1, 'image still enters the history despite the failure');
        await p.locator('[data-testid="save-button"]').click();
        await p.waitForTimeout(500);
        const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('drawboard.designs') || '[]'));
        const d = saved.find((x) => x.id === DESIGN_ID);
        ok(d && d.images.length === 1 && d.images[0] === failUrl, 'saved design stores the fallback URL');
        await p.close();
    });

    // ---------- S5: legacy URL designs pass through untouched ----------
    await section('S5 legacy URL pass-through', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const designs = [{
            id: 'legacy-design', prompt: PROMPT, images: [LEGACY_URL],
            size: { width: 800, height: 600 }, updatedAt: 1000,
        }];
        await p.route('**/legacy-img.png', (route) =>
            route.fulfill({ contentType: 'image/png', body: PNG }));
        await gotoSeeded(p, `${BASE}/design?id=legacy-design`, { designs });
        ok(await canvasImgSrc(p) === LEGACY_URL, 'legacy design renders its original URL unmodified');
        await p.close();
    });

    // ---------- S6: home wall resolves mixed refs ----------
    await section('S6 home wall', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const designs = [
            { id: 'idb-design', prompt: PROMPT, images: [SEED_IDB_ID], size: { width: 800, height: 600 }, updatedAt: 3000 },
            { id: 'legacy-design', prompt: PROMPT, images: [LEGACY_URL], size: { width: 800, height: 600 }, updatedAt: 2000 },
            { id: 'noimg-design', prompt: PROMPT, images: [], size: { width: 800, height: 600 }, updatedAt: 1000 },
        ];
        await p.route('**/legacy-img.png', (route) =>
            route.fulfill({ contentType: 'image/png', body: PNG }));
        await gotoSeeded(p, `${BASE}/`, {
            designs,
            idbRecords: [{ id: SEED_IDB_ID, uri: DATA_URI, createdAt: 1 }],
        });
        // The wall only renders in the Recent Designs section.
        await p.locator('[data-testid="nav-recent-designs"]').click();
        await p.waitForTimeout(600);
        ok(await p.locator('[data-testid="wall-tile-idb-design"] img').getAttribute('src') === DATA_URI,
            'IDB-backed wall tile shows the data URI');
        ok(await p.locator('[data-testid="wall-tile-legacy-design"] img').getAttribute('src') === LEGACY_URL,
            'legacy wall tile keeps its URL');
        ok(await p.locator('[data-testid="wall-tile-noimg-design"]').count() === 0,
            'image-less design gets no wall tile');
        await p.close();
    });

    // ---------- S7: download the persisted image ----------
    await section('S7 download of the persisted image', async () => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const designs = [{
            id: DESIGN_ID, prompt: PROMPT, images: [SEED_IDB_ID],
            size: { width: 800, height: 600 }, updatedAt: 1000,
        }];
        await gotoSeeded(p, `${BASE}/design?id=${DESIGN_ID}`, {
            settings: mkSettings(),
            designs,
            idbRecords: [{ id: SEED_IDB_ID, uri: DATA_URI, createdAt: 1 }],
        });
        const [download] = await Promise.all([
            p.waitForEvent('download', { timeout: 15000 }),
            p.getByText('Download Image', { exact: true }).click(),
        ]);
        ok(download.suggestedFilename() === `${DESIGN_ID}.png`, `download filename is ${DESIGN_ID}.png (got ${download.suggestedFilename()})`);
        await p.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('IMAGE_STORE E2E ERROR:', e); process.exit(1); });
