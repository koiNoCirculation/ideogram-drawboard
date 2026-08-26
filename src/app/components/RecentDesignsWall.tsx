import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Design } from '../services/designStore';

/**
 * The masonry (tile-collage) image wall at the bottom of the home page.
 * Inactive (Home section) it renders nothing — the wall is intentionally
 * empty there for now. Active (Recent Designs section) it renders the section
 * title plus one tile per saved design that has generated images (the most
 * recent one). Hovering a tile overlays the design's ORIGINAL prompt
 * (rawPrompt, falling back to high_level_description for old designs — data,
 * never translated); pressing opens the design.
 */
interface RecentDesignsWallProps {
    active: boolean;
    /** Most-recent-first (loadDesigns order). */
    designs: Design[];
    /** Resolved image uris aligned by index with `designs` (null = pending/missing). */
    uris: (string | null)[];
    titleText: string;
    emptyText: string;
    onOpen: (design: Design) => void;
}

const COLUMN_GAP = 12;
const MIN_COLUMN_PX = 220;
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 6;

export function RecentDesignsWall({
    active, designs, uris, titleText, emptyText, onOpen,
}: RecentDesignsWallProps) {
    const [containerWidth, setContainerWidth] = useState(0);

    // Only designs that have at least one generated image get a tile, paired
    // with their resolved latest-image uri (alignment by index).
    const tiles = useMemo(
        () => designs
            .map((design, i) => ({ design, uri: uris[i] ?? null }))
            .filter((tile) => tile.design.images.length > 0),
        [designs, uris],
    );

    if (!active) {
        return <View />;
    }

    const columnCount = containerWidth > 0
        ? Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor(containerWidth / MIN_COLUMN_PX)))
        : 0;
    const columnWidth = columnCount > 0
        ? (containerWidth - COLUMN_GAP * (columnCount - 1)) / columnCount
        : 0;

    // Greedy masonry: each tile lands in the currently shortest column. Tile
    // heights come from the saved canvas size — generated images match it.
    let columns: { design: Design; uri: string | null; height: number }[][] = [];
    if (columnWidth > 0) {
        columns = Array.from({ length: columnCount }, () => []);
        const heights = new Array(columnCount).fill(0);
        for (const tile of tiles) {
            const { width: dw, height: dh } = tile.design.size ?? {};
            const aspect = dw && dh && dw > 0 && dh > 0 ? dh / dw : 1;
            const height = columnWidth * aspect;
            let target = 0;
            for (let c = 1; c < columnCount; c++) {
                if (heights[c] < heights[target]) target = c;
            }
            columns[target].push({ ...tile, height });
            heights[target] += height + COLUMN_GAP;
        }
    }

    return (
        <View style={styles.wallArea}>
            <Text style={styles.title}>{titleText}</Text>
            {tiles.length === 0 ? (
                <Text style={styles.empty}>{emptyText}</Text>
            ) : (
                <View
                    onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
                    style={styles.masonry}
                    testID="wall-masonry"
                >
                    {columnWidth > 0 && (
                        <View style={styles.columnsRow}>
                            {columns.map((column, c) => (
                                <View key={c} style={{ width: columnWidth }}>
                                    {column.map((tile) => (
                                        <WallTile
                                            key={tile.design.id}
                                            design={tile.design}
                                            uri={tile.uri}
                                            width={columnWidth}
                                            height={tile.height}
                                            onOpen={onOpen}
                                        />
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

function WallTile({ design, uri, width, height, onOpen }: {
    design: Design;
    uri: string | null;
    width: number;
    height: number;
    onOpen: (design: Design) => void;
}) {
    const [hovered, setHovered] = useState(false);
    // Original prompt first; old designs have no rawPrompt -> HLD fallback.
    const prompt = design.rawPrompt ?? design.prompt.high_level_description;

    // Pressable (not TouchableOpacity) because only Pressable carries typed
    // onHoverIn/onHoverOut props in RN 0.86.
    return (
        <Pressable
            testID={`wall-tile-${design.id}`}
            style={[styles.tile, { width, height }]}
            onPress={() => onOpen(design)}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
        >
            {uri ? (
                <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
            ) : (
                <View style={styles.tilePlaceholder} />
            )}
            {hovered && (
                <View style={styles.tileOverlay} testID="wall-tile-overlay">
                    <Text style={styles.tileOverlayText} numberOfLines={6}>{prompt}</Text>
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wallArea: {
        width: '100%',
        paddingHorizontal: 24,
        paddingBottom: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111111',
        marginBottom: 16,
    },
    empty: {
        fontSize: 14,
        color: '#999999',
        fontStyle: 'italic',
        paddingVertical: 16,
    },
    masonry: {
        width: '100%',
    },
    columnsRow: {
        flexDirection: 'row',
        columnGap: COLUMN_GAP,
        alignItems: 'flex-start',
    },
    tile: {
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#EEEEEE',
        marginBottom: COLUMN_GAP,
    },
    tileImage: {
        width: '100%',
        height: '100%',
    },
    tilePlaceholder: {
        width: '100%',
        height: '100%',
    },
    tileOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tileOverlayText: {
        color: '#FFFFFF',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
});
