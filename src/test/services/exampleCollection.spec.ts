import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import { RefinedPrompt } from '../../app/types';
import { HttpError } from '../../app/services/requestError';

// 1x1 PNG, same fixture the other suites use.
const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// Copy out of the Node Buffer pool (Buffer.from on a short string is a slice
// of a shared 8KB ArrayBuffer, whose .buffer would carry unrelated bytes).
const PNG_BYTES = new Uint8Array(Buffer.from(PNG_B64, 'base64'));
const EXPECTED_URI = `data:image/png;base64,${PNG_B64}`;

// The image store's dbPromise is a module-level singleton, so each test gets a
// fresh module instance AND a fresh in-memory IDB factory: no record or open
// state leaks between tests.
let exampleCollection: typeof import('../../app/services/exampleCollection');
let imageStore: typeof import('../../app/services/imageStore');

const JSONPROMPT: RefinedPrompt = {
    aspect_ratio: '1:1',
    high_level_description: 'HLD',
    style_description: { medium: 'photograph', color_palette: ['#111111'] },
    compositional_deconstruction: {
        background: 'bg',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'an element' }],
    },
};

const ENTRY = {
    prompt: 'ORIGINAL PROMPT',
    jsonprompt: JSONPROMPT,
    url: '/example_collection/design-mt9mlklo-8y6fyf.png',
};
const STABLE_ID = 'img-design-mt9mlklo-8y6fyf';

// json url -> the collection payload; image url -> PNG bytes (or a reject).
function stubFetch(payload: any, imageFail = false) {
    (global as any).fetch = jest.fn((url: string) => {
        if (typeof url === 'string' && url.endsWith('.json')) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
        }
        if (imageFail) return Promise.reject(new Error('image offline'));
        return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer),
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
        });
    });
}

const fetchCalls = () => ((global as any).fetch as jest.Mock).mock.calls.map((c: any[]) => c[0]);

beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
    (console as any).error = jest.fn();
    jest.resetModules();
    imageStore = require('../../app/services/imageStore');
    exampleCollection = require('../../app/services/exampleCollection');
});

afterEach(() => {
    delete (global as any).fetch;
    delete (globalThis as any).indexedDB;
    jest.restoreAllMocks();
});

test('loadExampleCollection: fetches the collection and persists each image under a stable id', async () => {
    stubFetch([ENTRY]);
    const { entries, error } = await exampleCollection.loadExampleCollection();

    expect(error).toBeNull();
    expect(fetchCalls()).toEqual(['/example_collection/example.json', ENTRY.url]);
    expect(entries).toHaveLength(1);
    expect(entries[0].imageId).toBe(STABLE_ID);
    expect(await imageStore.resolveImageRef(STABLE_ID)).toBe(EXPECTED_URI);
});

test('loadExampleCollection: an image already in the store is not re-fetched', async () => {
    await imageStore.saveGeneratedImage(ENTRY.url, STABLE_ID); // 1 image fetch
    stubFetch([ENTRY]);
    const { entries } = await exampleCollection.loadExampleCollection();

    const imageFetches = fetchCalls().filter((u) => u === ENTRY.url);
    expect(imageFetches).toHaveLength(1); // only the pre-seed, not a second one
    expect(entries[0].imageId).toBe(STABLE_ID);
});

test('loadExampleCollection: invalid entries are filtered out', async () => {
    stubFetch([ENTRY, { url: '', jsonprompt: JSONPROMPT, prompt: 'x' }, { url: '/a.png', prompt: 42 }]);
    const { entries } = await exampleCollection.loadExampleCollection();
    expect(entries).toHaveLength(1);
    expect(entries[0].imageId).toBe(STABLE_ID);
});

test('loadExampleCollection: an image that fails to persist gets imageId null (others unaffected)', async () => {
    const other = { ...ENTRY, url: '/example_collection/design-other-999.png' };
    stubFetch([ENTRY, other]);
    // Fail only the first entry's image by making fetch reject for its url.
    (global as any).fetch = jest.fn((url: string) => {
        if (typeof url === 'string' && url.endsWith('.json')) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([ENTRY, other]) });
        }
        if (url === ENTRY.url) return Promise.reject(new Error('image offline'));
        return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer),
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
        });
    });
    const { entries, error } = await exampleCollection.loadExampleCollection();
    // A single failing image stays silent (no collection error).
    expect(error).toBeNull();
    expect(entries[0].imageId).toBeNull();
    expect(entries[1].imageId).toBe('img-design-other-999');
});

test('loadExampleCollection: non-2xx collection response -> empty list + HttpError with the status', async () => {
    (global as any).fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve([ENTRY]) }));
    // require() fresh: jest.resetModules() re-instantiated requestError for
    // the exampleCollection module, so the top-level import's class is stale.
    const { HttpError } = require('../../app/services/requestError');
    const result = await exampleCollection.loadExampleCollection();
    expect(result.entries).toEqual([]);
    expect(result.error).toBeInstanceOf(HttpError);
    expect((result.error as HttpError).status).toBe(404);
});

test('loadExampleCollection: a non-array payload -> empty list + error', async () => {
    stubFetch({ prompt: 'not an array' });
    const result = await exampleCollection.loadExampleCollection();
    expect(result.entries).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
});

test('loadExampleCollection: a network failure -> empty list + error (no throw)', async () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const result = await exampleCollection.loadExampleCollection();
    expect(result.entries).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
});

test('sizeFromRatio: 1:1 -> square baseline, landscape -> width baseline, portrait -> height baseline', () => {
    expect(exampleCollection.sizeFromRatio('1:1')).toEqual({ width: 1024, height: 1024 });
    expect(exampleCollection.sizeFromRatio('4:3')).toEqual({ width: 1024, height: 768 });
    expect(exampleCollection.sizeFromRatio('16:9')).toEqual({ width: 1024, height: 576 });
    expect(exampleCollection.sizeFromRatio('3:4')).toEqual({ width: 768, height: 1024 });
});

test('sizeFromRatio: missing/invalid ratios fall back to a square canvas', () => {
    expect(exampleCollection.sizeFromRatio(undefined)).toEqual({ width: 1024, height: 1024 });
    expect(exampleCollection.sizeFromRatio('')).toEqual({ width: 1024, height: 1024 });
    expect(exampleCollection.sizeFromRatio('bogus')).toEqual({ width: 1024, height: 1024 });
    expect(exampleCollection.sizeFromRatio('0:5')).toEqual({ width: 1024, height: 1024 });
});

test('exampleToDesign: presents the example as a Design (id from url, persisted image id, raw prompt)', () => {
    const design = exampleCollection.exampleToDesign({ ...ENTRY, imageId: STABLE_ID }, 0);
    expect(design.id).toBe('design-mt9mlklo-8y6fyf');
    expect(design.prompt).toBe(JSONPROMPT);
    expect(design.images).toEqual([STABLE_ID]);
    expect(design.rawPrompt).toBe('ORIGINAL PROMPT');
    expect(design.size).toEqual({ width: 1024, height: 1024 });
});

test('exampleToDesign: size follows a non-square aspect ratio', () => {
    const landscape = { ...ENTRY, imageId: STABLE_ID, jsonprompt: { ...JSONPROMPT, aspect_ratio: '16:9' } };
    expect(exampleCollection.exampleToDesign(landscape, 1).size).toEqual({ width: 1024, height: 576 });
});

test('exampleToDesign: a url without a usable filename falls back to a positional id; a failed image means no tile', () => {
    const noName = { ...ENTRY, url: '/', imageId: STABLE_ID };
    expect(exampleCollection.exampleToDesign(noName, 3).id).toBe('example-3');
    // imageId null (persistence failed) -> no image -> the wall renders no tile.
    expect(exampleCollection.exampleToDesign({ ...ENTRY, imageId: null }, 0).images).toEqual([]);
});
