import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Transient red floating toast for network-request failures — the single
 * floating error surface of the app (home refine, design generate/rewrite,
 * image save, download, example-collection load all share it).
 *
 * The message is caller-prepared (already translated via the requestError
 * classifier or a fixed i18n key); the hook only owns the display lifetime:
 * each `show` displays the message and (re)starts a 5-second auto-dismiss,
 * so a new failure while an old toast is up re-arms the timer.
 */
const AUTO_DISMISS_MS = 5000;

export function useErrorFloat(): { message: string | null; show: (message: string) => void } {
    const [message, setMessage] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const show = useCallback((next: string) => {
        clearTimer();
        setMessage(next);
        timerRef.current = setTimeout(() => setMessage(null), AUTO_DISMISS_MS);
    }, [clearTimer]);

    useEffect(() => clearTimer, [clearTimer]);

    return { message, show };
}

/**
 * The floating toast itself. Renders nothing while `message` is null.
 * Portaled to `document.body` (same pattern as the ColorPalette popover):
 * fixed positioning must live in the real viewport coordinate system, and
 * the home page has no design-page container to host it in.
 * `pointerEvents` is off — the toast is display-only and auto-dismisses.
 */
export function ErrorFloat({ message, testID = 'error-float' }: { message: string | null; testID?: string }) {
    if (!message) return null;
    const node = (
        <View style={styles.toast} pointerEvents="none">
            <View style={styles.box} testID={testID}>
                <Text style={styles.text}>{message}</Text>
            </View>
        </View>
    );
    return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

const styles = StyleSheet.create({
    toast: {
        position: 'fixed',
        top: 76,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 100,
    },
    box: {
        backgroundColor: '#E53935',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    text: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
});
