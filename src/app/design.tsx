import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, Type } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { ColorPalette } from './components/ColorPalette';
import { Corner, ElementBox, MIN_ELEMENT_SIZE } from './components/ElementBox';
import { Design, upsertDesign } from './services/designStore';
import { normalizePromptForIdeogram } from './services/IdeogramPrompt';
import { resolveContradictionInBBox } from './services/PromptRefiner';
import { CanvasElement, RefinedPrompt, isEmptyElement } from './types';

const IDEOGRAM_API_BASE = 'http://127.0.0.1:8000';
const IDEOGRAM_API_KEY = ''; // leave empty if the local service handles auth

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

/** Minimum drag distance in canvas pixels for a create-drag to count (vs a click). */
const MIN_CREATE_DRAG_PX = 12;

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

export default function DesignScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // Stable id for this design: passed in when re-opening a saved design,
    // otherwise freshly generated so repeated "Save"s upsert the same record.
    const [designId] = useState<string>(() =>
        params.id ? (params.id as string) : `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    );
    // Brief "Saved" confirmation shown after a successful save.
    const [showSaved, setShowSaved] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // True once the user has moved or resized a box after the caption loaded —
    // the only thing that can put an element's desc at odds with its bbox, and
    // the only case where the generate flow needs the LLM desc-rewrite.
    const bboxEditedRef = useRef(false);
    // All generated image URLs, in generation order. The canvas background shows
    // the latest by default; the history strip lets the user view older ones.
    const [images, setImages] = useState<string[]>([]);
    // Which generated image is currently shown on the canvas.
    const [viewIndex, setViewIndex] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    // Right-click context menu on an element box: its index and viewport position.
    const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
    // Element field editor dialog: which element and which field (desc | text) is being edited.
    const [editing, setEditing] = useState<{ index: number; field: 'desc' | 'text' } | null>(null);
    // The value being edited in the dialog's input.
    const [draft, setDraft] = useState('');
    // Active toolbar tool: drag on the canvas to create an element of this type.
    const [activeTool, setActiveTool] = useState<'text' | 'obj' | null>(null);
    // Live rectangle (canvas px) of the element currently being created by dragging.
    const [createDraft, setCreateDraft] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    // Anchor of the in-flight create-drag: start point in canvas px plus the
    // canvas origin in viewport px (for converting raw window pointer events).
    const createBaseRef = useRef<{ xPx: number; yPx: number; rectLeft: number; rectTop: number; type: 'text' | 'obj' } | null>(null);
    // When a generate attempt was blocked on empty elements, keep their boxes
    // highlighted (red) until the user fills them in.
    const [showEmptyHighlight, setShowEmptyHighlight] = useState(false);
    // Toggle driving the red border's blink; only animates during the flash.
    const [flashOn, setFlashOn] = useState(false);
    const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        try {
            const parsed = JSON.parse(params.promptData as string);
            console.log(parsed)
            setRefinedData(parsed);
            // A freshly loaded caption's descs match its bboxes: no rewrite
            // needed until the user moves or resizes a box.
            bboxEditedRef.current = false;

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

            // When re-opening a saved design, restore its generated image history
            // and show the latest one on the canvas.
            if (params.images) {
                const imgs = JSON.parse(params.images as string);
                if (Array.isArray(imgs) && imgs.length > 0) {
                    setImages(imgs);
                    setViewIndex(imgs.length - 1);
                }
            }
        } catch (e) {
            console.error('Failed to parse promptData', e);
        }
    }, [params.promptData, params.size, params.images]);


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
        // Only a real change (post-clamp) counts as an edit — drags that
        // no-op against the canvas edge keep the descs valid.
        if (clamped.some((v, i) => v !== drag.baseBbox[i])) bboxEditedRef.current = true;
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
        // Same as the drag path: mark edited only when the clamped bbox
        // actually changed.
        if (newBbox.some((v, i) => v !== resize.baseBbox[i])) bboxEditedRef.current = true;
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

    // Right-click an element box: open the context menu at the cursor,
    // clamped so the menu stays inside the viewport.
    const openContextMenu = (index: number, e: any) => {
        // Suppress the browser's native context menu.
        e?.preventDefault?.();
        e?.nativeEvent?.preventDefault?.();
        const point = e?.nativeEvent ?? e ?? {};
        const element = refinedData?.compositional_deconstruction.elements[index];
        const itemH = 36;
        const menuW = 180;
        // Edit description (+ Edit text for text elements) plus Delete.
        const itemCount = (element?.type === 'text' ? 2 : 1) + 1;
        const menuH = 12 + itemH * itemCount + 10;
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

    // Remove the context-menu target element from the caption and close the menu.
    const deleteElement = () => {
        if (!contextMenu) return;
        const { index } = contextMenu;
        setContextMenu(null);
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.filter((_, i) => i !== index);
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    // Append a new (empty) element of the given type with the given bbox.
    // It shows up on the canvas and can be filled in via the right-click menu.
    const addElement = (type: 'text' | 'obj', bbox: [number, number, number, number]) => {
        setRefinedData((prev) => {
            if (!prev) return prev;
            const element: CanvasElement = type === 'text'
                ? { type, bbox, text: '', desc: '' }
                : { type, bbox, desc: '' };
            return {
                ...prev,
                compositional_deconstruction: {
                    ...prev.compositional_deconstruction,
                    elements: [...prev.compositional_deconstruction.elements, element],
                },
            };
        });
    };

    // Start a create-drag on the canvas while a creation tool is active
    // (left button only; element boxes are pointer-transparent in tool mode).
    const handleCanvasPointerDown = (e: any) => {
        if (!activeTool || e.button !== 0 || displaySize.width <= 0 || displaySize.height <= 0) return;
        const rect = e.currentTarget?.getBoundingClientRect?.();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createBaseRef.current = { xPx: x, yPx: y, rectLeft: rect.left, rectTop: rect.top, type: activeTool };
        setCreateDraft({ left: x, top: y, width: 0, height: 0 });
    };

    // While a create-drag is in flight, track the pointer on window so the
    // rectangle follows even when the pointer leaves the canvas.
    const isCreating = createDraft !== null;
    useEffect(() => {
        if (!isCreating) return;
        const base = createBaseRef.current;
        if (!base) return;
        const onMove = (ev: PointerEvent) => {
            const x = ev.clientX - base.rectLeft;
            const y = ev.clientY - base.rectTop;
            setCreateDraft({
                left: Math.min(base.xPx, x),
                top: Math.min(base.yPx, y),
                width: Math.abs(x - base.xPx),
                height: Math.abs(y - base.yPx),
            });
        };
        const onUp = (ev: PointerEvent) => {
            const x = ev.clientX - base.rectLeft;
            const y = ev.clientY - base.rectTop;
            const wPx = Math.abs(x - base.xPx);
            const hPx = Math.abs(y - base.yPx);
            createBaseRef.current = null;
            setCreateDraft(null);
            // A plain click (no real drag) creates nothing.
            if (wPx < MIN_CREATE_DRAG_PX || hPx < MIN_CREATE_DRAG_PX) return;
            // Convert to a normalized (0-1000) bbox, clamped to the canvas,
            // and enforce the minimum element size.
            const xMin = Math.max(0, Math.round((Math.min(base.xPx, x) / displaySize.width) * 1000));
            const yMin = Math.max(0, Math.round((Math.min(base.yPx, y) / displaySize.height) * 1000));
            let xMax = Math.min(1000, Math.round(((Math.min(base.xPx, x) + wPx) / displaySize.width) * 1000));
            let yMax = Math.min(1000, Math.round(((Math.min(base.yPx, y) + hPx) / displaySize.height) * 1000));
            if (xMax - xMin < MIN_ELEMENT_SIZE) xMax = Math.min(1000, xMin + MIN_ELEMENT_SIZE);
            if (yMax - yMin < MIN_ELEMENT_SIZE) yMax = Math.min(1000, yMin + MIN_ELEMENT_SIZE);
            addElement(base.type, [yMin, xMin, yMax, xMax]);
            setActiveTool(null);
        };
        const onCancel = () => {
            createBaseRef.current = null;
            setCreateDraft(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };
    }, [isCreating, displaySize.width, displaySize.height]);

    // Escape cancels the active creation tool (and any in-flight create-drag).
    useEffect(() => {
        if (!activeTool) return;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                setActiveTool(null);
                createBaseRef.current = null;
                setCreateDraft(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activeTool]);

    // Blink the empty-element highlight for a few cycles, then settle on a
    // steady red border (showEmptyHighlight stays true until they're fixed).
    const startFlash = () => {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        let ticks = 0;
        const totalTicks = 6; // 3 full on/off cycles
        setFlashOn(true);
        flashTimerRef.current = setInterval(() => {
            ticks += 1;
            if (ticks >= totalTicks) {
                if (flashTimerRef.current) clearInterval(flashTimerRef.current);
                flashTimerRef.current = null;
                setFlashOn(true); // settle on the bright red border
            } else {
                setFlashOn((v) => !v);
            }
        }, 320);
    };

    // Clean up timers if the screen unmounts mid-blink / mid-save-flash.
    useEffect(() => () => {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }, []);

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
        // No empty elements: a text element needs its text, an obj element its
        // description. They can be filled in via the right-click menu.
        const elements = refinedData.compositional_deconstruction.elements;
        const emptyIndex = elements.findIndex(isEmptyElement);
        if (emptyIndex !== -1) {
            const empty = elements[emptyIndex];
            const field = empty?.type === 'text' ? 'text' : 'description';
            setGenerateError(`Element ${emptyIndex + 1} is empty — right-click it on the canvas to edit its ${field}.`);
            // Point the user at the offending box(es) on the canvas.
            setShowEmptyHighlight(true);
            startFlash();
            return;
        }
        setIsGenerating(true);
        setGenerateError(null);
        try {
            // Only when the user actually moved or resized a box can descs be
            // at odds with bboxes — unedited designs skip the extra LLM call.
            let dataToGenerate = refinedData;
            if (bboxEditedRef.current) {
                // Resolve the contradiction between each element's desc and its
                // bbox (which the user moved or resized on the canvas).
                const systemPrompt = await loadRewriteSystemPrompt();
                const rewritten = parseRewrittenCaption(
                    await resolveContradictionInBBox(systemPrompt, JSON.stringify(refinedData)),
                );

                // The model is instructed to keep every field except desc, but
                // the bboxes on the canvas are the source of truth, so merge
                // only the rewritten descs back into the local caption and
                // send that.
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
                dataToGenerate = resolvedData;
                setRefinedData(resolvedData);
                // The descs now match the current bboxes; don't rewrite again
                // until the next box edit.
                bboxEditedRef.current = false;
            }
            console.log(dataToGenerate)
            const formData = new FormData();
            // The service expects json_prompt as a plain string field, not a file
            // upload. Normalize first so style_description carries exactly one
            // of photo/art_style, in the key order Ideogram 4.0 expects.
            formData.append('json_prompt', JSON.stringify(normalizePromptForIdeogram(dataToGenerate)));
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
            // Append to the history and switch the canvas to the new latest image.
            setImages((prev) => [...prev, url]);
            setViewIndex(images.length);
        } catch (error: any) {
            setGenerateError(error?.message ?? 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    // Palette edits update the display state and write back into the prompt,
    // so the swatches the user composes are what gets generated/saved.
    const handlePaletteChange = (colors: string[]) => {
        setPalette(colors);
        setRefinedData((prev) => prev
            ? { ...prev, style_description: { ...(prev.style_description ?? {}), color_palette: colors } }
            : prev);
    };

    // Persist the current prompt + generated images as a design (the design-file
    // framework: { prompt, images }).
    const handleSave = () => {
        if (!refinedData) return;
        const design: Design = {
            id: designId,
            prompt: normalizePromptForIdeogram(refinedData),
            images,
            size: { width: canvasSize.width, height: canvasSize.height },
            updatedAt: Date.now(),
        };
        upsertDesign(design);
        setShowSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setShowSaved(false), 1800);
    };

    // The image shown on the canvas: the one the user selected in the history
    // strip, defaulting to the most recently generated.
    const shownIndex = images.length === 0 ? -1 : Math.min(viewIndex, images.length - 1);
    const shownImage = shownIndex >= 0 ? images[shownIndex] : null;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.mainContent}>
                {/* Left Sidebar: Toolbar */}
                <View style={styles.toolbar}>
                    <TouchableOpacity
                        style={[styles.toolButton, activeTool === 'text' && styles.toolButtonActive]}
                        onPress={() => {
                            setActiveTool(activeTool === 'text' ? null : 'text');
                            setHoveredIndex(null);
                        }}
                    >
                        <Type color={activeTool === 'text' ? '#FFFFFF' : '#007AFF'} size={28} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toolButton, activeTool === 'obj' && styles.toolButtonActive]}
                        onPress={() => {
                            setActiveTool(activeTool === 'obj' ? null : 'obj');
                            setHoveredIndex(null);
                        }}
                    >
                        <ImageIcon color={activeTool === 'obj' ? '#FFFFFF' : '#007AFF'} size={28} />
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

                    {/* Metadata Bar: six sections in one row, each capped at
                        20% of the row width; tags/swatches wrap inside a
                        section instead of scrolling it off-screen. */}
                    <View style={styles.metadataContainer}>
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
                        {artStyle !== "" && (
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Art Style</Text>
                                <View style={styles.tagRow}>
                                    {artStyle.split(' ').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                                </View>
                            </View>
                        )}
                        {photo !== "" && (
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Photo</Text>
                                <View style={styles.tagRow}>
                                    {photo.split(',').map((val, i) => <Tag key={`photo-${i}`} text={val} />)}
                                </View>
                            </View>
                        )}
                        <View style={styles.metadataGroup}>
                            <Text style={styles.groupLabel}>Medium</Text>
                            <View style={styles.tagRow}>
                                <Tag text={medium} />
                            </View>
                        </View>
                        <View style={styles.metadataGroup}>
                            <Text style={styles.groupLabel}>Palette</Text>
                            <ColorPalette palette={palette} onPaletteChange={handlePaletteChange} />
                        </View>
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
                            }}
                        >
                            <View
                                style={[
                                    styles.canvas,
                                    { width: displaySize.width, height: displaySize.height },
                                    // Web: crosshair while a creation tool is armed.
                                    (activeTool ? { cursor: 'crosshair' } : {}) as any,
                                ]}
                                onPointerDown={handleCanvasPointerDown}
                            >
                                {/* Generated image: rendered first so the element boxes overlay it.
                                    Shows the latest image by default (see shownImage). */}
                                {shownImage && (
                                    <Image
                                        source={{ uri: shownImage }}
                                        style={[
                                            styles.generatedImage,
                                            { width: displaySize.width, height: displaySize.height },
                                        ]}
                                        resizeMode="cover"
                                    />
                                )}

                                {refinedData && refinedData.compositional_deconstruction.elements.length > 0 ? (
                                    <>
                                        {/* Element layer: pointer-transparent while a creation
                                            tool is active so drags start new elements. */}
                                        <View style={styles.elementLayer} pointerEvents={activeTool ? 'none' : undefined}>
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
                                                    empty={showEmptyHighlight && isEmptyElement(element)}
                                                    flashOn={flashOn}
                                                />
                                            );
                                        })}
                                        </View>

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

                                {/* Live rectangle of the element being created by dragging */}
                                {createDraft && (
                                    <View
                                        pointerEvents="none"
                                        style={[
                                            styles.createDraft,
                                            {
                                                left: createDraft.left,
                                                top: createDraft.top,
                                                width: createDraft.width,
                                                height: createDraft.height,
                                                borderColor: activeTool === 'text' ? '#FF9500' : '#007AFF',
                                            },
                                        ]}
                                    />
                                )}
                            </View>
                        </View>

                        {/* Creation tool hint */}
                        {activeTool && (
                            <Text style={styles.toolHint}>
                                Drag on the canvas to create a {activeTool === 'text' ? 'text' : 'object'} element · Esc to cancel
                            </Text>
                        )}

                        {/* History of generated images: click a thumbnail to view it
                            on the canvas (the latest is shown by default). */}
                        {images.length > 0 && (
                            <View style={styles.historyStrip}>
                                <Text style={styles.historyLabel}>Generated ({images.length})</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.historyRow}
                                >
                                    {images.map((url, i) => (
                                        <TouchableOpacity
                                            key={`hist-${i}`}
                                            onPress={() => setViewIndex(i)}
                                            activeOpacity={0.8}
                                        >
                                            <Image
                                                source={{ uri: url }}
                                                style={[styles.historyThumb, i === shownIndex && styles.historyThumbActive]}
                                                resizeMode="cover"
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Save + Generate buttons */}
                        <View style={styles.generateRow}>
                            <TouchableOpacity
                                style={[styles.saveButton, !refinedData && styles.saveButtonDisabled]}
                                onPress={handleSave}
                                disabled={!refinedData}
                            >
                                <Text style={styles.saveButtonText}>Save</Text>
                            </TouchableOpacity>
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
                            {showSaved && <Text style={styles.savedText}>Saved ✓</Text>}
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
                                <View style={styles.contextMenuDivider} />
                                <TouchableOpacity style={styles.contextMenuItemDanger} onPress={deleteElement}>
                                    <Text style={styles.contextMenuItemTextDanger}>Delete</Text>
                                </TouchableOpacity>
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
    toolButtonActive: {
        backgroundColor: '#007AFF',
        borderRadius: 8,
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
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FDFDFD',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    // One metadata section (Aesthetics / Lighting / Art Style / Photo /
    // Medium / Palette): an equal share of the row, capped at 20% of its
    // width, with content wrapping inside the section.
    metadataGroup: {
        flex: 1,
        maxWidth: '20%',
        marginRight: 24,
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
        marginBottom: 4,
    },
    tagText: {
        fontSize: 12,
        color: '#444',
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
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
        justifyContent: 'center',
        flexDirection: 'row',
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
    // Secondary Save button, shown to the left of Generate.
    saveButton: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 10,
        marginRight: 12,
        minWidth: 96,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    saveButtonDisabled: {
        borderColor: '#B0D4FF',
        backgroundColor: '#F5F9FF',
    },
    saveButtonText: {
        color: '#007AFF',
        fontSize: 15,
        fontWeight: '600',
    },
    savedText: {
        marginLeft: 14,
        fontSize: 13,
        fontWeight: '600',
        color: '#30A46C',
    },
    generateError: {
        marginTop: 8,
        fontSize: 13,
        color: '#E53935',
    },
    // Horizontal strip of generated-image thumbnails (view history).
    historyStrip: {
        alignSelf: 'stretch',
        marginTop: 16,
        marginBottom: 4,
    },
    historyLabel: {
        fontSize: 11,
        color: '#AAA',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: 6,
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    historyThumb: {
        width: 64,
        height: 64,
        borderRadius: 6,
        marginRight: 8,
        borderWidth: 2,
        borderColor: '#DDD',
        backgroundColor: '#F5F5F5',
    },
    historyThumbActive: {
        borderColor: '#007AFF',
    },
    canvasPlaceholderText: {
        color: '#CCC',
        fontSize: 20,
    },
    // Floating tooltip for the hovered text element.
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
    contextMenuDivider: {
        height: 1,
        backgroundColor: '#EEE',
        marginVertical: 4,
    },
    contextMenuItemDanger: {
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    contextMenuItemTextDanger: {
        fontSize: 14,
        color: '#FF3B30',
        fontWeight: '600',
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
    // Full-canvas layer holding the element boxes (pointer-transparent in tool mode).
    elementLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    // Live rectangle preview while dragging out a new element.
    createDraft: {
        position: 'absolute',
        borderWidth: 1,
        borderStyle: 'dashed',
        backgroundColor: 'rgba(0, 122, 255, 0.08)',
    },
    // Hint shown below the canvas while a creation tool is armed.
    toolHint: {
        marginTop: 12,
        fontSize: 13,
        fontWeight: '600',
        color: '#007AFF',
    },
});
