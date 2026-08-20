import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, Type } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    PanResponder,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const IDEOGRAM_API_BASE = 'http://127.0.0.1:8000';
const IDEOGRAM_API_KEY = ''; // leave empty if the local service handles auth

interface RefinedPrompt {
    aspect_ratio: string;
    high_level_description: string;
    style_description?: {
        aesthetics?: string;
        lighting?: string;
        medium?: string;
        art_style?: string;
        photo?: string;
        color_palette?: string[];
    };
    compositional_deconstruction: {
        background: string;
        elements: Array<{
            type: 'obj' | 'text';
            /** Ideogram normalized bbox: [y_min, x_min, y_max, x_max] in 0-1000, top-left origin. */
            bbox?: [number, number, number, number];
            desc?: string;
            text?: string;
        }>;
    };
}

type CanvasElement = RefinedPrompt['compositional_deconstruction']['elements'][number];

/**
 * A component to render a single parsed element (obj or text) on the canvas,
 * positioned by its normalized (0-1000) bounding box. Draggable: reports pixel
 * deltas to the parent, which updates the bbox in the JSON prompt.
 */
const ElementBox = ({
    element,
    left,
    top,
    width,
    height,
    hovered,
    onHoverIn,
    onHoverOut,
    onDragStart,
    onDragMove,
    onDragEnd,
}: {
    element: CanvasElement;
    left: number;
    top: number;
    width: number;
    height: number;
    hovered: boolean;
    onHoverIn: () => void;
    onHoverOut: () => void;
    onDragStart: () => void;
    onDragMove: (dxPx: number, dyPx: number) => void;
    onDragEnd: () => void;
}) => {
    const isText = element.type === 'text';

    // The PanResponder is created once, so route through refs to always call
    // the latest parent handlers (they capture displaySize at render time).
    const dragStartRef = useRef(onDragStart);
    const dragMoveRef = useRef(onDragMove);
    const dragEndRef = useRef(onDragEnd);
    dragStartRef.current = onDragStart;
    dragMoveRef.current = onDragMove;
    dragEndRef.current = onDragEnd;

    const panResponder = useRef(
        PanResponder.create({
            // Small slop so taps/hovers are unaffected.
            onMoveShouldSetPanResponder: (_e, g) =>
                Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
            onPanResponderGrant: () => dragStartRef.current(),
            onPanResponderMove: (_e, g) => dragMoveRef.current(g.dx, g.dy),
            onPanResponderRelease: () => dragEndRef.current(),
            onPanResponderTerminate: () => dragEndRef.current(),
        })
    ).current;

    return (
        <View
            style={[
                styles.elementBox,
                { left, top, width, height },
                hovered && styles.elementBoxHovered,
            ]}
            onPointerEnter={onHoverIn}
            onPointerLeave={onHoverOut}
            {...panResponder.panHandlers}
        >
            {/* Top-left corner icon: "T" for text, image icon for obj */}
            <View
                style={[
                    styles.elementIcon,
                    isText ? styles.elementIconText : styles.elementIconObj,
                ]}
            >
                {isText ? (
                    <Text style={styles.elementIconChar}>T</Text>
                ) : (
                    <ImageIcon size={14} color="#FFFFFF" />
                )}
            </View>

            {isText ? (
                <Text style={styles.elementTextContent}>{element.text}</Text>
            ) : (
                <Text style={styles.elementDescText}>{element.desc}</Text>
            )}
        </View>
    );
};

/**
 * A small component to display a keyword as a stylized tag.
 */
const Tag = ({ text }: { text: string }) => {
    if (!text || text.trim() === "") return null;
    return (
        <View style={styles.tag}>
            <Text style={styles.tagText}>{text.trim()}</Text>
        </View>
    );
};

/**
 * A component to display a color as a circular swatch.
 */
const ColorSwatch = ({ color }: { color: string }) => (
    <View style={[styles.swatch, { backgroundColor: color }]} />
);

export default function DesignScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const [title, setTitle] = useState('Untitled Design');
    const [aesthetics, setAesthetics] = useState("");
    const [lighting, setLighting] = useState("");
    const [medium, setMedium] = useState("");
    const [photo, setPhoto] = useState("")
    const [artStyle, setArtStyle] = useState("");
    const [palette, setPalette] = useState<string[]>([]);
    const [refinedData, setRefinedData] = useState<RefinedPrompt | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [canvasAreaSize, setCanvasAreaSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    // Base bbox captured when a drag starts; live moves are computed from it so
    // the element's moving position never feeds back into the gesture delta.
    const dragBaseRef = useRef<{ index: number; baseBbox: [number, number, number, number] } | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const parsed = JSON.parse(params.promptData as string);
            console.log(parsed)
            setRefinedData(parsed);

            // Use the high level description as the initial title
            if (parsed.high_level_description) {
                setTitle(parsed.high_level_description);
            }

            if (parsed.style_description) {
                setAesthetics(parsed.style_description.aesthetics || "");
                setLighting(parsed.style_description.lighting || "");
                setMedium(parsed.style_description.medium || "");
                setArtStyle(parsed.style_description.art_style || "");
                setPhoto(parsed.style_description.photo || "");
                setPalette(parsed.style_description.color_palette || []);
            }

            const size = (params.size as string).split(",");
            setCanvasSize({ width: Number.parseInt(size[0]), height: Number.parseInt(size[1]) });
        } catch (e) {
            console.error('Failed to parse promptData', e);
        }
    }, [params.promptData, params.size]);


    // Scale the requested canvas size to fit the available area, preserving aspect ratio.
    const scale = canvasSize.width > 0 && canvasSize.height > 0 && canvasAreaSize.width > 0
        ? Math.min(canvasAreaSize.width / canvasSize.width, canvasAreaSize.height / canvasSize.height)
        : 0;
    const displaySize = {
        width: canvasSize.width * scale,
        height: canvasSize.height * scale,
    };

    // Convert a normalized (0-1000) bbox into pixel geometry on the canvas.
    // Ideogram format: [y_min, x_min, y_max, x_max], (0, 0) at top-left.
    const getElementGeometry = (element: CanvasElement) => {
        const [yMin, xMin, yMax, xMax] = element.bbox!;
        return {
            left: (xMin / 1000) * displaySize.width,
            top: (yMin / 1000) * displaySize.height,
            width: ((xMax - xMin) / 1000) * displaySize.width,
            height: ((yMax - yMin) / 1000) * displaySize.height,
        };
    };

    // Clamp a normalized (0-1000) bbox so it stays fully inside the canvas.
    const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
        const [yMin, xMin, yMax, xMax] = bbox;
        const x = Math.min(Math.max(xMin, 0), Math.max(1000 - (xMax - xMin), 0));
        const y = Math.min(Math.max(yMin, 0), Math.max(1000 - (yMax - yMin), 0));
        return [y, x, y + (yMax - yMin), x + (xMax - xMin)];
    };

    const handleDragStart = (index: number) => {
        const element = refinedData?.compositional_deconstruction.elements[index];
        if (!element?.bbox) return;
        dragBaseRef.current = { index, baseBbox: element.bbox };
    };

    // Live-update the dragged element's bbox in the JSON prompt (normalized 0-1000).
    const handleDragMove = (dxPx: number, dyPx: number) => {
        const drag = dragBaseRef.current;
        if (!drag || displaySize.width <= 0 || displaySize.height <= 0) return;
        const dx = (dxPx / displaySize.width) * 1000;
        const dy = (dyPx / displaySize.height) * 1000;
        const [yMin, xMin, yMax, xMax] = drag.baseBbox;
        const clamped = clampBbox([yMin + dy, xMin + dx, yMax + dy, xMax + dx]);
        const { index } = drag;
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) =>
                i === index ? { ...el, bbox: clamped } : el
            );
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    const handleDragEnd = () => {
        dragBaseRef.current = null;
    };

    // Call the local Ideogram-compatible service to generate the image.
    const handleGenerate = async () => {
        if (!refinedData || isGenerating) return;
        setIsGenerating(true);
        setGenerateError(null);
        try {
            const formData = new FormData();
            // The service expects json_prompt as a plain string field, not a file upload.
            formData.append('json_prompt', JSON.stringify(refinedData));
            formData.append('response_type', 'url');
            formData.append('resolution', `${canvasSize.width}x${canvasSize.height}`);

            const headers: Record<string, string> = {};
            if (IDEOGRAM_API_KEY) headers['Api-Key'] = IDEOGRAM_API_KEY;

            const response = await fetch(`${IDEOGRAM_API_BASE}/v1/ideogram-v4/generate`, {
                method: 'POST',
                headers,
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const result = await response.json();
            const url: string | undefined = result?.data?.[0]?.url;
            if (!url) {
                throw new Error('No image URL in response');
            }
            setGeneratedImageUrl(url);
        } catch (error: any) {
            setGenerateError(error?.message ?? 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.mainContent}>
                {/* Left Sidebar: Toolbar */}
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Text')}>
                        <Type color="#007AFF" size={28} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Object')}>
                        <ImageIcon color="#007AFF" size={28} />
                    </TouchableOpacity>
                </View>

                {/* Right Content: Title, Metadata & Canvas */}
                <View style={styles.canvasArea}>
                    {/* Top Header: Title Input */}
                    <View style={styles.header}>
                        <TextInput
                            style={styles.titleInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Untitled Design"
                        />
                        <View style={styles.spacer} />
                    </View>

                    {/* Metadata Bar: Styled Tags and Color Swatches */}
                    <View style={styles.metadataContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Aesthetics</Text>
                                <View style={styles.tagRow}>
                                    {aesthetics.split(',').map((val, i) => <Tag key={`aes-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Lighting</Text>
                                <View style={styles.tagRow}>
                                    {lighting.split(',').map((val, i) => <Tag key={`light-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={artStyle === "" ? { ...styles.metadataGroup, display: "none" } : styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Art Style</Text>
                                <View style={styles.tagRow}>
                                    {artStyle.split(' ').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={photo === "" ? { ...styles.metadataGroup, display: "none" } : styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Photo</Text>
                                <View style={styles.tagRow}>
                                    {photo.split(',').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Medium</Text>
                                <View style={styles.tagRow}>
                                    <Tag text={medium} />
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Palette</Text>
                                <View style={styles.paletteRow}>
                                    {palette.map((color, i) => <ColorSwatch key={`pal-${i}`} color={color} />)}
                                </View>
                            </View>
                        </ScrollView>
                    </View>

                    {/* Background Info */}
                    {refinedData?.compositional_deconstruction?.background && (
                        <View style={styles.backgroundContainer}>
                            <Text style={styles.groupLabel}>Background</Text>
                            <Text style={styles.backgroundText}>{refinedData.compositional_deconstruction.background}</Text>
                        </View>
                    )}

                    {/* Canvas Placeholder */}
                    <View style={styles.canvasContainer}>
                        <View
                            style={styles.canvasSizer}
                            onLayout={(e) => {
                                setCanvasAreaSize({
                                    width: e.nativeEvent.layout.width,
                                    height: e.nativeEvent.layout.height,
                                })
                            }
                            }
                        >
                            <View style={[styles.canvas, { width: displaySize.width, height: displaySize.height }]}>
                                {/* Generated image: rendered first so the element boxes overlay it */}
                                {generatedImageUrl && (
                                    <Image
                                        source={{ uri: generatedImageUrl }}
                                        style={[
                                            styles.generatedImage,
                                            { width: displaySize.width, height: displaySize.height },
                                        ]}
                                        resizeMode="cover"
                                    />
                                )}

                                {refinedData && refinedData.compositional_deconstruction.elements.length > 0 ? (
                                    <>
                                        {refinedData.compositional_deconstruction.elements.map((element, index) => {
                                            if (!element.bbox) return null;
                                            const geo = getElementGeometry(element);
                                            return (
                                                <ElementBox
                                                    key={`el-${index}`}
                                                    element={element}
                                                    {...geo}
                                                    hovered={hoveredIndex === index}
                                                    onHoverIn={() => setHoveredIndex(index)}
                                                    onHoverOut={() => setHoveredIndex(null)}
                                                    onDragStart={() => handleDragStart(index)}
                                                    onDragMove={handleDragMove}
                                                    onDragEnd={handleDragEnd}
                                                />
                                            );
                                        })}

                                        {/* Floating tooltip for the hovered text element */}
                                        {(() => {
                                            if (hoveredIndex === null) return null;
                                            const element = refinedData.compositional_deconstruction.elements[hoveredIndex];
                                            if (!element || element.type !== 'text' || !element.bbox) return null;
                                            const geo = getElementGeometry(element);
                                            const width = 260;
                                            const left = Math.min(
                                                Math.max(geo.left + geo.width / 2 - width / 2, 8),
                                                Math.max(displaySize.width - width - 8, 8),
                                            );
                                            // Prefer showing above the box; flip below if there's no room.
                                            const showAbove = geo.top > 90;
                                            const position = showAbove
                                                ? { bottom: displaySize.height - geo.top + 10 }
                                                : { top: geo.top + geo.height + 10 };
                                            return (
                                                <View pointerEvents="none" style={[styles.tooltip, { left, width }, position]}>
                                                    <Text style={styles.tooltipText}>{element.desc}</Text>
                                                    <View
                                                        style={[
                                                            styles.tooltipArrow,
                                                            { left: geo.left + geo.width / 2 - left - 5 },
                                                            showAbove ? { bottom: -5 } : { top: -5 },
                                                        ]}
                                                    />
                                                </View>
                                            );
                                        })()}
                                    </>
                                ) : (
                                    <Text style={styles.canvasPlaceholderText}>Canvas Area</Text>
                                )}
                            </View>
                        </View>

                        {/* Generate button */}
                        <View style={styles.generateRow}>
                            <TouchableOpacity
                                style={[styles.generateButton, !refinedData && styles.generateButtonDisabled]}
                                onPress={handleGenerate}
                                disabled={!refinedData || isGenerating}
                            >
                                {isGenerating ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.generateButtonText}>Generate</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                        {generateError && <Text style={styles.generateError}>{generateError}</Text>}
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    mainContent: {
        flex: 1,
        flexDirection: 'row',
    },
    toolbar: {
        width: 70,
        backgroundColor: '#F8F9FA',
        borderRightWidth: 1,
        borderRightColor: '#EEEEEE',
        alignItems: 'center',
        paddingTop: 20,
    },
    toolButton: {
        marginBottom: 30,
        padding: 10,
    },
    canvasArea: {
        flex: 1,
        flexDirection: 'column',
    },
    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    titleInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
    },
    spacer: {
        width: 40,
    },
    metadataContainer: {
        height: 85,
        backgroundColor: '#FDFDFD',
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    scrollContent: {
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    metadataGroup: {
        marginRight: 24,
        justifyContent: 'center',
    },
    groupLabel: {
        fontSize: 10,
        color: '#AAA',
        textTransform: 'uppercase',
        marginBottom: 4,
        fontWeight: 'bold',
    },
    tag: {
        backgroundColor: '#F0F0F0',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginHorizontal: 2,
    },
    tagText: {
        fontSize: 12,
        color: '#444',
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    paletteRow: {
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
    backgroundContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FDFDFD',
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    backgroundText: {
        fontSize: 14,
        color: '#444',
        lineHeight: 20,
    },
    canvasContainer: {
        flex: 1,
        padding: 20,
        backgroundColor: '#F0F0F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    canvasSizer: {
        flex: 1,
        // Force full width: the parent centers children, which would otherwise
        // shrink the sizer to its content width (0 until measured — a deadlock).
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
    },
    canvas: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    generatedImage: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    generateRow: {
        marginTop: 16,
        alignItems: 'center',
    },
    generateButton: {
        backgroundColor: '#007AFF',
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
        minWidth: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    generateButtonDisabled: {
        backgroundColor: '#B0D4FF',
    },
    generateButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    generateError: {
        marginTop: 8,
        fontSize: 13,
        color: '#E53935',
    },
    canvasPlaceholderText: {
        color: '#CCC',
        fontSize: 20,
    },
    elementBox: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: '#007AFF',
        borderStyle: 'dashed',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
    },
    elementBoxHovered: {
        backgroundColor: '#FFFFFF',
    },
    elementIcon: {
        position: 'absolute',
        top: 4,
        left: 4,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    elementIconText: {
        width: 18,
        height: 18,
        backgroundColor: '#FF9500',
    },
    elementIconObj: {
        width: 18,
        height: 18,
        backgroundColor: '#007AFF',
    },
    elementIconChar: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    elementTextContent: {
        fontSize: 13,
        color: '#333',
        textAlign: 'center',
    },
    elementDescText: {
        fontSize: 11,
        color: '#666',
        textAlign: 'center',
    },
    tooltip: {
        position: 'absolute',
        backgroundColor: '#333333',
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        zIndex: 10,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 6,
    },
    tooltipText: {
        fontSize: 12,
        color: '#FFFFFF',
        lineHeight: 17,
    },
    tooltipArrow: {
        position: 'absolute',
        width: 10,
        height: 10,
        backgroundColor: '#333333',
        transform: [{ rotate: '45deg' }],
    },
});
