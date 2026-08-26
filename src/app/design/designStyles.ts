import { StyleSheet } from 'react-native';
import { RULER_LEFT_WIDTH, RULER_TOP_HEIGHT } from './constants';

export const styles = StyleSheet.create({
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
    toolButtonGap: {
        marginTop: 20,
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
    // Settings gear in the header's top-right corner (matches toolbar icon size).
    settingsButton: {
        padding: 10,
        marginLeft: 12,
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
    // "Show grid" / "Show elements" checkboxes, pinned to the canvas area's
    // top-right corner.
    canvasToggles: {
        position: 'absolute',
        top: 8,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 5,
    },
    showElementsToggle: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: 16,
        height: 16,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#999',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },
    checkboxChecked: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    checkboxLabel: {
        fontSize: 12,
        color: '#555',
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
    // Canvas rulers: strips along the top and left edges, 0-1000 on both
    // axes. They extend OUTWARD from the canvas (above the top edge, left of
    // the left edge) inside the canvas frame, so the semi-transparent strips
    // never cover canvas content. Pointer-transparent.
    rulerTop: {
        position: 'absolute',
        top: 0,
        left: RULER_LEFT_WIDTH,
        height: RULER_TOP_HEIGHT,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderBottomWidth: 1,
        borderBottomColor: '#007AFF',
        zIndex: 10,
    },
    rulerLeft: {
        position: 'absolute',
        top: RULER_TOP_HEIGHT,
        left: 0,
        width: RULER_LEFT_WIDTH,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRightWidth: 1,
        borderRightColor: '#007AFF',
        zIndex: 9,
    },
    // Major tick (at a numbered position): long on the edge it hangs from.
    rulerMajorH: {
        position: 'absolute',
        top: 0,
        width: 1,
        height: 8,
        backgroundColor: '#333333',
    },
    rulerMajorV: {
        position: 'absolute',
        left: 0,
        width: 8,
        height: 1,
        backgroundColor: '#333333',
    },
    // Number boxes: fixed size, clamped to stay inside the ruler strip.
    rulerLabelH: {
        position: 'absolute',
        top: 8,
        height: 12,
        width: 24,
    },
    rulerLabelV: {
        position: 'absolute',
        left: 9,
        width: 20,
        height: 12,
    },
    rulerLabelText: {
        fontSize: 9,
        color: '#333333',
        textAlign: 'center',
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
    // Download Image, shown to the right of Generate: same gap as Save→Generate
    // (saveButton's marginRight: 12).
    downloadButton: {
        marginLeft: 12,
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
    // Transient red floating toast (viewport top-center, below the Stack
    // header) for download failures; auto-dismisses after 5s.
    downloadErrorToast: {
        position: 'fixed',
        top: 76,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 100,
    },
    downloadErrorToastBox: {
        backgroundColor: '#E53935',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    downloadErrorText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
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
    // Inert menu item (e.g. Paste with an empty clipboard).
    contextMenuItemDisabled: {
        opacity: 0.4,
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
    // Font options in the text edit dialog.
    fontOptions: {
        marginTop: 12,
    },
    fontField: {
        marginBottom: 12,
    },
    fontLabel: {
        fontSize: 10,
        color: '#AAA',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    sizeCombo: {
        flexDirection: 'row',
        alignItems: 'center',
        borderColor: '#DDD',
        borderWidth: 1,
        borderRadius: 6,
        backgroundColor: '#FAFAFA',
    },
    sizeInput: {
        flex: 1,
        padding: 9,
        fontSize: 14,
        color: '#333',
    },
    sizeChevron: {
        padding: 10,
    },
    sizeList: {
        borderColor: '#DDD',
        borderTopWidth: 0,
        borderWidth: 1,
        borderRadius: 6,
        marginTop: -4,
        backgroundColor: '#FFFFFF',
    },
    sizeOption: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    sizeOptionText: {
        fontSize: 14,
        color: '#333',
    },
    fontToggles: {
        flexDirection: 'row',
        marginTop: 2,
    },
    fontToggle: {
        width: 36,
        height: 32,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    fontToggleActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    fontToggleText: {
        fontSize: 14,
        color: '#333',
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
    // Layer list (Photoshop-style), docked at the canvas area's bottom-right
    // corner: eye toggle + type icon + 30-char label per element, max 8 rows
    // then a vertical scrollbar.
    layerPanel: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 280,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        paddingVertical: 8,
        zIndex: 20,
        overflow: 'scroll',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    layerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    layerRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    layerLabel: {
        flex: 1,
        marginLeft: 8,
        fontSize: 12,
        color: '#333',
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
