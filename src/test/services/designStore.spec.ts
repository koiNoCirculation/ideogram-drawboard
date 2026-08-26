import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { cameFromHome, markNavigationFromHome } from '../../app/services/designStore';

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
