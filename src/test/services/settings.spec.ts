import { expect, test } from '@jest/globals';
import {
    DEFAULT_IMAGE_BASE,
    LLM_CHAT_PATH,
    LLM_OLLAMA_CHAT_PATH,
    LLM_SELF_HOSTED_DEFAULTS,
    LLM_VENDOR_ENDPOINTS,
    LlmProfile,
    Settings,
    emptyLlmProfile,
    getActiveLlmProfile,
    getLlmUrl,
    getImageBase,
    getImageUrl,
    getMissingSettings,
    loadSettings,
} from '../../app/services/settings';

const profile = (p: Partial<LlmProfile> = {}): LlmProfile => ({ ...emptyLlmProfile(), ...p });
const allProfiles = (overrides: Partial<Record<string, LlmProfile>> = {}): Settings['llmProfiles'] => ({
    OpenAI: profile({ secretKey: 'sk-test', name: 'gpt-4o' }),
    Google: profile(),
    DeepSeek: profile(),
    GLM: profile(),
    Qwen: profile(),
    vLLM: profile(),
    SGLang: profile(),
    Ollama: profile(),
    ...overrides,
});
const base: Settings = {
    llmProvider: 'OpenAI',
    llmProfiles: allProfiles(),
    imageProvider: 'Custom',
    imageEndpoint: 'http://127.0.0.1:8000',
    imageSecretKey: '',
};

test('getLlmUrl: preset providers use their vendor base plus /chat/completions', () => {
    for (const provider of ['OpenAI', 'Google', 'DeepSeek', 'GLM', 'Qwen'] as const) {
        expect(getLlmUrl({ ...base, llmProvider: provider }))
            .toBe(`${LLM_VENDOR_ENDPOINTS[provider]}${LLM_CHAT_PATH}`);
    }
});

test('getLlmUrl: self-hosted backends use the active profile base, trimmed', () => {
    for (const provider of ['vLLM', 'SGLang'] as const) {
        expect(getLlmUrl({
            ...base,
            llmProvider: provider,
            llmProfiles: allProfiles({ [provider]: profile({ endpoint: ' http://proxy:9000/v1 ' }) }),
        })).toBe(`http://proxy:9000/v1${LLM_CHAT_PATH}`);
    }
    // Ollama uses its native /api/chat path instead of /chat/completions.
    expect(getLlmUrl({
        ...base,
        llmProvider: 'Ollama',
        llmProfiles: allProfiles({ Ollama: profile({ endpoint: ' http://proxy:9000 ' }) }),
    })).toBe(`http://proxy:9000${LLM_OLLAMA_CHAT_PATH}`);
    // A trailing slash on the base is tolerated.
    expect(getLlmUrl({
        ...base,
        llmProvider: 'vLLM',
        llmProfiles: allProfiles({ vLLM: profile({ endpoint: 'http://proxy:9000/v1/' }) }),
    })).toBe(`http://proxy:9000/v1${LLM_CHAT_PATH}`);
});

test('self-hosted defaults are the conventional local addresses', () => {
    expect(LLM_SELF_HOSTED_DEFAULTS).toEqual({
        vLLM: 'http://localhost:8000/v1',
        SGLang: 'http://localhost:30000/v1',
        Ollama: 'http://localhost:11434',
    });
});

test('getActiveLlmProfile returns the selected provider profile', () => {
    const s = { ...base, llmProfiles: allProfiles({ Ollama: profile({ endpoint: 'http://o', secretKey: 'k', name: 'qwen3' }) }) };
    expect(getActiveLlmProfile(s)).toEqual(profile({ secretKey: 'sk-test', name: 'gpt-4o' }));
    expect(getActiveLlmProfile({ ...s, llmProvider: 'Ollama' })).toEqual(profile({ endpoint: 'http://o', secretKey: 'k', name: 'qwen3' }));
});

test('getImageUrl: Official requests the bare path with no prefix, Custom uses endpoint plus path', () => {
    // Official requests exactly /v1/ideogram-v4/generate with no host prefix —
    // any stored endpoint (e.g. a worker URL) is ignored for this provider.
    expect(getImageUrl({ ...base, imageProvider: 'Official', imageEndpoint: 'https://w.test:8788' }))
        .toBe('/v1/ideogram-v4/generate');
    expect(getImageUrl(base)).toBe(`${DEFAULT_IMAGE_BASE}/v1/ideogram-v4/generate`);
    // A trailing slash on the user base is tolerated.
    expect(getImageUrl({ ...base, imageEndpoint: 'http://127.0.0.1:8000/' }))
        .toBe(`${DEFAULT_IMAGE_BASE}/v1/ideogram-v4/generate`);
});

test('getImageBase: Official has no prefix (empty base), Custom is the endpoint (no trailing slash)', () => {
    expect(getImageBase({ ...base, imageProvider: 'Official', imageEndpoint: 'https://w.test:8788/' }))
        .toBe('');
    expect(getImageBase({ ...base, imageEndpoint: 'http://127.0.0.1:8000/' })).toBe(DEFAULT_IMAGE_BASE);
});

test('getMissingSettings: complete config reports nothing', () => {
    expect(getMissingSettings(base)).toEqual([]);
    expect(getMissingSettings({ ...base, imageProvider: 'Official', imageSecretKey: 'idk-test' })).toEqual([]);
});

test('getMissingSettings: names each missing item of the active profile', () => {
    expect(getMissingSettings({ ...base, llmProfiles: allProfiles({ OpenAI: profile({ secretKey: 'sk-test' }) }) }))
        .toEqual(['LLM name']);
    expect(getMissingSettings({
        ...base,
        llmProvider: 'vLLM',
        llmProfiles: allProfiles({ vLLM: profile({ name: 'm' }) }),
    })).toEqual(['LLM endpoint']);
    expect(getMissingSettings({ ...base, llmProfiles: allProfiles({ OpenAI: profile({ name: 'gpt-4o' }) }) }))
        .toEqual(['LLM secret key']);
    expect(getMissingSettings({ ...base, imageProvider: 'Custom', imageEndpoint: '' })).toEqual(['Image generation endpoint']);
    expect(getMissingSettings({ ...base, imageProvider: 'Official', imageSecretKey: '' })).toEqual(['Image generation secret key']);
});

test('getMissingSettings: keys may be empty only for self-hosted LLM / Custom image providers', () => {
    // Self-hosted LLM with an empty key is fine; Custom image with an empty key is fine.
    expect(getMissingSettings({
        ...base,
        llmProvider: 'Ollama',
        llmProfiles: allProfiles({ Ollama: profile({ endpoint: 'http://x/y', name: 'm' }) }),
    })).toEqual([]);
    // A preset LLM provider with an empty key is NOT.
    expect(getMissingSettings({ ...base, llmProfiles: allProfiles({ OpenAI: profile({ name: 'gpt-4o' }) }) }))
        .toEqual(['LLM secret key']);
});

test('per-provider profiles are independent: switching provider does not share fields', () => {
    const s: Settings = {
        ...base,
        llmProfiles: allProfiles({
            OpenAI: profile({ secretKey: 'sk-a', name: 'gpt-4o' }),
            vLLM: profile({ endpoint: 'http://a:8000/v1', name: 'local-model' }),
        }),
    };
    expect(getMissingSettings(s)).toEqual([]);
    expect(getMissingSettings({ ...s, llmProvider: 'vLLM' })).toEqual([]);
    // Switching to OpenAI must not lose the vLLM profile.
    expect(s.llmProfiles.vLLM).toEqual(profile({ endpoint: 'http://a:8000/v1', name: 'local-model' }));
    expect(getLlmUrl({ ...s, llmProvider: 'vLLM' })).toBe(`http://a:8000/v1${LLM_CHAT_PATH}`);
});

test('loadSettings: returns defaults when nothing is stored (node env has no localStorage)', () => {
    const s = loadSettings();
    expect(s.llmProvider).toBe('OpenAI');
    expect(s.imageProvider).toBe('Custom');
    expect(s.imageEndpoint).toBe(DEFAULT_IMAGE_BASE);
    expect(s.llmProfiles.OpenAI).toEqual(profile());
    expect(Object.keys(s.llmProfiles)).toHaveLength(8);
});
