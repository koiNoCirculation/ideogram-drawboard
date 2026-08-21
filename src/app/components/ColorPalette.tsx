import { createPortal } from 'react-dom';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ColorPicker } from './ColorPicker';

const POPOVER_W = 264;

/**
 * The palette: a row of color swatches. Clicking a swatch opens an editor
 * popover (the {@link ColorPicker}) to change it, add the picked color to the
 * palette, or remove the swatch. Reports the full palette via
 * `onPaletteChange`.
 */
export function ColorPalette({ palette, onPaletteChange }: {
    palette: string[];
    onPaletteChange: (colors: string[]) => void;
}) {
    // Index of the swatch being edited + its viewport anchor (bottom-left).
    const [edit, setEdit] = useState<{ index: number; x: number; y: number } | null>(null);
    // The hex currently being composed in the popover (driven by the picker).
    const [draft, setDraft] = useState('#000000');

    const openEditor = (index: number, e: any) => {
        // Anchor the popover just below the clicked swatch; fall back to the
        // pointer position if the element rect isn't available.
        const rect = e?.currentTarget?.getBoundingClientRect?.();
        const clientX = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
        const clientY = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
        setEdit({
            index,
            x: rect ? rect.left : clientX - 24,
            y: rect ? rect.bottom + 8 : clientY + 16,
        });
        setDraft(palette[index] ?? '#000000');
    };
    const close = () => setEdit(null);

    // Replace the swatch being edited with the composed color and close.
    const setSwatch = () => {
        if (edit) onPaletteChange(palette.map((c, i) => (i === edit.index ? draft : c)));
        close();
    };

    // Append the composed color (no duplicates). Keeps the popover open.
    const addColor = () => {
        if (palette.some((c) => c.toUpperCase() === draft.toUpperCase())) return;
        onPaletteChange([...palette, draft]);
    };

    // Remove the swatch being edited and close.
    const removeSwatch = () => {
        if (edit) onPaletteChange(palette.filter((_, i) => i !== edit.index));
        close();
    };

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const popoverLeft = edit ? Math.min(Math.max(edit.x, 8), vw - POPOVER_W - 8) : 0;

    // The editor popover + backdrop. Built as a node so it can be portaled
    // out of the horizontal metadata ScrollView the swatches live in — the
    // popover is position:fixed and must be relative to the real viewport, not
    // clipped/stacked inside the scroll container (it was top-level before the
    // palette was extracted into this component).
    const overlay = edit && (
        <>
            {/* Transparent full-viewport catcher: closes on outside click. */}
            <View style={styles.backdrop} onPointerDown={close} />
            <View
                testID="color-picker-popover"
                style={[styles.popover, { left: popoverLeft, top: edit.y }]}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <Text style={styles.popoverTitle}>Edit color</Text>
                <ColorPicker initialColor={palette[edit.index]} onDraftChange={setDraft} />

                {/* Palette management */}
                <View style={styles.manageRow}>
                    <TouchableOpacity style={styles.manageAdd} onPress={addColor}>
                        <Text style={styles.manageAddText}>+ Add color</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.manageRemove} onPress={removeSwatch}>
                        <Text style={styles.manageRemoveText}>Remove</Text>
                    </TouchableOpacity>
                </View>

                {/* Apply / dismiss */}
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={close}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveButton} onPress={setSwatch}>
                        <Text style={styles.saveText}>Set color</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );

    return (
        <View style={styles.row}>
            {palette.map((color, i) => (
                // A plain View (not TouchableOpacity): in RN-web the touchable
                // swallows pointer events for its own press detection, so its
                // onPointerDown never fired. A View's onPointerDown reliably
                // reaches the DOM node (same pattern as the canvas create-drag).
                <View
                    key={`pal-${i}`}
                    testID={`palette-swatch-${i}`}
                    onPointerDown={(e) => openEditor(i, e)}
                    style={{ cursor: 'pointer' } as any}
                >
                    <View style={[styles.swatch, { backgroundColor: color }, edit?.index === i && styles.swatchActive]} />
                </View>
            ))}

            {/* Portal the overlay to document.body so it escapes the ScrollView. */}
            {overlay
                ? (typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay)
                : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    swatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 6,
        borderWidth: 1,
        borderColor: '#EEE',
    },
    swatchActive: {
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    backdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 97,
    },
    popover: {
        position: 'fixed',
        zIndex: 98,
        width: POPOVER_W,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        padding: 14,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 10,
    },
    popoverTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 10,
    },
    manageRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    manageAdd: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#007AFF',
        backgroundColor: '#FFFFFF',
    },
    manageAddText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#007AFF',
    },
    manageRemove: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FF3B30',
        backgroundColor: '#FFFFFF',
    },
    manageRemoveText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FF3B30',
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 14,
    },
    cancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFFFFF',
    },
    cancelText: {
        fontSize: 14,
        color: '#555',
    },
    saveButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: '#007AFF',
    },
    saveText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
