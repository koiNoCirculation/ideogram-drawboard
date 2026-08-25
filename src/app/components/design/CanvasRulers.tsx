import { Text, View } from 'react-native';
import { gridCellUnits, rulerLabelStep } from '../../design/constants';
import { styles } from '../../design/designStyles';

/**
 * Rulers overlaid on the canvas's top and left edges, covering the 0-1000
 * bbox space on both axes. Rendered inside the canvas, so they scale with
 * it, and every tick/label is positioned with the same 0-1000 → px mapping
 * as the grid, so they stay aligned with its lines. Number density follows
 * the zoom level (rulerLabelStep); unnumbered ticks sit halfway between
 * numbered ones, drawn as a repeating gradient (like the grid) so a dense
 * level doesn't create per-tick views.
 */
export const CanvasRulers = ({ width, height, zoom }: {
    width: number;
    height: number;
    zoom: number;
}) => {
    const step = rulerLabelStep(zoom);
    const cell = gridCellUnits(zoom);
    const positions: number[] = [];
    for (let u = 0; u <= 1000; u += step) positions.push(u);
    // Minor tick period (px): half of the numbered step, on both axes. Only
    // drawn when the period is wide enough to read as separate ticks, and
    // never finer than the grid cell itself.
    const minorX = Math.max(step / 2, cell) / 1000 * width;
    const minorY = Math.max(step / 2, cell) / 1000 * height;
    const tickGradient = (dir: 'to right' | 'to bottom', period: number) =>
        `repeating-linear-gradient(${dir}, rgba(0, 0, 0, 0.5) 0, rgba(0, 0, 0, 0.5) 1px, transparent 1px, transparent ${period}px)`;
    return (
        <>
            {/* Left ruler (rendered first, so the top ruler wins the corner) */}
            <View pointerEvents="none" style={styles.rulerLeft}>
                {minorY >= 3 && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: 4,
                            backgroundImage: tickGradient('to bottom', minorY),
                        } as any}
                    />
                )}
                {positions.map((u) => (
                    <View key={`lr-${u}`} pointerEvents="none">
                        <View style={[styles.rulerMajorV, { top: (u / 1000) * height }]} />
                        <View
                            style={[
                                styles.rulerLabelV,
                                { top: Math.min(Math.max((u / 1000) * height - 6, 0), Math.max(height - 12, 0)) },
                            ]}
                        >
                            <Text style={styles.rulerLabelText}>{u}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* Top ruler */}
            <View pointerEvents="none" style={styles.rulerTop}>
                {minorX >= 3 && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 4,
                            backgroundImage: tickGradient('to right', minorX),
                        } as any}
                    />
                )}
                {positions.map((u) => (
                    <View key={`tr-${u}`} pointerEvents="none">
                        <View style={[styles.rulerMajorH, { left: (u / 1000) * width }]} />
                        <View
                            style={[
                                styles.rulerLabelH,
                                { left: Math.min(Math.max((u / 1000) * width - 12, 0), Math.max(width - 24, 0)) },
                            ]}
                        >
                            <Text style={styles.rulerLabelText}>{u}</Text>
                        </View>
                    </View>
                ))}
            </View>
        </>
    );
};
