import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';

// 1x1 PNG, same fixture the e2e scripts use.
const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// Copy out of the Node Buffer pool (Buffer.from on a short string is a slice
// of a shared 8KB ArrayBuffer, whose .buffer would carry unrelated bytes).
const PNG_BYTES = new Uint8Array(Buffer.from(PNG_B64, 'base64'));
const EXPECTED_URI = `data:image/png;base64,${PNG_B64}`;

// The image store's dbPromise is a module-level singleton, so each test gets
// a fresh module instance AND a fresh in-memory IDB factory: no record or
// open state leaks between tests.
let imageStore: typeof import('../../app/services/imageStore');

function stubFetch(overrides: Record<string, any> = {}) {
    (global as any).fetch = jest.fn(() =>
        Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer),
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
            ...overrides,
        }),
    );
}

beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
    (console as any).error = jest.fn();
    jest.resetModules();
    imageStore = require('../../app/services/imageStore');
    stubFetch();
});

afterEach(() => {
    delete (global as any).fetch;
    delete (globalThis as any).indexedDB;
    jest.restoreAllMocks();
});

test('newImageId: img- prefixed id, unique across calls', () => {
    const a = imageStore.newImageId();
    const b = imageStore.newImageId();
    expect(a).toMatch(/^img-[a-z0-9]+-[a-z0-9]{6}$/);
    expect(b).toMatch(/^img-[a-z0-9]+-[a-z0-9]{6}$/);
    expect(a).not.toBe(b);
});

test('isDirectUri: http/https/data values are direct, ids are not', () => {
    expect(imageStore.isDirectUri('http://x/a.png')).toBe(true);
    expect(imageStore.isDirectUri('https://x/a.png')).toBe(true);
    expect(imageStore.isDirectUri('data:image/png;base64,AAA')).toBe(true);
    expect(imageStore.isDirectUri('img-lx0abc-123456')).toBe(false);
    expect(imageStore.isDirectUri('design-xyz')).toBe(false);
});

test('saveGeneratedImage: stores the base64 data URI under a fresh id', async () => {
    const id = await imageStore.saveGeneratedImage('http://images.test/new.png');
    expect((global as any).fetch).toHaveBeenCalledWith('http://images.test/new.png');
    expect(id).toMatch(/^img-/);
    expect(await imageStore.resolveImageRef(id)).toBe(EXPECTED_URI);
});

test('saveGeneratedImage: fetch failure falls back to the raw URL (and logs)', async () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('CORS')));

    const ref = await imageStore.saveGeneratedImage('http://images.test/new.png');

    expect(ref).toBe('http://images.test/new.png');
    expect((console as any).error).toHaveBeenCalled();
});

test('saveGeneratedImage: non-2xx response falls back to the raw URL', async () => {
    stubFetch({ ok: false, status: 500 });

    const ref = await imageStore.saveGeneratedImage('http://images.test/new.png');

    expect(ref).toBe('http://images.test/new.png');
});

test('saveGeneratedImage: IndexedDB unavailable falls back to the raw URL', async () => {
    delete (globalThis as any).indexedDB;

    const ref = await imageStore.saveGeneratedImage('http://images.test/new.png');

    expect(ref).toBe('http://images.test/new.png');
    expect((console as any).error).toHaveBeenCalled();
});

test('resolveImageRef: URL-like values pass through untouched', async () => {
    expect(await imageStore.resolveImageRef('https://x/legacy.png')).toBe('https://x/legacy.png');
    expect(await imageStore.resolveImageRef('data:image/png;base64,QQ==')).toBe('data:image/png;base64,QQ==');
    // Pass-through must not touch IndexedDB at all.
    delete (globalThis as any).indexedDB;
    expect(await imageStore.resolveImageRef('http://x/legacy.png')).toBe('http://x/legacy.png');
});

test('resolveImageRef: returns the stored data URI for a known id', async () => {
    const id = await imageStore.saveGeneratedImage('http://images.test/new.png');
    expect(await imageStore.resolveImageRef(id)).toBe(EXPECTED_URI);
});

test('resolveImageRef: unknown id resolves to null (no throw)', async () => {
    expect(await imageStore.resolveImageRef('img-doesnotexist')).toBeNull();
});

test('resolveImageRef: IndexedDB unavailable + non-URL ref resolves to null', async () => {
    delete (globalThis as any).indexedDB;

    expect(await imageStore.resolveImageRef('img-lx0abc-123456')).toBeNull();
});
