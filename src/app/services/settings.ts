export type VendorProvider = 'OpenAI' | 'Google' | 'DeepSeek' | 'GLM' | 'Qwen';
export type SelfHostedProvider = 'vLLM' | 'SGLang' | 'Ollama';
export type LlmProvider = VendorProvider | SelfHostedProvider;
export type ImageProvider = 'Official' | 'Custom';

/**
 * One LLM config (endpoint / credential / model name). Each provider keeps its
 * own profile in localStorage, so switching providers only changes which
 * profile is active — the others are preserved, never overwritten.
 */
export interface LlmProfile {
    endpoint: string;
    secretKey: string;
    name: string;
}

/**
 * User-configurable endpoints/credentials, persisted in localStorage.
 * `llmProvider` selects the active profile in `llmProfiles`; preset vendors
 * ignore the profile's endpoint (they use their OpenAI-compatible base URL).
 * The image endpoint is only used for the "Custom" image provider (Official
 * uses the Ideogram 4 API).
 */
export interface Settings {
    llmProvider: LlmProvider;
    llmProfiles: Record<LlmProvider, LlmProfile>;
    imageProvider: ImageProvider;
    imageEndpoint: string;
    imageSecretKey: string;
}

const STORAGE_KEY = 'drawboard.settings';

/**
 * Official Ideogram 4 API base. A "Custom" deployment mirrors the official
 * request path, so both providers share the same generate endpoint suffix.
 */
export const IDEOGRAM_OFFICIAL_BASE = 'https://api.ideogram.ai';
export const IDEOGRAM_GENERATE_PATH = '/v1/ideogram-v4/generate';
export const DEFAULT_IMAGE_BASE = 'http://127.0.0.1:8000';
/** Appended to the LLM endpoint (vendor base or self-hosted) to form the request URL. */
export const LLM_CHAT_PATH = '/chat/completions';
/** Ollama speaks its native /api/chat dialect (docs.ollama.com/api/chat) instead. */
export const LLM_OLLAMA_CHAT_PATH = '/api/chat';

/** OpenAI-compatible API base URLs for the preset vendors (getLlmUrl appends LLM_CHAT_PATH). */
export const LLM_VENDOR_ENDPOINTS: Record<VendorProvider, string> = {
    OpenAI: 'https://api.openai.com/v1',
    Google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    DeepSeek: 'https://api.deepseek.com/v1',
    GLM: 'https://open.bigmodel.cn/api/paas/v4',
    Qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
};

export const LLM_SELF_HOSTED_PROVIDERS: SelfHostedProvider[] = ['vLLM', 'SGLang', 'Ollama'];
/** Conventional base URLs of the self-hosted backends, prefilled when chosen.
 *  vLLM/SGLang are OpenAI-compatible; Ollama's native API has no /v1 prefix. */
export const LLM_SELF_HOSTED_DEFAULTS: Record<SelfHostedProvider, string> = {
    vLLM: 'http://localhost:8000/v1',
    SGLang: 'http://localhost:30000/v1',
    Ollama: 'http://localhost:11434',
};

export const LLM_PROVIDERS: LlmProvider[] = [...Object.keys(LLM_VENDOR_ENDPOINTS) as VendorProvider[], ...LLM_SELF_HOSTED_PROVIDERS];
export const IMAGE_PROVIDERS: ImageProvider[] = ['Official', 'Custom'];

/** Self-hosted backends (user endpoint, optional key) vs preset vendors. */
export const isSelfHostedLlm = (p: string): p is SelfHostedProvider =>
    (LLM_SELF_HOSTED_PROVIDERS as string[]).includes(p);

export const emptyLlmProfile = (): LlmProfile => ({ endpoint: '', secretKey: '', name: '' });
const defaultLlmProfiles = (): Record<LlmProvider, LlmProfile> => ({
    OpenAI: emptyLlmProfile(),
    Google: emptyLlmProfile(),
    DeepSeek: emptyLlmProfile(),
    GLM: emptyLlmProfile(),
    Qwen: emptyLlmProfile(),
    vLLM: emptyLlmProfile(),
    SGLang: emptyLlmProfile(),
    Ollama: emptyLlmProfile(),
});

const DEFAULTS: Settings = {
    llmProvider: 'OpenAI',
    llmProfiles: defaultLlmProfiles(),
    imageProvider: 'Custom',
    imageEndpoint: DEFAULT_IMAGE_BASE,
    imageSecretKey: '',
};

/** The LLM config of the currently selected provider. */
export function getActiveLlmProfile(s: Settings): LlmProfile {
    return s.llmProfiles?.[s.llmProvider] ?? emptyLlmProfile();
}

export function loadSettings(): Settings {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULTS, llmProfiles: defaultLlmProfiles() };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS, llmProfiles: defaultLlmProfiles() };
        const parsed = JSON.parse(raw) as Partial<Settings> & {
            llmEndpoint?: string; llmSecretKey?: string; llmName?: string;
        };
        // Migrate the legacy flat shape (single llmEndpoint/llmSecretKey/llmName,
        // optional "Custom" provider) into a per-provider profile map.
        if (!parsed.llmProfiles || typeof parsed.llmProfiles !== 'object') {
            const provider: LlmProvider = (parsed.llmProvider as string) === 'Custom'
                ? 'vLLM'
                : (LLM_PROVIDERS.includes(parsed.llmProvider as LlmProvider) ? parsed.llmProvider as LlmProvider : 'OpenAI');
            parsed.llmProvider = provider;
            parsed.llmProfiles = {
                ...defaultLlmProfiles(),
                [provider]: {
                    endpoint: parsed.llmEndpoint ?? '',
                    secretKey: parsed.llmSecretKey ?? '',
                    name: parsed.llmName ?? '',
                },
            };
        }
        const merged: Settings = { ...DEFAULTS, ...parsed };
        // Guard against partial/corrupt profile maps: backfill missing providers.
        merged.llmProfiles = { ...defaultLlmProfiles(), ...parsed.llmProfiles };
        return merged;
    } catch (e) {
        console.error('Failed to load settings', e);
        return { ...DEFAULTS, llmProfiles: defaultLlmProfiles() };
    }
}

export function saveSettings(settings: Settings): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings', e);
    }
}

/** The full chat URL for the configured LLM (vendor base or self-hosted).
 *  Ollama uses its native /api/chat path; everything else is /chat/completions. */
export function getLlmUrl(s: Settings): string {
    const base = (isSelfHostedLlm(s.llmProvider)
        ? getActiveLlmProfile(s).endpoint
        : LLM_VENDOR_ENDPOINTS[s.llmProvider]).trim();
    const path = s.llmProvider === 'Ollama' ? LLM_OLLAMA_CHAT_PATH : LLM_CHAT_PATH;
    return `${base.replace(/\/+$/, '')}${path}`;
}

/** The full Ideogram generate URL for the configured image provider. */
export function getImageUrl(s: Settings): string {
    const base = (s.imageProvider === 'Custom' ? s.imageEndpoint : IDEOGRAM_OFFICIAL_BASE).trim();
    return `${base.replace(/\/+$/, '')}${IDEOGRAM_GENERATE_PATH}`;
}

/**
 * Names of the settings still missing for a full generate run (empty = ready).
 * Checks the ACTIVE LLM profile: its model name is always required; self-hosted
 * providers need an endpoint, preset vendors a secret key. Official image
 * generation requires a secret key (Custom may be empty).
 */
export function getMissingSettings(s: Settings): string[] {
    const profile = getActiveLlmProfile(s);
    const missing: string[] = [];
    if (!profile.name.trim()) missing.push('LLM name');
    if (isSelfHostedLlm(s.llmProvider) && !profile.endpoint.trim()) missing.push('LLM endpoint');
    if (!isSelfHostedLlm(s.llmProvider) && !profile.secretKey.trim()) missing.push('LLM secret key');
    if (s.imageProvider === 'Custom' && !s.imageEndpoint.trim()) missing.push('Image generation endpoint');
    if (s.imageProvider === 'Official' && !s.imageSecretKey.trim()) missing.push('Image generation secret key');
    return missing;
}
