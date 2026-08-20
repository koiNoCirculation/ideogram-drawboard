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
import { resolveContradictionInBBox } from './services/PromptRefiner';

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
 * Parse the LLM's rewritten caption, tolerating stray markdown fences or prose
 * around the JSON object (the prompt asks for bare JSON, but be defensive).
 * Throws if the response is not a usable caption.
 */
function parseRewrittenCaption(content: string): RefinedPrompt {
    const trimmed = content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error('The bbox-rewrite model did not return a JSON caption.');
    }
    const parsed: any = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed?.compositional_deconstruction?.elements)) {
        throw new Error('The rewritten caption is missing compositional_deconstruction.elements.');
    }
    return parsed as RefinedPrompt;
}

/** Which corner of the box a resize gesture started from. */
type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Minimum element size in normalized (0-1000) units, so corners can't cross. */
const MIN_ELEMENT_SIZE = 20;

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
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onContextMenu,
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
    onResizeStart: (corner: Corner) => void;
    onResizeMove: (dxPx: number, dyPx: number) => void;
    onResizeEnd: () => void;
    /** Right-click (web) on the box: opens the edit context menu. */
    onContextMenu: (e: any) => void;
}) => {
    const isText = element.type === 'text';

    // Shrink the move surface away from the edges so drags starting near a
    // corner go to the resize handles instead of moving the element.
    const moveInset = Math.min(14, Math.max(0, Math.floor(Math.min(width, height) / 4)));

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
            // React Native Web maps this to the DOM `contextmenu` event (right-click).
            // It's not in the `react-native` type defs, hence the spread cast.
            {...({ onContextMenu } as Record<string, any>)}
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

            {/* Move surface: inset from the box edges. Rendered above the
                icon/label (transparent) but below the resize handles, so
                corner drags are claimed by the handles. */}
            <View
                style={[
                    styles.elementMoveArea,
                    { top: moveInset, left: moveInset, right: moveInset, bottom: moveInset },
                ]}
                {...panResponder.panHandlers}
            />

            {/* Corner resize handles */}
            {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                <ResizeHandle
                    key={corner}
                    corner={corner}
                    onResizeStart={() => onResizeStart(corner)}
                    onResizeMove={onResizeMove}
                    onResizeEnd={onResizeEnd}
                />
            ))}
        </View>
    );
};

/**
 * A corner handle for resizing its parent element box. Nested inside the
 * box's move responder; as a descendant it wins the gesture contest.
 */
const ResizeHandle = ({
    corner,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
}: {
    corner: Corner;
    onResizeStart: () => void;
    onResizeMove: (dxPx: number, dyPx: number) => void;
    onResizeEnd: () => void;
}) => {
    const startRef = useRef(onResizeStart);
    const moveRef = useRef(onResizeMove);
    const endRef = useRef(onResizeEnd);
    startRef.current = onResizeStart;
    moveRef.current = onResizeMove;
    endRef.current = onResizeEnd;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_e, g) =>
                Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
            onPanResponderGrant: () => startRef.current(),
            onPanResponderMove: (_e, g) => moveRef.current(g.dx, g.dy),
            onPanResponderRelease: () => endRef.current(),
            onPanResponderTerminate: () => endRef.current(),
        })
    ).current;

    return (
        <View
            style={[styles.resizeHandle, styles[`resizeHandle_${corner}`]]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            {...panResponder.panHandlers}
        />
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
    // Base bbox and corner captured when a resize starts; live moves are
    // computed from it so the box's growing edges never feed back into the delta.
    const resizeBaseRef = useRef<{ index: number; baseBbox: [number, number, number, number]; corner: Corner } | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    // Right-click context menu on an element box: its index and viewport position.
    const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
    // Element field editor dialog: which element and which field (desc | text) is being edited.
    const [editing, setEditing] = useState<{ index: number; field: 'desc' | 'text' } | null>(null);
    // The value being edited in the dialog's input.
    const [draft, setDraft] = useState('');

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

    // Clamp a normalized (0-1000) bbox so it stays fully inside the canvas,
    // rounding the result to integer coordinates.
    const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
        const [yMin, xMin, yMax, xMax] = bbox;
        const x = Math.min(Math.max(xMin, 0), Math.max(1000 - (xMax - xMin), 0));
        const y = Math.min(Math.max(yMin, 0), Math.max(1000 - (yMax - yMin), 0));
        return [Math.round(y), Math.round(x), Math.round(y + (yMax - yMin)), Math.round(x + (xMax - xMin))];
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

    const handleResizeStart = (index: number, corner: Corner) => {
        const element = refinedData?.compositional_deconstruction.elements[index];
        if (!element?.bbox) return;
        resizeBaseRef.current = { index, baseBbox: element.bbox, corner };
    };

    // Live-update the resized element's bbox: extend/shift the edges controlled
    // by the grabbed corner, clamped to the canvas and a minimum element size.
    const handleResizeMove = (dxPx: number, dyPx: number) => {
        const resize = resizeBaseRef.current;
        if (!resize || displaySize.width <= 0 || displaySize.height <= 0) return;
        const dx = (dxPx / displaySize.width) * 1000;
        const dy = (dyPx / displaySize.height) * 1000;
        const [yMin, xMin, yMax, xMax] = resize.baseBbox;
        const { corner } = resize;
        const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
        let nxMin = xMin, nxMax = xMax, nyMin = yMin, nyMax = yMax;
        if (corner === 'nw' || corner === 'sw') nxMin = clamp(xMin + dx, 0, xMax - MIN_ELEMENT_SIZE);
        if (corner === 'ne' || corner === 'se') nxMax = clamp(xMax + dx, xMin + MIN_ELEMENT_SIZE, 1000);
        if (corner === 'nw' || corner === 'ne') nyMin = clamp(yMin + dy, 0, yMax - MIN_ELEMENT_SIZE);
        if (corner === 'sw' || corner === 'se') nyMax = clamp(yMax + dy, yMin + MIN_ELEMENT_SIZE, 1000);
        const newBbox: [number, number, number, number] = [
            Math.round(nyMin), Math.round(nxMin), Math.round(nyMax), Math.round(nxMax),
        ];
        const { index } = resize;
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) =>
                i === index ? { ...el, bbox: newBbox } : el
            );
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    const handleResizeEnd = () => {
        resizeBaseRef.current = null;
    };

    // Right-click an element box: open the edit context menu at the cursor,
    // clamped so the menu stays inside the viewport.
    const openContextMenu = (index: number, e: any) => {
        // Suppress the browser's native context menu.
        e?.preventDefault?.();
        e?.nativeEvent?.preventDefault?.();
        const point = e?.nativeEvent ?? e ?? {};
        const element = refinedData?.compositional_deconstruction.elements[index];
        const itemH = 36;
        const menuW = 180;
        const menuH = 12 + itemH * (element?.type === 'text' ? 2 : 1);
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        setContextMenu({
            index,
            x: Math.min(Math.max(point.clientX ?? 0, 8), vw - menuW - 8),
            y: Math.min(Math.max(point.clientY ?? 0, 8), vh - menuH - 8),
        });
    };

    // Open the edit dialog for the field of the context-menu target element.
    const openEditor = (field: 'desc' | 'text') => {
        if (!contextMenu) return;
        const { index } = contextMenu;
        const element = refinedData?.compositional_deconstruction.elements[index];
        setContextMenu(null);
        if (!element) return;
        setDraft(field === 'desc' ? (element.desc ?? '') : (element.text ?? ''));
        setEditing({ index, field });
    };

    // Save the dialog's draft back into the element and close the dialog.
    const saveEdit = () => {
        if (!editing) return;
        const value = draft.trim();
        if (!value) return;
        const { index, field } = editing;
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) => {
                if (i !== index) return el;
                return field === 'desc' ? { ...el, desc: value } : { ...el, text: value };
            });
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
        setEditing(null);
    };

    // Load the bbox-rewrite system prompt from the public assets directory.
    async function loadRewriteSystemPrompt(): Promise<string> {
        try {
            const response = await fetch('/system_prompt_rewrite_adapt_bbox.txt');
            if (!response.ok) {
                throw new Error(`Failed to fetch system prompt: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error('[loadRewriteSystemPrompt Error]:', error);
            throw new Error('Could not load the bbox-rewrite system prompt. Please ensure assets are correctly bundled.');
        }
    }

    // Rewrite element descs (to match the user-modified bboxes), then call the
    // local Ideogram-compatible service to generate the image.
    const handleGenerate = async () => {
        if (!refinedData || isGenerating) return;
        setIsGenerating(true);
        setGenerateError(null);
        try {
            // Before generating, resolve the contradiction between each
            // element's desc and its bbox (which the user may have moved or
            // resized on the canvas).
            const systemPrompt = await loadRewriteSystemPrompt();
            const rewritten = parseRewrittenCaption(
                await resolveContradictionInBBox(systemPrompt, JSON.stringify(refinedData)),
            );

            // The model is instructed to keep every field except desc, but the
            // bboxes on the canvas are the source of truth, so merge only the
            // rewritten descs back into the local caption and send that.
            const elements = refinedData.compositional_deconstruction.elements.map((element, i) => {
                const fix = rewritten.compositional_deconstruction.elements[i];
                if (!fix || fix.type !== element.type || typeof fix.desc !== 'string' || !fix.desc) return element;
                return { ...element, desc: fix.desc };
            });
            const resolvedData: RefinedPrompt = {
                ...refinedData,
                compositional_deconstruction: {
                    ...refinedData.compositional_deconstruction,
                    elements,
                },
            };
            setRefinedData(resolvedData);
            console.log(refinedData)
            const formData = new FormData();
            // The service expects json_prompt as a plain string field, not a file upload.
            formData.append('json_prompt', JSON.stringify(resolvedData));
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
                                                    onResizeStart={(corner) => handleResizeStart(index, corner)}
                                                    onResizeMove={handleResizeMove}
                                                    onResizeEnd={handleResizeEnd}
                                                    onContextMenu={(e) => openContextMenu(index, e)}
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

            {/* Right-click context menu for an element box: a transparent
                full-viewport catcher (closes the menu on any other click)
                plus the fixed-position menu itself. */}
            {contextMenu && (
                <>
                    <View style={styles.menuBackdrop} onPointerDown={() => setContextMenu(null)} />
                    {(() => {
                        const element = refinedData?.compositional_deconstruction.elements[contextMenu.index];
                        if (!element) return null;
                        return (
                            <View style={[styles.contextMenu, { left: contextMenu.x, top: contextMenu.y }]}>
                                <TouchableOpacity style={styles.contextMenuItem} onPress={() => openEditor('desc')}>
                                    <Text style={styles.contextMenuItemText}>Edit description</Text>
                                </TouchableOpacity>
                                {element.type === 'text' && (
                                    <TouchableOpacity style={styles.contextMenuItem} onPress={() => openEditor('text')}>
                                        <Text style={styles.contextMenuItemText}>Edit text</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })()}
                </>
            )}

            {/* Element field editor dialog (desc or text) */}
            {editing && (() => {
                const element = refinedData?.compositional_deconstruction.elements[editing.index];
                if (!element) return null;
                const isDesc = editing.field === 'desc';
                return (
                    <View style={styles.dialogBackdrop} onPointerDown={() => setEditing(null)}>
                        <View style={styles.dialogCard} onPointerDown={(e) => e.stopPropagation()}>
                            <Text style={styles.dialogTitle}>{isDesc ? 'Edit description' : 'Edit text'}</Text>
                            <TextInput
                                style={styles.dialogInput}
                                value={draft}
                                onChangeText={setDraft}
                                multiline
                                textAlignVertical="top"
                                selectTextOnFocus
                                autoFocus
                            />
                            <View style={styles.dialogActions}>
                                <TouchableOpacity style={styles.dialogCancelButton} onPress={() => setEditing(null)}>
                                    <Text style={styles.dialogCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.dialogSaveButton, !draft.trim() && styles.dialogButtonDisabled]}
                                    onPress={saveEdit}
                                    disabled={!draft.trim()}
                                >
                                    <Text style={styles.dialogSaveText}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                );
            })()}
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
    elementMoveArea: {
        position: 'absolute',
    },
    resizeHandle: {
        position: 'absolute',
        width: 14,
        height: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 3,
    },
    resizeHandle_nw: { top: -7, left: -7 },
    resizeHandle_ne: { top: -7, right: -7 },
    resizeHandle_sw: { bottom: -7, left: -7 },
    resizeHandle_se: { bottom: -7, right: -7 },
    tooltipArrow: {
        position: 'absolute',
        width: 10,
        height: 10,
        backgroundColor: '#333333',
        transform: [{ rotate: '45deg' }],
    },
    // Right-click context menu: a transparent full-viewport catcher and the
    // fixed-position menu rendered on top of it.
    menuBackdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 90,
    },
    contextMenu: {
        position: 'fixed',
        zIndex: 91,
        width: 180,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        paddingVertical: 6,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 8,
    },
    contextMenuItem: {
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    contextMenuItemText: {
        fontSize: 14,
        color: '#333',
    },
    // Element field editor dialog: dimmed full-viewport backdrop with a
    // centered card.
    dialogBackdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        zIndex: 95,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dialogCard: {
        width: 420,
        maxWidth: '90%',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 20,
        zIndex: 96,
    },
    dialogTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    dialogInput: {
        minHeight: 90,
        maxHeight: 200,
        borderColor: '#DDD',
        borderWidth: 1,
        borderRadius: 6,
        padding: 10,
        fontSize: 14,
        color: '#333',
        backgroundColor: '#FAFAFA',
    },
    dialogActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 16,
    },
    dialogCancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFFFFF',
    },
    dialogCancelText: {
        fontSize: 14,
        color: '#555',
    },
    dialogSaveButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: '#007AFF',
    },
    dialogSaveText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    dialogButtonDisabled: {
        backgroundColor: '#B0D4FF',
    },
});
