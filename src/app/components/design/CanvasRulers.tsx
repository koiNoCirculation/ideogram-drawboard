import { Text, View } from 'react-native';
import { gridCellUnits, rulerSteps } from '../../design/constants';
import { styles } from '../../design/designStyles';

/**
 * Rulers along the canvas's top and left edges, covering the 0-1000 bbox
 * space on both axes. Rendered in the canvas frame (siblings of the canvas),
 * extending OUTWARD from the canvas — the top strip sits above the canvas's
 * top edge, the left strip left of its left edge — so the semi-transparent
 * strips never cover canvas content. They still scale with the canvas, and
 * every tick/label is positioned with the same 0-1000 → px mapping
 * as the grid, so they stay aligned with its lines. Number density follows
 * the zoom level per axis (rulerSteps: the short axis is sparser by the
 * aspect ratio); unnumbered ticks sit halfway between numbered ones, drawn
 * as a repeating gradient (like the grid) so a dense level doesn't create
 * per-tick views.
 */
export const CanvasRulers = ({ width, height, zoom }: {
    width: number;
    height: number;
    zoom: number;
}) => {
    const { top: topStep, left: leftStep } = rulerSteps(zoom, width, height);
    const cell = gridCellUnits(zoom);
    const positionsFor = (step: number) => {
        const positions: number[] = [];
        for (let u = 0; u <= 1000; u += step) positions.push(u);
        return positions;
    };
    const topPositions = positionsFor(topStep);
    const leftPositions = positionsFor(leftStep);
    // Minor tick period (px): half of the axis's numbered step. Only drawn
    // when the period is wide enough to read as separate ticks, and never
    // finer than the grid cell itself.
    const minorX = Math.max(topStep / 2, cell) / 1000 * width;
    const minorY = Math.max(leftStep / 2, cell) / 1000 * height;
    const tickGradient = (dir: 'to right' | 'to bottom', period: number) =>
        `repeating-linear-gradient(${dir}, rgba(0, 0, 0, 0.5) 0, rgba(0, 0, 0, 0.5) 1px, transparent 1px, transparent ${period}px)`;
    return (
        <>
            {/* Left ruler (rendered first): left of the canvas's left edge,
                spanning the full canvas height (height passed explicitly —
                the frame, not an inset, bounds it). */}
            <View pointerEvents="none" style={[styles.rulerLeft, { height }]}>
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
                {leftPositions.map((u) => (
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

            {/* Top ruler: above the canvas's top edge, spanning the full
                canvas width (width passed explicitly). */}
            <View pointerEvents="none" style={[styles.rulerTop, { width }]}>
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
                {topPositions.map((u) => (
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
