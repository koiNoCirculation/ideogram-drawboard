import {
    DEFAULT_LOCALE,
    LOCALE_FLAGS,
    LOCALE_NAMES,
    LOCALES,
    LOCALE_STORAGE_KEY,
    TranslationKey,
    loadLocale,
    persistLocale,
    translate,
    translations,
} from '../../i18n';

// The jest-expo environment exposes window but no localStorage; use a small
// in-memory stand-in (same pattern as designStore.spec.ts).
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
    (window as { localStorage?: Storage }).localStorage = createMemoryStorage();
});

afterEach(() => {
    (window as { localStorage?: Storage }).localStorage = undefined;
});

describe('i18n locale storage', () => {
    it('defaults to en-US when nothing is stored', () => {
        expect(DEFAULT_LOCALE).toBe('en-US');
        expect(loadLocale()).toBe('en-US');
    });

    const storage = () => (window as { localStorage: Storage }).localStorage;

    it('loadLocale returns a stored valid locale', () => {
        storage().setItem(LOCALE_STORAGE_KEY, 'zh-CN');
        expect(loadLocale()).toBe('zh-CN');
    });

    it('loadLocale falls back to the default for an invalid stored value', () => {
        storage().setItem(LOCALE_STORAGE_KEY, 'fr-FR');
        expect(loadLocale()).toBe('en-US');
        storage().setItem(LOCALE_STORAGE_KEY, 'not-json');
        expect(loadLocale()).toBe('en-US');
    });

    it('persistLocale writes the choice back to localStorage', () => {
        persistLocale('zh-CN');
        expect(storage().getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
        expect(loadLocale()).toBe('zh-CN');
    });
});

describe('translate', () => {
    it('returns the required English strings', () => {
        expect(translate('en-US', 'recentDesigns')).toBe('Recent Designs');
        expect(translate('en-US', 'enterDescription')).toBe('Enter the description of your dreamed image');
        expect(translate('en-US', 'widthLabel')).toBe('Width (W)');
        expect(translate('en-US', 'heightLabel')).toBe('Height (H)');
        expect(translate('en-US', 'startDesign')).toBe('Start Design');
        expect(translate('en-US', 'aesthetics')).toBe('Aesthetics');
        expect(translate('en-US', 'lighting')).toBe('Lighting');
        expect(translate('en-US', 'photo')).toBe('Photo');
        expect(translate('en-US', 'medium')).toBe('Medium');
        expect(translate('en-US', 'artStyle')).toBe('Art Style');
        expect(translate('en-US', 'palette')).toBe('Palette');
        expect(translate('en-US', 'background')).toBe('Background');
        expect(translate('en-US', 'generated')).toBe('Generated');
        expect(translate('en-US', 'showGrid')).toBe('Show grid');
        expect(translate('en-US', 'showElements')).toBe('Show elements');
        expect(translate('en-US', 'save')).toBe('Save');
        expect(translate('en-US', 'generate')).toBe('Generate');
        expect(translate('en-US', 'downloadImage')).toBe('Download Image');
        expect(translate('en-US', 'showPrompt')).toBe('Show Prompt');
        expect(translate('en-US', 'originalPrompt')).toBe('Original Prompt');
        expect(translate('en-US', 'enhancedPrompt')).toBe('Structured Prompt');
        expect(translate('en-US', 'saveSettings')).toBe('Save Settings');
    });

    it('returns the required Chinese strings', () => {
        expect(translate('zh-CN', 'recentDesigns')).toBe('最近的设计');
        expect(translate('zh-CN', 'enterDescription')).toBe('描述你想要的图片');
        expect(translate('zh-CN', 'widthLabel')).toBe('宽度');
        expect(translate('zh-CN', 'heightLabel')).toBe('高度');
        expect(translate('zh-CN', 'startDesign')).toBe('开始设计');
        expect(translate('zh-CN', 'aesthetics')).toBe('美学关键字');
        expect(translate('zh-CN', 'lighting')).toBe('光照关键字');
        expect(translate('zh-CN', 'photo')).toBe('照片关键字');
        expect(translate('zh-CN', 'medium')).toBe('载体关键字');
        expect(translate('zh-CN', 'artStyle')).toBe('艺术风格关键字');
        expect(translate('zh-CN', 'palette')).toBe('调色盘');
        expect(translate('zh-CN', 'background')).toBe('背景');
        expect(translate('zh-CN', 'generated')).toBe('已生成');
        expect(translate('zh-CN', 'showGrid')).toBe('网格显示');
        expect(translate('zh-CN', 'showElements')).toBe('元素显示');
        expect(translate('zh-CN', 'save')).toBe('保存设计');
        expect(translate('zh-CN', 'generate')).toBe('生成图片');
        expect(translate('zh-CN', 'downloadImage')).toBe('下载图片');
        expect(translate('zh-CN', 'showPrompt')).toBe('显示 Prompt');
        expect(translate('zh-CN', 'originalPrompt')).toBe('原始 Prompt');
        expect(translate('zh-CN', 'enhancedPrompt')).toBe('结构化 Prompt');
        expect(translate('zh-CN', 'saveSettings')).toBe('保存设置');
    });

    it('substitutes {placeholder} variables', () => {
        expect(translate('en-US', 'genEmptyElement', { n: 3, field: 'description' }))
            .toBe('Element 3 is empty — right-click it on the canvas to edit its description.');
        expect(translate('zh-CN', 'genEmptyElement', { n: 3, field: '描述' }))
            .toBe('元素 3 为空 — 请在画布上右键点击它，以编辑其描述。');
        expect(translate('en-US', 'refineRetrying', { n: 2, max: 3 }))
            .toBe('The LLM returned invalid JSON — retrying (2 of 3)…');
    });

    it('passes unknown keys through unchanged', () => {
        expect(translate('en-US', 'nope_missing' as TranslationKey)).toBe('nope_missing');
    });

    it('has every key in both locales, with no empty values', () => {
        for (const locale of LOCALES) {
            const keys = Object.keys(translations['en-US']) as TranslationKey[];
            expect(Object.keys(translations[locale]).sort()).toEqual([...keys].sort());
            for (const key of keys) {
                expect(translations[locale][key].trim().length).toBeGreaterThan(0);
            }
            expect(LOCALE_FLAGS[locale]).toBeDefined();
        }
    });

    it('labels every locale with its endonym in the switcher', () => {
        expect(LOCALE_NAMES['en-US']).toBe('English');
        expect(LOCALE_NAMES['zh-CN']).toBe('中文');
        for (const locale of LOCALES) {
            expect(LOCALE_NAMES[locale].trim().length).toBeGreaterThan(0);
        }
    });
});
