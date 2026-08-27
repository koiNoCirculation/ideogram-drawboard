import { expect, test, afterEach } from '@jest/globals';
import { getPublicAssetUrl } from '../../app/services/publicAsset';

// babel-preset-expo inlines process.env.EXPO_BASE_URL at build time, but
// skips the inlining under NODE_ENV=test — so the real Node env is readable
// here. Set/delete the var per test and restore afterwards.
const SAVED = process.env.EXPO_BASE_URL;

afterEach(() => {
    if (SAVED === undefined) delete process.env.EXPO_BASE_URL;
    else process.env.EXPO_BASE_URL = SAVED;
});

test('getPublicAssetUrl: without EXPO_BASE_URL the path is unchanged', () => {
    delete process.env.EXPO_BASE_URL;
    expect(getPublicAssetUrl('/system_prompt.txt')).toBe('/system_prompt.txt');
    expect(getPublicAssetUrl('/example_collection/example.json')).toBe('/example_collection/example.json');
});

test('getPublicAssetUrl: with a subpath base the path is prefixed', () => {
    process.env.EXPO_BASE_URL = '/DrawBoard';
    expect(getPublicAssetUrl('/system_prompt.txt')).toBe('/DrawBoard/system_prompt.txt');
    expect(getPublicAssetUrl('/example_collection/example.json')).toBe('/DrawBoard/example_collection/example.json');
});
