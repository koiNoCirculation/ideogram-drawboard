import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, Locale, TranslationKey, translations } from './translations';

// Read the persisted UI language from localStorage; missing/invalid values
// (and a missing localStorage, e.g. in unit tests) fall back to the default.
export function loadLocale(): Locale {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_LOCALE;
    try {
        const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (raw === 'en-US' || raw === 'zh-CN') return raw;
    } catch {
        // localStorage unavailable — keep the default.
    }
    return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // localStorage unavailable — the choice simply won't survive a reload.
    }
}

// Translate a key in the active locale, substituting `{name}` placeholders
// from `vars`. Unknown keys pass through (they surface as the key name, which
// is itself a usable error message).
export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
    let text: string = translations[locale][key] ?? key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            text = text.split(`{${name}}`).join(String(value));
        }
    }
    return text;
}

type I18nValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue>({
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key) => translate(DEFAULT_LOCALE, key),
});

/**
 * Provides the active UI locale (persisted in localStorage) and a `t` lookup
 * to every screen. Wraps the router Stack in the root layout.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(loadLocale);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        persistLocale(next);
    }, []);

    const t = useCallback(
        (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
        [locale],
    );

    const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
    return useContext(I18nContext);
}
