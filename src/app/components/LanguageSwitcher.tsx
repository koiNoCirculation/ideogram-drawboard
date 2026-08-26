import { createPortal } from 'react-dom';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LOCALES, LOCALE_FLAGS } from '../../i18n';
import { useI18n } from '../../i18n';

const MENU_W = 110;
const OPTION_H = 34;

/**
 * The UI-language switcher, inserted to the LEFT of the settings gear on
 * every page. Shows the current locale's flag emoji; clicking opens a small
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
                <Text style={styles.flag}>{LOCALE_FLAGS[locale]}</Text>
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
                                        <Text style={styles.optionFlag}>{LOCALE_FLAGS[l]}</Text>
                                        <Text style={[styles.optionText, l === locale && styles.optionTextActive]}>{l}</Text>
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
    flag: {
        fontSize: 20,
        lineHeight: 24,
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
    optionFlag: {
        fontSize: 16,
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
