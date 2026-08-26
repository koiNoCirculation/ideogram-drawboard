import { createPortal } from 'react-dom';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LOCALES, LOCALE_NAMES, Locale } from '../../i18n';
import { useI18n } from '../../i18n';

const MENU_W = 110;
const OPTION_H = 34;

// Flag artwork for the switcher. Regional-indicator emoji (🇺🇸/🇨🇳) render as
// plain "US"/"CN" letter glyphs in browsers whose font stack lacks flag
// presentation, so the flags are drawn as small flag-emoji-style SVGs (rounded
// corners) that render identically in every OS/browser.
const STAR_PATH = 'M0,-1L0.225,-0.309L0.951,-0.309L0.363,0.118L0.588,0.809L0,0.382L-0.588,0.809L-0.363,0.118L-0.951,-0.309L-0.225,-0.309Z';

// US: 13 stripes (7 red), blue canton with a dotted star field.
const US_FLAG_SVG = (() => {
    let stars = '';
    for (let row = 0; row < 6; row++) {
        const y = (1.6 + row * 2.18).toFixed(1);
        const n = row % 2 === 0 ? 6 : 5;
        const x0 = row % 2 === 0 ? 1.8 : 3.0;
        for (let i = 0; i < n; i++) {
            stars += `<circle cx='${(x0 + i * 2.4).toFixed(1)}' cy='${y}' r='0.55'/>`;
        }
    }
    const stripes = [0, 2, 4, 6, 8, 10, 12]
        .map((i) => `<rect y='${(i * 24 / 13).toFixed(3)}' width='36' height='1.846'/>`)
        .join('');
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 24'>`
        + `<clipPath id='c'><rect width='36' height='24' rx='4.5'/></clipPath>`
        + `<g clip-path='url(#c)'>`
        + `<rect width='36' height='24' fill='#F5F5F5'/>`
        + `<g fill='#B22234'>${stripes}</g>`
        + `<rect width='14.769' height='12.923' fill='#3C3B6E'/>`
        + `<g fill='#FFFFFF'>${stars}</g>`
        + `</g></svg>`;
})();

// CN: red field, one large star + four small stars angled toward it.
const CN_FLAG_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 24'>`
    + `<defs><clipPath id='c'><rect width='36' height='24' rx='4.5'/></clipPath>`
    + `<path id='s' d='${STAR_PATH}'/></defs>`
    + `<g clip-path='url(#c)'>`
    + `<rect width='36' height='24' fill='#DE2910'/>`
    + `<g fill='#FFDE00'>`
    + `<use href='#s' transform='translate(6,6) scale(3.6)'/>`
    + `<use href='#s' transform='translate(12,2.4) rotate(239) scale(1.2)'/>`
    + `<use href='#s' transform='translate(14.4,4.8) rotate(262) scale(1.2)'/>`
    + `<use href='#s' transform='translate(14.4,8.4) rotate(-74) scale(1.2)'/>`
    + `<use href='#s' transform='translate(12,10.8) rotate(-51) scale(1.2)'/>`
    + `</g></g></svg>`;

const FLAG_URIS: Record<Locale, string> = {
    'en-US': `data:image/svg+xml;utf8,${encodeURIComponent(US_FLAG_SVG)}`,
    'zh-CN': `data:image/svg+xml;utf8,${encodeURIComponent(CN_FLAG_SVG)}`,
};

// RN-web's <Image> resolves sources through an ImageLoader state machine that
// does not reliably display inline data URIs, so the flag is drawn as a plain
// View with a CSS background — the same mechanism the canvas grid uses.
const flagBackground = (uri: string): any => ({
    backgroundImage: `url("${uri}")`,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
});

/**
 * The UI-language switcher, inserted to the LEFT of the settings gear on
 * every page. Shows the current locale's flag; clicking opens a small
 * dropdown (en-US / zh-CN). The choice is persisted (see the i18n provider).
 * `style` lets the caller position the button (absolute on the home page,
 * in-flow in the design page's header).
 */
export const LanguageSwitcher = ({ style }: { style?: any }) => {
    const { locale, setLocale } = useI18n();
    const [open, setOpen] = useState(false);
    const [menu, setMenu] = useState({ left: 0, top: 0 });

    const openMenu = (e: any) => {
        e?.stopPropagation?.();
        e?.nativeEvent?.stopPropagation?.();
        const rect = e?.currentTarget?.getBoundingClientRect?.();
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const menuH = OPTION_H * LOCALES.length + 4;
        const left = rect
            ? Math.min(Math.max(rect.right - MENU_W, 8), Math.max(8, vw - MENU_W - 8))
            : vw - MENU_W - 16;
        // Prefer below the button; flip above when there is no room.
        const top = rect
            ? (rect.bottom + 6 + menuH > vh - 8
                ? Math.max(8, rect.top - menuH - 6)
                : rect.bottom + 6)
            : 64;
        setMenu({ left, top });
        setOpen(true);
    };

    return (
        <View style={style} pointerEvents="box-none">
            <TouchableOpacity
                style={styles.button}
                testID="lang-switcher"
                onPress={openMenu}
                accessibilityLabel="Language"
            >
                <View
                    testID={`lang-flag-${locale}`}
                    style={[styles.flagImage, flagBackground(FLAG_URIS[locale])]}
                />
            </TouchableOpacity>
            {/* Portal the overlay to document.body so it escapes the screen's
                stacking context and paints above all page content (same
                pattern as the ColorPalette popover). */}
            {open
                ? (typeof document !== 'undefined'
                    ? createPortal(
                        <>
                            {/* Transparent full-viewport catcher: closes on outside click. */}
                            <View style={styles.backdrop} onPointerDown={() => setOpen(false)} />
                            <View
                                style={[styles.menu, { left: menu.left, top: menu.top }]}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                {LOCALES.map((l) => (
                                    <TouchableOpacity
                                        key={l}
                                        testID={`lang-option-${l}`}
                                        style={[styles.option, l === locale && styles.optionActive]}
                                        onPress={() => {
                                            setLocale(l);
                                            setOpen(false);
                                        }}
                                    >
                                        <View
                                            style={[styles.optionFlagImage, flagBackground(FLAG_URIS[l])]}
                                        />
                                        <Text style={[styles.optionText, l === locale && styles.optionTextActive]}>{LOCALE_NAMES[l]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>,
                        document.body)
                    : null)
                : null}
        </View>
    );
};

const styles = StyleSheet.create({
    button: {
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flagImage: {
        width: 27,
        height: 18,
    },
    backdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 96,
    },
    menu: {
        position: 'fixed',
        zIndex: 97,
        width: MENU_W,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        paddingVertical: 2,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 8,
    },
    option: {
        height: OPTION_H,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    optionFlagImage: {
        width: 21,
        height: 14,
        marginRight: 8,
    },
    optionText: {
        fontSize: 14,
        color: '#333',
    },
    optionActive: {
        backgroundColor: 'rgba(0, 122, 255, 0.08)',
        borderRadius: 6,
    },
    optionTextActive: {
        color: '#007AFF',
        fontWeight: '600',
    },
});
