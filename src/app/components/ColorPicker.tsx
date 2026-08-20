import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    Rgb,
    clamp01,
    clamp255,
    hexToRgb,
    hsvToRgb,
    rgbToCss,
    rgbToHex,
    rgbToHsv,
} from '../services/color';

/** Quick-pick palette offered in the color editor (besides the free controls). */
const PRESET_COLORS = [
    '#1A1A2E', '#16213E', '#0F3460', '#533483', '#E94560',
    '#F38BA8', '#FF9F1C', '#E9C46A', '#F4A261', '#E76F51',
    '#2A9D8F', '#457B9D', '#1D3557', '#A8DADC', '#F1FAEE',
    '#8B4513', '#415A77', '#FFD166',
];

/** Which surface is being dragged: the saturation/value plane or the hue bar. */
type DragMode = 'sv' | 'hue';

/**
 * A self-contained color picker: a draggable saturation–value plane over the
 * current hue, a draggable hue bar, plus direct R/G/B and hex entry. Seeds its
 * color from `initialColor` on mount and reports every change as a hex string
 * via `onDraftChange`.
 */
export function ColorPicker({ initialColor, onDraftChange }: {
    initialColor: string;
    onDraftChange?: (hex: string) => void;
}) {
    const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(initialColor) ?? { r: 0, g: 0, b: 0 });
    // Kept as free text so the user can type a hex; committed on blur/enter.
    const [hexDraft, setHexDraft] = useState<string>(() => rgbToHex(hexToRgb(initialColor) ?? { r: 0, g: 0, b: 0 }));
    const [dragging, setDragging] = useState<DragMode | null>(null);
    const [planeSize, setPlaneSize] = useState({ w: 236, h: 150 });

    const draggingRef = useRef<DragMode | null>(null);
    draggingRef.current = dragging;
    const svRef = useRef<any>(null);
    const hueRef = useRef<any>(null);

    const hsv = rgbToHsv(rgb);
    const hex = rgbToHex(rgb);

    // Single source of truth update: clamp, mirror into the hex field, and report.
    const setFromRgb = (next: Rgb) => {
        const c: Rgb = { r: clamp255(next.r), g: clamp255(next.g), b: clamp255(next.b) };
        const nextHex = rgbToHex(c);
        setRgb(c);
        setHexDraft(nextHex);
        onDraftChange?.(nextHex);
    };

    // Always the latest apply logic, so the (stable) window listeners never go
    // stale as rgb/hsv re-render mid-drag.
    const applyRef = useRef<(mode: DragMode, clientX: number, clientY: number) => void>(() => {});
    applyRef.current = (mode, clientX, clientY) => {
        if (mode === 'sv') {
            const rect = svRef.current?.getBoundingClientRect?.();
            if (!rect || !rect.width || !rect.height) return;
            const s = clamp01((clientX - rect.left) / rect.width);
            const v = clamp01(1 - (clientY - rect.top) / rect.height);
            setFromRgb(hsvToRgb({ h: rgbToHsv(rgb).h, s, v }));
        } else {
            const rect = hueRef.current?.getBoundingClientRect?.();
            if (!rect || !rect.width) return;
            const h = clamp01((clientX - rect.left) / rect.width) * 360;
            const { s, v } = rgbToHsv(rgb);
            setFromRgb(hsvToRgb({ h, s, v }));
        }
    };

    const startDrag = (mode: DragMode, e: any) => {
        e?.preventDefault?.();
        e?.nativeEvent?.preventDefault?.();
        applyRef.current(mode, e?.clientX ?? 0, e?.clientY ?? 0);
        setDragging(mode);
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (ev: PointerEvent) => {
            if (draggingRef.current) applyRef.current(draggingRef.current, ev.clientX, ev.clientY);
        };
        const onUp = () => setDragging(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [dragging]);

    const updateChannel = (channel: keyof Rgb, raw: string) => {
        const clean = raw.replace(/[^0-9]/g, '');
        if (clean === '') return;
        setFromRgb({ ...rgb, [channel]: clamp255(parseInt(clean, 10) || 0) });
    };

    // Commit the free-typed hex only when it parses; otherwise revert it.
    const commitHex = () => {
        const parsed = hexToRgb(hexDraft);
        if (parsed) setFromRgb(parsed);
        else setHexDraft(hex);
    };

    const selectedPreset = (c: string) => c.toUpperCase() === hex;

    return (
        <View>
            {/* Saturation/value plane for the current hue: base = pure hue, with
                a white (left) and black (bottom) gradient laid over it. */}
            <View
                ref={svRef}
                onLayout={(e) => setPlaneSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                onPointerDown={(e) => startDrag('sv', e)}
                {...({ style: {
                    position: 'relative',
                    width: 236,
                    height: 150,
                    borderRadius: 8,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: '#DDD',
                    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                    backgroundImage:
                        'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))',
                    cursor: 'crosshair',
                } as any })}
            >
                <View
                    pointerEvents="none"
                    {...({ style: {
                        position: 'absolute',
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: rgbToCss(rgb),
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                        boxShadow: '0 0 3px rgba(0,0,0,0.6)',
                        left: hsv.s * planeSize.w - 7,
                        top: (1 - hsv.v) * planeSize.h - 7,
                    } as any })}
                />
            </View>

            {/* Hue bar: a rainbow the user drags along to set the hue. */}
            <View
                ref={hueRef}
                onPointerDown={(e) => startDrag('hue', e)}
                {...({ style: {
                    position: 'relative',
                    width: 236,
                    height: 16,
                    borderRadius: 8,
                    marginTop: 10,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: '#DDD',
                    backgroundImage:
                        'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                    cursor: 'ew-resize',
                } as any })}
            >
                <View
                    pointerEvents="none"
                    {...({ style: {
                        position: 'absolute',
                        width: 8,
                        height: 22,
                        borderRadius: 4,
                        top: -4,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 2,
                        borderColor: '#333',
                        left: (hsv.h / 360) * planeSize.w - 4,
                    } as any })}
                />
            </View>

            {/* Numeric RGB entry. */}
            <View style={styles.channelRow}>
                {(['r', 'g', 'b'] as const).map((ch) => (
                    <View key={ch} style={styles.channelGroup}>
                        <Text style={[styles.channelLabel, { color: CHANNEL_COLORS[ch] }]}>{ch.toUpperCase()}</Text>
                        <TextInput
                            style={styles.channelInput}
                            value={String(rgb[ch])}
                            onChangeText={(v) => updateChannel(ch, v)}
                            keyboardType="numeric"
                            maxLength={3}
                            selectTextOnFocus
                        />
                    </View>
                ))}
            </View>

            {/* Current color preview + hex entry. */}
            <View style={styles.hexRow}>
                <View style={[styles.preview, { backgroundColor: hex }]} />
                <TextInput
                    style={styles.hexInput}
                    value={hexDraft}
                    onChangeText={setHexDraft}
                    onEndEditing={commitHex}
                    onSubmitEditing={commitHex}
                    autoCapitalize="characters"
                    placeholder="#RRGGBB"
                />
            </View>

            {/* Quick-pick palette. */}
            <View style={styles.grid}>
                {PRESET_COLORS.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setFromRgb(hexToRgb(c) as Rgb)} activeOpacity={0.7}>
                        <View style={[styles.gridSwatch, { backgroundColor: c }, selectedPreset(c) && styles.gridSwatchSelected]} />
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const CHANNEL_COLORS = { r: '#E5484D', g: '#30A46C', b: '#3B82F6' };

const styles = StyleSheet.create({
    channelRow: {
        flexDirection: 'row',
        marginTop: 12,
    },
    channelGroup: {
        flex: 1,
        marginRight: 8,
    },
    channelLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 3,
    },
    channelInput: {
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 5,
        fontSize: 14,
        color: '#333',
        backgroundColor: '#FAFAFA',
        textAlign: 'center',
    },
    hexRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    preview: {
        width: 30,
        height: 30,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#DDD',
        marginRight: 10,
    },
    hexInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        fontSize: 14,
        color: '#333',
        backgroundColor: '#FAFAFA',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
    },
    gridSwatch: {
        width: 24,
        height: 24,
        borderRadius: 6,
        margin: 3,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    gridSwatchSelected: {
        borderWidth: 2,
        borderColor: '#007AFF',
    },
});
