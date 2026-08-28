import { Stack, useLocalSearchParams } from 'expo-router';
import { Settings as SettingsIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../i18n';
import { BackgroundEditor } from './components/design/BackgroundEditor';
import { CanvasStage } from './components/design/CanvasStage';
import { ContextMenu } from './components/design/ContextMenu';
import { EditDialog } from './components/design/EditDialog';
import { HeaderBackButton } from './components/design/HeaderBackButton';
import { MetadataBar } from './components/design/MetadataBar';
import { PromptDialog } from './components/design/PromptDialog';
import { Toolbar } from './components/design/Toolbar';
import { ErrorFloat } from './components/ErrorFloat';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SettingsDialog } from './components/SettingsDialog';
import { snapToGridValue } from './design/canvas';
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, CANVAS_WHEEL_ZOOM_FACTOR, gridCellUnits, RULER_LEFT_WIDTH, RULER_TOP_HEIGHT } from './design/constants';
import { styles } from './design/designStyles';
import type { ElementTool } from './design/useCanvasInteraction';
import { useCanvasInteraction } from './design/useCanvasInteraction';
import { useElementEditing } from './design/useElementEditing';
import { useGeneration } from './design/useGeneration';
import { useHistory } from './design/useHistory';
import { getDesign, getDesignHandoff, newDesignId } from './services/designStore';
import { RefinedPrompt } from './types';

// Stack header config: a custom back button (see HeaderBackButton) in place
// of the default one, which disappears after a refresh. The route's default
// "design" title is emptied — the page has its own editable title in the body.
const designScreenOptions = { title: '', headerLeft: () => <HeaderBackButton /> };

export default function DesignScreen() {
    const params = useLocalSearchParams();
    const { t } = useI18n();

    // Stable id for this design: passed in by the home page (freshly
    // generated for new designs, reused when re-opening a saved one) so
    // repeated "Save"s upsert the same record.
    const [designId] = useState<string>(() => (params.id as string) || newDesignId());

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
    // Wheel zoom applied to the canvas (and its elements) only; >1 makes the
    // canvas area scrollable so the enlarged canvas can be panned.
    const [canvasZoom, setCanvasZoom] = useState(CANVAS_MIN_ZOOM);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    // True once the user has moved or resized a box after the caption loaded —
    // the only thing that can put an element's desc at odds with its bbox, and
    // the only case where the generate flow needs the LLM desc-rewrite.
    const bboxEditedRef = useRef(false);
    // Active toolbar tool: drag on the canvas to create an element of this type.
    const [activeTool, setActiveTool] = useState<ElementTool | null>(null);
    // "Show elements" checkbox (top-right of the canvas area): when unchecked,
    // the prompt's element boxes are hidden from the canvas.
    const [showElements, setShowElements] = useState(true);
    // "Show grid" checkbox: when unchecked the grid overlay is hidden and
    // grid snapping is disabled.
    const [showGrid, setShowGrid] = useState(true);
    // Settings dialog (opened from the gear icon in the header).
    const [showSettings, setShowSettings] = useState(false);
    // The user's original prompt (for the Show Prompt dialog); empty when the
    // design has no record of one (legacy saved designs, bare /design visit).
    const [rawPrompt, setRawPrompt] = useState('');
    // Show Prompt dialog (original prompt vs. refined structured JSON).
    const [showPromptDialog, setShowPromptDialog] = useState(false);

    // Scale the requested canvas size to fit the available area, preserving aspect ratio,
    // then apply the wheel zoom (canvas + elements only; the outer UI is unscaled).
    // The area also has to fit the ruler strips extending outward from the
    // canvas (RULER_LEFT_WIDTH on the left, RULER_TOP_HEIGHT on top).
    const scale = canvasSize.width > 0 && canvasSize.height > 0 && canvasAreaSize.width > 0
        ? Math.min(
            Math.max(canvasAreaSize.width - RULER_LEFT_WIDTH, 0) / canvasSize.width,
            Math.max(canvasAreaSize.height - RULER_TOP_HEIGHT, 0) / canvasSize.height,
        )
        : 0;
    const displaySize = {
        width: canvasSize.width * scale * canvasZoom,
        height: canvasSize.height * scale * canvasZoom,
    };

    // Snap a 0-1000 coordinate to the grid of the current zoom level.
    // Snapping only happens while the grid is shown.
    const snapToGrid = (v: number): number => {
        if (!showGrid) return Math.round(v);
        const cell = gridCellUnits(canvasZoom);
        return snapToGridValue(v, cell);
    };

    // Snapshot-based undo/redo over the document (refinedData + palette).
    const history = useHistory(refinedData, palette, setRefinedData, setPalette, bboxEditedRef);
    // All canvas pointer interaction: drag / resize (with alignment guides) and
    // dragging out a new element.
    const interaction = useCanvasInteraction(
        refinedData, setRefinedData, displaySize, snapToGrid,
        activeTool, setActiveTool, bboxEditedRef,
        history.beginHistory, history.commitHistory, history.cancelHistory, history.recordAction,
    );
    // Right-click context menu + element field editor + deletion.
    const editing = useElementEditing(refinedData, setRefinedData, history.recordAction, bboxEditedRef);
    // Image generation + saving + the generated-image history.
    const generation = useGeneration(refinedData, setRefinedData, canvasSize, designId, bboxEditedRef, rawPrompt);

    // Load the design by id: a just-started design's prompt lives in the
    // localStorage handoff (too large for URL query params — HTTP 431); a
    // re-opened design lives in the design store under the same id. The
    // handoff only exists until the first Save, so it never shadows stored
    // edits. With no id / no data (bare /design visit) the placeholder stays.
    useEffect(() => {
        const id = params.id as string | undefined;
        const handoff = id ? getDesignHandoff(id) : undefined;
        const stored = id && !handoff ? getDesign(id) : undefined;
        const promptData = handoff?.promptData ?? (stored ? JSON.stringify(stored.prompt) : null);
        if (!promptData) return;
        try {
            const parsed = JSON.parse(promptData);
            setRefinedData(parsed);
            // A freshly loaded caption's descs match its bboxes: no rewrite
            // needed until the user moves or resizes a box.
            bboxEditedRef.current = false;
            // A freshly loaded (or re-opened) design starts with clean history
            // and a reset zoom.
            history.resetHistory();
            setCanvasZoom(CANVAS_MIN_ZOOM);

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

            const size = handoff
                ? handoff.size
                : stored?.size;
            if (size) {
                setCanvasSize({ width: size.width, height: size.height });
            }

            // The user's original prompt (handoff for a fresh design, store
            // for a re-opened one); '' when neither recorded one.
            setRawPrompt(handoff?.rawPrompt ?? stored?.rawPrompt ?? '');

            // Restore the generated-image history (show the latest): from the
            // stored design on reopen, or a handoff seed (an example's image).
            const restoredImages = handoff?.images ?? stored?.images;
            if (restoredImages) {
                generation.restoreImages(restoredImages);
            }
        } catch (e) {
            console.error('Failed to parse promptData', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    // Mouse wheel over the canvas area zooms the canvas (web). A native
    // non-passive listener so preventDefault stops the container scrolling at
    // the same time — panning an enlarged canvas is done via the scrollbars.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const node = document.querySelector('[data-testid="canvas-sizer"]') as HTMLElement | null;
        if (!node) return;
        const onWheel = (e: WheelEvent) => {
            if (e.deltaY === 0) return; // horizontal trackpad pans scroll natively
            e.preventDefault();
            setCanvasZoom((z) => {
                const next = e.deltaY < 0 ? z * CANVAS_WHEEL_ZOOM_FACTOR : z / CANVAS_WHEEL_ZOOM_FACTOR;
                return Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, next));
            });
        };
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, []);

    // Zoom toward the center: after each zoom step, scroll the (overflowing)
    // canvas area so the canvas center stays at the viewport center.
    useEffect(() => {
        if (typeof document === 'undefined' || canvasZoom <= 1) return;
        const node = document.querySelector('[data-testid="canvas-sizer"]') as HTMLElement | null;
        if (!node) return;
        const id = requestAnimationFrame(() => {
            // The scrollable content is the canvas frame (canvas + outward
            // rulers), which extends RULER_LEFT_WIDTH / RULER_TOP_HEIGHT past
            // the canvas's left/top but not its right/bottom — so centering
            // the frame leaves the canvas center half a ruler off; add the
            // correction (on any axis that still fits the expression is
            // negative and clamps to 0, where auto margins already center).
            node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2 + RULER_LEFT_WIDTH / 2;
            node.scrollTop = (node.scrollHeight - node.clientHeight) / 2 + RULER_TOP_HEIGHT / 2;
        });
        return () => cancelAnimationFrame(id);
    }, [canvasZoom]);

    // Escape cancels the active creation tool (and any in-flight create-drag).
    useEffect(() => {
        if (!activeTool) return;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                setActiveTool(null);
                interaction.cancelCreation();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTool]);

    // Toggle a creation tool (a second press deactivates it) and clear any
    // in-progress hover highlight.
    const toggleTool = (tool: ElementTool) => {
        setActiveTool(activeTool === tool ? null : tool);
        setHoveredIndex(null);
    };

    // Layer-list eye toggle: hide/show one element. Hiding stores
    // visible:false (the box disappears from the canvas and the element is
    // excluded from generation); showing removes the key again (absent =
    // visible). One undo step per toggle, like the other element edits.
    const handleToggleVisible = (index: number) => {
        history.recordAction();
        setRefinedData((prev) => prev
            ? {
                ...prev,
                compositional_deconstruction: {
                    ...prev.compositional_deconstruction,
                    elements: prev.compositional_deconstruction.elements.map((el, i) => {
                        if (i !== index) return el;
                        if (el.visible === false) {
                            const { visible: _v, ...rest } = el;
                            return rest;
                        }
                        return { ...el, visible: false };
                    }),
                },
            }
            : prev);
    };

    // Palette edits update the display state and write back into the prompt,
    // so the swatches the user composes are what gets generated/saved.
    const handlePaletteChange = (colors: string[]) => {
        history.recordAction();
        setPalette(colors);
        setRefinedData((prev) => prev
            ? { ...prev, style_description: { ...(prev.style_description ?? {}), color_palette: colors } }
            : prev);
    };

    const elements = refinedData?.compositional_deconstruction?.elements ?? [];

    return (
        <>
            <Stack.Screen options={designScreenOptions} />
            <SafeAreaView style={styles.container}>
            <View style={styles.mainContent}>
                <Toolbar
                    activeTool={activeTool}
                    onToolToggle={toggleTool}
                    canUndo={history.undoState.past.length > 0}
                    canRedo={history.undoState.future.length > 0}
                    onUndo={history.undo}
                    onRedo={history.redo}
                />

                {/* Right Content: Title, Metadata & Canvas */}
                <View style={styles.canvasArea}>
                    {/* Top Header: Title Input + Settings gear (top-right) */}
                    <View style={styles.header}>
                        <TextInput
                            style={styles.titleInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={t('untitled')}
                        />
                        {/* Language flag, left of the settings gear. */}
                        <LanguageSwitcher style={styles.langButton} />
                        <TouchableOpacity
                            style={styles.settingsButton}
                            onPress={() => setShowSettings(true)}
                            testID="settings-gear"
                        >
                            <SettingsIcon color="#007AFF" size={28} />
                        </TouchableOpacity>
                    </View>

                    <MetadataBar
                        aesthetics={aesthetics}
                        lighting={lighting}
                        medium={medium}
                        photo={photo}
                        artStyle={artStyle}
                        palette={palette}
                        onPaletteChange={handlePaletteChange}
                    />

                    {/* Background: click to edit the scene-shell description. */}
                    <BackgroundEditor
                        background={refinedData?.compositional_deconstruction?.background}
                        onSave={(value) => { history.recordAction(); setRefinedData((prev) => prev ? {
                            ...prev,
                            compositional_deconstruction: { ...prev.compositional_deconstruction, background: value },
                        } : prev); }}
                    />

                    <CanvasStage
                        showGrid={showGrid}
                        showElements={showElements}
                        onToggleGrid={() => setShowGrid((v) => !v)}
                        onToggleElements={() => setShowElements((v) => !v)}
                        canvasZoom={canvasZoom}
                        displaySize={displaySize}
                        activeTool={activeTool}
                        onCanvasPointerDown={interaction.handleCanvasPointerDown}
                        onToggleVisible={handleToggleVisible}
                        onSizerLayout={(e: any) => setCanvasAreaSize({
                            width: e.nativeEvent.layout.width,
                            height: e.nativeEvent.layout.height,
                        })}
                        shownImage={generation.shownImage}
                        elements={elements}
                        hoveredIndex={hoveredIndex}
                        onHoverIn={(i: number) => setHoveredIndex(i)}
                        onHoverOut={() => setHoveredIndex(null)}
                        alignGuides={interaction.alignGuides}
                        flashOn={generation.flashOn}
                        showEmptyHighlight={generation.showEmptyHighlight}
                        onDragStart={interaction.handleDragStart}
                        onDragMove={interaction.handleDragMove}
                        onDragEnd={interaction.handleDragEnd}
                        onResizeStart={interaction.handleResizeStart}
                        onResizeMove={interaction.handleResizeMove}
                        onResizeEnd={interaction.handleResizeEnd}
                        onContextMenu={editing.openContextMenu}
                        onCanvasContextMenu={editing.openCanvasContextMenu}
                        createDraft={interaction.createDraft}
                        imageUris={generation.imageUris}
                        shownIndex={generation.shownIndex}
                        onView={generation.setViewIndex}
                        dataMissing={!refinedData}
                        isGenerating={generation.isGenerating}
                        isDownloading={generation.isDownloading}
                        showSaved={generation.showSaved}
                        generateError={generation.generateError}
                        onSave={generation.handleSave}
                        onGenerate={generation.handleGenerate}
                        onDownload={generation.handleDownload}
                        onShowPrompt={() => setShowPromptDialog(true)}
                    />
                </View>
            </View>

            {/* Right-click context menu: the element box's full menu, or the
                Paste-only menu after a right-click on empty canvas (index
                null). */}
            {editing.contextMenu && (
                <ContextMenu
                    menu={editing.contextMenu}
                    element={
                        editing.contextMenu.index === null
                            ? undefined
                            : elements[editing.contextMenu.index]
                    }
                    canPaste={editing.copiedElement !== null}
                    onClose={() => editing.setContextMenu(null)}
                    onCopy={editing.copyElement}
                    onPaste={editing.pasteElement}
                    onEditDesc={() => editing.openEditor('desc')}
                    onEditText={() => editing.openEditor('text')}
                    onDelete={editing.deleteElement}
                />
            )}

            {/* Element field editor dialog (desc or text). */}
            {editing.editing && (
                <EditDialog
                    editing={editing.editing}
                    element={elements[editing.editing.index]}
                    draft={editing.draft}
                    onDraftChange={editing.setDraft}
                    fontOpt={editing.fontOpt}
                    onFontOptChange={editing.setFontOpt}
                    sizeMenuOpen={editing.sizeMenuOpen}
                    onToggleSizeMenu={editing.setSizeMenuOpen}
                    onSave={editing.saveEdit}
                    onClose={() => editing.setEditing(null)}
                />
            )}

            {/* Red floating toast: download feedback (e.g. no image generated
                yet) and network/asset request failures; auto-dismisses 5s. */}
            <ErrorFloat message={generation.errorFloatMessage} />

            {/* Show Prompt dialog: original prompt (left, may be empty) vs. the refined structured JSON (right). */}
            {showPromptDialog && refinedData && (
                <PromptDialog original={rawPrompt} enhanced={JSON.stringify(refinedData, null, 2)} onClose={() => setShowPromptDialog(false)} />
            )}

            {/* Settings dialog (LLM + image generation endpoints/credentials) */}
            {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
            </SafeAreaView>
        </>
    );
}
