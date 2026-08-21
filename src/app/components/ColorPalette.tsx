import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Plus } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ColorPicker } from './ColorPicker';

const POPOVER_W = 300;
// Rough popover height, used as a fallback before onLayout measures the real one.
const EST_POPOVER_H = 560;

/**
 * Which popover is open: "edit" (clicked an existing swatch) or "add" (clicked
 * the trailing "+" button). `index` is the swatch being edited (edit mode).
 * `x`/`yTop`/`yBottom` are the clicked element's viewport anchor.
 */
type EditState = { mode: 'edit' | 'add'; index: number; x: number; yTop: number; yBottom: number } | null;

/**
 * The palette: a row of color swatches followed by a "+" add button. Clicking a
 * swatch opens the {@link ColorPicker} in edit mode (Set color / Remove /
 * Cancel); clicking "+" opens it in add mode (Add color / Cancel). Reports the
 * full palette via `onPaletteChange`.
 */
export function ColorPalette({ palette, onPaletteChange }: {
    palette: string[];
    onPaletteChange: (colors: string[]) => void;
}) {
    const [edit, setEdit] = useState<EditState>(null);
    // The hex currently being composed in the popover (driven by the picker).
    const [draft, setDraft] = useState('#FFFFFF');
    // Measured popover height, for clamping it inside the viewport.
    const [popoverH, setPopoverH] = useState(EST_POPOVER_H);

    // Anchor a popover below the clicked element (fall back to the pointer).
    const anchorAt = (e: any) => {
        const rect = e?.currentTarget?.getBoundingClientRect?.();
        const clientX = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
        const clientY = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
        return {
            x: rect ? rect.left : clientX - 24,
            yTop: rect ? rect.top : clientY - 12,
            yBottom: rect ? rect.bottom : clientY,
        };
    };

    // Open the picker to edit an existing swatch.
    const openEditor = (index: number, e: any) => {
        setEdit({ mode: 'edit', index, ...anchorAt(e) });
        setDraft(palette[index] ?? '#FFFFFF');
    };

    // Open the picker to add a new color (starts from white).
    const openAdd = (e: any) => {
        setEdit({ mode: 'add', index: palette.length, ...anchorAt(e) });
        setDraft('#FFFFFF');
    };

    const close = () => setEdit(null);

    // Replace the swatch being edited (edit mode only).
    const setSwatch = () => {
        if (!edit || edit.mode !== 'edit') return;
        onPaletteChange(palette.map((c, i) => (i === edit.index ? draft : c)));
        close();
    };

    // Remove the swatch being edited (edit mode only).
    const removeSwatch = () => {
        if (!edit || edit.mode !== 'edit') return;
        onPaletteChange(palette.filter((_, i) => i !== edit.index));
        close();
    };

    // Append the composed color (add mode only), then close.
    const addColor = () => {
        if (!edit || edit.mode !== 'add') return;
        if (!palette.some((c) => c.toUpperCase() === draft.toUpperCase())) {
            onPaletteChange([...palette, draft]);
        }
        close();
    };

    const isEdit = edit?.mode === 'edit';
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    // Clamp horizontally so the popover never spills past the left/right edges.
    const popoverLeft = edit ? Math.min(Math.max(edit.x, 8), Math.max(8, vw - POPOVER_W - 8)) : 0;
    // Prefer opening below the swatch; flip above if it would overflow the bottom.
    const belowTop = edit ? edit.yBottom + 8 : 0;
    const aboveTop = edit ? edit.yTop - popoverH - 8 : 0;
    const popoverTop = edit
        ? (belowTop + popoverH > vh - 8 ? Math.max(8, aboveTop) : belowTop)
        : 0;

    // The editor popover + backdrop. Rendered into document.body (a portal) so
    // it is not clipped/stacked inside the metadata bar the swatches live in —
    // the popover is position:fixed and must be relative to the real viewport.
    const overlay = edit && (
        <>
            {/* Transparent full-viewport catcher: closes on outside click. */}
            <View style={styles.backdrop} onPointerDown={close} />
            <View
                testID="color-picker-popover"
                onLayout={(e) => setPopoverH(e.nativeEvent.layout.height)}
                style={[styles.popover, { left: popoverLeft, top: popoverTop }]}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <Text style={styles.popoverTitle}>{isEdit ? 'Edit color' : 'Add color'}</Text>
                <ColorPicker
                    initialColor={isEdit ? palette[edit.index] : '#FFFFFF'}
                    onDraftChange={setDraft}
                />

                {/* Action buttons — the set depends on the mode. */}
                <View style={styles.actions} testID="color-actions">
                    {isEdit ? (
                        <>
                            <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnGap]} onPress={setSwatch}>
                                <Text style={styles.btnPrimaryText}>Set color</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.btnDanger, styles.btnGap]} onPress={removeSwatch}>
                                <Text style={styles.btnDangerText}>Remove</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close}>
                                <Text style={styles.btnGhostText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnGap]} onPress={addColor}>
                                <Text style={styles.btnPrimaryText}>Add color</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close}>
                                <Text style={styles.btnGhostText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    )}
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
                    <View style={[styles.swatch, { backgroundColor: color }, edit?.mode === 'edit' && edit?.index === i && styles.swatchActive]} />
                </View>
            ))}

            {/* "+" button: opens the picker in add mode (Add color / Cancel). */}
            <View
                testID="palette-add"
                onPointerDown={(e) => openAdd(e)}
                style={{ cursor: 'pointer', marginLeft: 6 } as any}
            >
                <View style={styles.addSwatch}>
                    <Plus size={15} color="#888" />
                </View>
            </View>

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
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    swatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: '#EEE',
    },
    swatchActive: {
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    // The trailing "+" add button: a dashed circle matching the swatch size.
    addSwatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#AAA',
        alignItems: 'center',
        justifyContent: 'center',
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
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 14,
    },
    btn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGap: {
        marginRight: 10,
    },
    btnPrimary: {
        backgroundColor: '#007AFF',
    },
    btnPrimaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    btnDanger: {
        borderWidth: 1,
        borderColor: '#FF3B30',
        backgroundColor: '#FFFFFF',
    },
    btnDangerText: {
        color: '#FF3B30',
        fontSize: 13,
        fontWeight: '600',
    },
    btnGhost: {
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFFFFF',
    },
    btnGhostText: {
        color: '#555',
        fontSize: 13,
    },
});
