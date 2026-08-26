import { afterEach, beforeEach, expect, test } from '@jest/globals';
import {
    cameFromHome,
    getDesign,
    getDesignHandoff,
    markNavigationFromHome,
    setDesignHandoff,
    upsertDesign,
} from '../../app/services/designStore';
import { RefinedPrompt } from '../../app/types';

// The jest-expo environment exposes window but no sessionStorage; use a small
// in-memory stand-in.
const createMemoryStorage = (): Storage => {
    let map = new Map<string, string>();
    return {
        get length() { return map.size; },
        clear: () => { map = new Map(); },
        getItem: (k) => (map.has(k) ? map.get(k)! : null),
        key: (i) => [...map.keys()][i] ?? null,
        removeItem: (k) => { map.delete(k); },
        setItem: (k, v) => { map.set(k, String(v)); },
    };
};

beforeEach(() => {
    (window as { sessionStorage?: Storage }).sessionStorage = createMemoryStorage();
});

afterEach(() => {
    (window as { sessionStorage?: Storage }).sessionStorage = undefined;
});

test('cameFromHome: false before any navigation from the home page', () => {
    expect(cameFromHome()).toBe(false);
});

test('markNavigationFromHome: the flag is set and survives "refresh" (same session)', () => {
    markNavigationFromHome();
    expect(cameFromHome()).toBe(true);
    // A second navigation re-arms the same flag (idempotent).
    markNavigationFromHome();
    expect(cameFromHome()).toBe(true);
});

test('cameFromHome: false when sessionStorage is unavailable', () => {
    (window as { sessionStorage?: Storage }).sessionStorage = undefined;
    expect(cameFromHome()).toBe(false);
    expect(() => markNavigationFromHome()).not.toThrow();
});

// --- raw prompt bookkeeping (Show Prompt dialog) ---

const samplePrompt: RefinedPrompt = {
    aspect_ratio: '4:3',
    high_level_description: 'A test scene',
    compositional_deconstruction: {
        background: 'a studio backdrop',
        elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'A dog.' }],
    },
};

const withLocalStorage = (fn: () => void) => {
    (window as { localStorage?: Storage }).localStorage = createMemoryStorage();
    try {
        fn();
    } finally {
        (window as { localStorage?: Storage }).localStorage = undefined;
    }
};

test('handoff keeps the raw prompt so a fresh design can show it', () => {
    withLocalStorage(() => {
        setDesignHandoff('d1', {
            promptData: JSON.stringify(samplePrompt),
            size: { width: 1024, height: 768 },
            rawPrompt: 'a dog in a studio',
        });
        const handoff = getDesignHandoff('d1');
        expect(handoff?.rawPrompt).toBe('a dog in a studio');
        // A handoff without rawPrompt (legacy shape) still resolves.
        setDesignHandoff('d2', { promptData: '{}', size: { width: 1, height: 1 } });
        expect(getDesignHandoff('d2')?.rawPrompt).toBeUndefined();
    });
});

test('saved designs persist the raw prompt for re-open; legacy designs stay absent', () => {
    withLocalStorage(() => {
        upsertDesign({
            id: 'd1',
            prompt: samplePrompt,
            images: [],
            size: { width: 1024, height: 768 },
            updatedAt: 1,
            rawPrompt: 'a dog in a studio',
        });
        upsertDesign({
            id: 'd2',
            prompt: samplePrompt,
            images: [],
            size: { width: 1024, height: 768 },
            updatedAt: 2,
        });
        expect(getDesign('d1')?.rawPrompt).toBe('a dog in a studio');
        expect(getDesign('d2')?.rawPrompt).toBeUndefined();
        // Re-saving keeps the raw prompt (upsert, not a fresh record).
        upsertDesign({
            id: 'd1',
            prompt: samplePrompt,
            images: [],
            size: { width: 1024, height: 768 },
            updatedAt: 3,
            rawPrompt: 'a dog in a studio',
        });
        expect(getDesign('d1')?.rawPrompt).toBe('a dog in a studio');
    });
});
