import { Check } from 'lucide-react-native';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { gridCellUnits, RULER_LEFT_WIDTH, RULER_TOP_HEIGHT } from '../../design/constants';
import { bboxToGeometry, AlignGuides } from '../../design/canvas';
import type { ElementTool } from '../../design/useCanvasInteraction';
import { CanvasElement, isEmptyElement } from '../../types';
import { useI18n } from '../../../i18n';
import { ElementBox } from '../ElementBox';
import type { Corner } from '../ElementBox';
import { CanvasRulers } from './CanvasRulers';
import { LayerList } from './LayerList';
import { HistoryStrip } from './HistoryStrip';
import { GenerateRow } from './GenerateRow';

/**
 * The canvas stage: the "Show grid" / "Show elements" toggles, the (scrollable
 * when zoomed) sizer holding the canvas with its generated image, grid overlay,
 * element boxes, center-alignment guides, hover tooltip and create-draft
 * rectangle, plus the tool hint and the history strip + Save/Generate row
 * beneath the canvas.
 */
export const CanvasStage = ({
    showGrid,
    showElements,
    onToggleGrid,
    onToggleElements,
    canvasZoom,
    displaySize,
    activeTool,
    onCanvasPointerDown,
    onSizerLayout,
    onToggleVisible,
    shownImage,
    elements,
    hoveredIndex,
    onHoverIn,
    onHoverOut,
    alignGuides,
    flashOn,
    showEmptyHighlight,
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onContextMenu,
    onCanvasContextMenu,
    createDraft,
    images,
    shownIndex,
    onView,
    dataMissing,
    isGenerating,
    isDownloading,
    showSaved,
    generateError,
    onSave,
    onGenerate,
    onDownload,
}: {
    showGrid: boolean;
    showElements: boolean;
    onToggleGrid: () => void;
    onToggleElements: () => void;
    canvasZoom: number;
    displaySize: { width: number; height: number };
    activeTool: ElementTool | null;
    onCanvasPointerDown: (e: any) => void;
    onSizerLayout: (e: any) => void;
    onToggleVisible: (index: number) => void;
    shownImage: string | null;
    elements: CanvasElement[];
    hoveredIndex: number | null;
    onHoverIn: (index: number) => void;
    onHoverOut: () => void;
    alignGuides: AlignGuides;
    flashOn: boolean;
    showEmptyHighlight: boolean;
    onDragStart: (index: number) => void;
    onDragMove: (dxPx: number, dyPx: number) => void;
    onDragEnd: () => void;
    onResizeStart: (index: number, corner: Corner) => void;
    onResizeMove: (dxPx: number, dyPx: number) => void;
    onResizeEnd: () => void;
    onContextMenu: (index: number, e: any) => void;
    /** Right-click on empty canvas (not an element box): the Paste-only menu. */
    onCanvasContextMenu: (e: any) => void;
    createDraft: { left: number; top: number; width: number; height: number } | null;
    images: string[];
    shownIndex: number;
    onView: (index: number) => void;
    dataMissing: boolean;
    isGenerating: boolean;
    isDownloading: boolean;
    showSaved: boolean;
    generateError: string | null;
    onSave: () => void;
    onGenerate: () => void;
    onDownload: () => void;
}) => {
    const { t } = useI18n();
    return (
    <View style={styles.canvasContainer}>
        {/* "Show grid" / "Show elements" toggles, pinned to the
            canvas area's top-right corner. */}
        <View style={styles.canvasToggles}>
            <TouchableOpacity
                testID="show-grid-toggle"
                style={[styles.showElementsToggle, { marginRight: 16 }]}
                onPress={onToggleGrid}
            >
                <View style={[styles.checkbox, showGrid && styles.checkboxChecked]}>
                    {showGrid && <Check size={11} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxLabel}>{t('showGrid')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                testID="show-elements-toggle"
                style={styles.showElementsToggle}
                onPress={onToggleElements}
            >
                <View style={[styles.checkbox, showElements && styles.checkboxChecked]}>
                    {showElements && <Check size={11} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxLabel}>{t('showElements')}</Text>
            </TouchableOpacity>
        </View>

        <View
            testID="canvas-sizer"
            style={[
                styles.canvasSizer,
                // Zoomed: the canvas overflows the area, so make it
                // scrollable (and top-left aligned — centering an overflowing
                // flex child clips its top/left).
                canvasZoom > 1 && {
                    overflow: 'scroll',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                },
            ]}
            onLayout={onSizerLayout}
        >
            {/* Canvas frame: the canvas plus the ruler strips extending
                OUTWARD above its top edge and left of its left edge (so the
                semi-transparent rulers never occlude canvas content). The
                frame — not the canvas — is what gets centered (auto margins)
                and scrolled in the sizer, so the rulers move with the canvas. */}
            <View
                style={{
                    position: 'relative',
                    width: displaySize.width + RULER_LEFT_WIDTH,
                    height: displaySize.height + RULER_TOP_HEIGHT,
                    // Auto margins center the frame on any axis that still
                    // fits while zoomed (and collapse to 0 on overflowing
                    // axes, keeping the whole canvas scrollable).
                    margin: 'auto',
                }}
            >
            <View
                testID="design-canvas"
                style={[
                    styles.canvas,
                    {
                        position: 'absolute',
                        top: RULER_TOP_HEIGHT,
                        left: RULER_LEFT_WIDTH,
                        width: displaySize.width,
                        height: displaySize.height,
                    },
                    // Web: crosshair while a creation tool is armed.
                    (activeTool ? { cursor: 'crosshair' } : {}) as any,
                ]}
                onPointerDown={onCanvasPointerDown}
                // Right-click on empty canvas: the Paste-only menu. Element
                // boxes stopPropagation, so a box right-click only opens the
                // element's full menu.
                {...({ onContextMenu: onCanvasContextMenu } as Record<string, any>)}
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

                {/* Grid overlay: follows the zoom level; pixel cell size is
                    derived per axis, so the cell aspect follows the canvas
                    aspect. */}
                {displaySize.width > 0 && showGrid && (
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            // High-contrast lines (near-black at 45%) so the
                            // grid stays visible on white and on photos alike.
                            backgroundImage: `repeating-linear-gradient(to right, rgba(0, 0, 0, 0.45) 0, rgba(0, 0, 0, 0.45) 1px, transparent 1px, transparent ${(gridCellUnits(canvasZoom) / 1000) * displaySize.width}px), repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.45) 0, rgba(0, 0, 0, 0.45) 1px, transparent 1px, transparent ${(gridCellUnits(canvasZoom) / 1000) * displaySize.height}px)`,
                        } as any}
                    />
                )}

                {elements.length > 0 ? (
                    <>
                        {/* Element layer (hidden while "Show elements" is off):
                            pointer-transparent while a creation tool is active
                            so drags start new elements. */}
                        <View
                            style={[styles.elementLayer, !showElements && { display: 'none' }]}
                            pointerEvents={activeTool ? 'none' : undefined}
                        >
                            {elements.map((element, index) => {
                                // Hidden via the layer list's eye toggle: no
                                // box (data untouched — re-showing restores it).
                                if (!element.bbox || element.visible === false) return null;
                                const geo = bboxToGeometry(element.bbox, displaySize);
                                return (
                                    <ElementBox
                                        key={`el-${index}`}
                                        element={element}
                                        {...geo}
                                        hovered={hoveredIndex === index}
                                        onHoverIn={() => onHoverIn(index)}
                                        onHoverOut={onHoverOut}
                                        onDragStart={() => onDragStart(index)}
                                        onDragMove={onDragMove}
                                        onDragEnd={onDragEnd}
                                        onResizeStart={(corner) => onResizeStart(index, corner)}
                                        onResizeMove={onResizeMove}
                                        onResizeEnd={onResizeEnd}
                                        onContextMenu={(e) => {
                                            // Consume the box's right-click so it doesn't
                                            // bubble to the canvas's Paste-only menu.
                                            e?.stopPropagation?.();
                                            e?.nativeEvent?.stopPropagation?.();
                                            onContextMenu(index, e);
                                        }}
                                        empty={showEmptyHighlight && isEmptyElement(element)}
                                        flashOn={flashOn}
                                        highlighted={
                                            alignGuides.v?.index === index ||
                                            alignGuides.h?.index === index
                                        }
                                    />
                                );
                            })}
                        </View>

                        {/* Center-alignment guides while dragging:
                            the nearest other element's center lines. */}
                        {alignGuides.v && (
                            <View
                                pointerEvents="none"
                                style={{
                                    position: 'absolute',
                                    left: (alignGuides.v.x / 1000) * displaySize.width,
                                    top: 0,
                                    width: 1,
                                    height: displaySize.height,
                                    backgroundColor: 'rgba(255, 59, 48, 0.9)',
                                }}
                            />
                        )}
                        {alignGuides.h && (
                            <View
                                pointerEvents="none"
                                style={{
                                    position: 'absolute',
                                    top: (alignGuides.h.y / 1000) * displaySize.height,
                                    left: 0,
                                    height: 1,
                                    width: displaySize.width,
                                    backgroundColor: 'rgba(255, 59, 48, 0.9)',
                                }}
                            />
                        )}

                        {/* Floating tooltip for the hovered text element */}
                        {(() => {
                            if (hoveredIndex === null || !showElements) return null;
                            const element = elements[hoveredIndex];
                            if (!element || element.type !== 'text' || !element.bbox) return null;
                            const geo = bboxToGeometry(element.bbox, displaySize);
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
                    <Text style={styles.canvasPlaceholderText}>{t('canvasArea')}</Text>
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

            {/* Rulers on the top/left edges (0-1000 on both axes);
                they scale with the canvas and line up with the grid. */}
            {displaySize.width > 0 && (
                <CanvasRulers width={displaySize.width} height={displaySize.height} zoom={canvasZoom} />
            )}
            </View>
        </View>

        {/* Layer list (Photoshop-style): eye toggle + type icon + label per
            element, docked at the canvas area's bottom-right corner. */}
        <LayerList elements={elements} onToggleVisible={onToggleVisible} />

        {/* Creation tool hint */}
        {activeTool && (
            <Text style={styles.toolHint}>
                {activeTool === 'text' ? t('toolHintText') : t('toolHintObj')}
            </Text>
        )}

        {/* History of generated images: click a thumbnail to view it
            on the canvas (the latest is shown by default). */}
        <HistoryStrip images={images} shownIndex={shownIndex} onView={onView} />

        {/* Save + Generate buttons */}
        <GenerateRow
            dataMissing={dataMissing}
            isGenerating={isGenerating}
            isDownloading={isDownloading}
            showSaved={showSaved}
            generateError={generateError}
            onSave={onSave}
            onGenerate={onGenerate}
            onDownload={onDownload}
        />
    </View>
    );
};
