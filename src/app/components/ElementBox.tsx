import { Image as ImageIcon } from 'lucide-react-native';
import { RefObject, useRef } from 'react';
import { PanResponder, StyleSheet, Text, TextStyle, View } from 'react-native';
import { CanvasElement } from '../types';

/** Which corner of the box a resize gesture started from. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Minimum element size in normalized (0-1000) units, so corners can't cross. */
export const MIN_ELEMENT_SIZE = 20;

/**
 * Canvas style for a text element's user-set font options (extra_fontoption);
 * undefined when the element keeps the default look.
 */
function textFontStyle(element: CanvasElement): TextStyle | undefined {
    const fo = element.extra_fontoption;
    if (!fo) return undefined;
    return {
        fontSize: fo.size,
        fontFamily: fo.font || undefined,
        fontWeight: fo.bold ? '700' : undefined,
        fontStyle: fo.italic ? 'italic' : undefined,
    };
}

/**
 * A component to render a single parsed element (obj or text) on the canvas,
 * positioned by its normalized (0-1000) bounding box. Draggable: reports pixel
 * deltas to the parent, which updates the bbox in the JSON prompt.
 */
export const ElementBox = ({
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
    empty,
    flashOn,
    highlighted,
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
    /** True while this empty element should be flagged red (blocked generate). */
    empty?: boolean;
    /** Current phase of the red blink (only meaningful while `empty`). */
    flashOn?: boolean;
    /** True while a dragged element aligns with this element's center line. */
    highlighted?: boolean;
}) => {
    const isText = element.type === 'text';

    // Shrink the move surface away from the edges so drags starting near a
    // corner go to the resize handles instead of moving the element.
    const moveInset = Math.min(14, Math.max(0, Math.floor(Math.min(width, height) / 4)));

    // Which resize zone (if any) the latest pointerdown started on. RN-web
    // negotiates the responder from each MOVE event's DOM target, so a handle
    // must only claim gestures that BEGAN on its zone — otherwise a move-drag
    // that sweeps through the corner would be stolen by the handle mid-gesture.
    const zonePressRef = useRef<Corner | null>(null);

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
            // Small slop so taps/hovers are unaffected. Kept at 3px (larger
            // than the resize zones' 2px) so the move is always granted at
            // the 6px trigger step: RN-web's PanResponder resets the gesture
            // delta on grant, so granting one step earlier would shift every
            // drag's effective delta by 3px. A press that starts inside the
            // 10.5px dead band next to a corner simply no-ops (as before
            // this feature) instead of being stolen by the enlarged zone —
            // the zone only claims gestures that began on it (zonePressRef).
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
                highlighted && styles.elementBoxHighlighted,
                empty && styles.elementBoxEmpty,
                empty && flashOn && styles.elementBoxEmptyFlash,
            ]}
            onPointerEnter={onHoverIn}
            onPointerLeave={onHoverOut}
            // Any press inside the box clears the zone claim; a press that
            // starts on a resize zone re-sets it (the zone stops propagation).
            onPointerDown={() => { zonePressRef.current = null; }}
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
                <Text style={[styles.elementTextContent, textFontStyle(element)]}>{element.text}</Text>
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
                    zonePressRef={zonePressRef}
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
    zonePressRef,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
}: {
    corner: Corner;
    zonePressRef: RefObject<Corner | null>;
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
                // Claim only a gesture that started on this zone (see
                // zonePressRef in ElementBox).
                zonePressRef.current === corner &&
                (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
            onPanResponderGrant: () => startRef.current(),
            onPanResponderMove: (_e, g) => moveRef.current(g.dx, g.dy),
            onPanResponderRelease: () => endRef.current(),
            onPanResponderTerminate: () => endRef.current(),
        })
    ).current;

    return (
        // The hit area is an explicit 21x21 transparent square (1.5x the
        // 14x14 visible handle): RN-web hit-tests with the browser and ignores
        // hitSlop on plain Views (only Touchables expand their press region),
        // so without this only the 14x14 alone would grab a resize. hitSlop is
        // kept for native, where the responder system does honor it.
        <View
            style={[styles.resizeHit, styles[`resizeHit_${corner}`]]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPointerDown={(e: any) => {
                // Record that the press began on this zone, and keep the
                // box's reset handler (bubbling) from clearing it. Safe to
                // stop: the responder system listens to mousedown, not
                // pointerdown.
                e?.stopPropagation?.();
                zonePressRef.current = corner;
            }}
            {...panResponder.panHandlers}
        >
            <View style={styles.resizeHandle} />
        </View>
    );
};

const styles = StyleSheet.create({
    elementBox: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: '#007AFF',
        borderStyle: 'dashed',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        // The box is a UI label, not selectable text. If a drag (resize/move)
        // sweeps the pointer across the label, the browser would start a
        // native text selection; the resulting `selectionchange` makes
        // RN-web's responder system terminate the gesture mid-drag, silently
        // freezing the resize.
        userSelect: 'none',
    },
    elementBoxHovered: {
        backgroundColor: '#FFFFFF',
    },
    // Alignment-highlighted element (its center line is guiding a drag).
    elementBoxHighlighted: {
        borderColor: '#FF3B30',
        borderWidth: 2,
    },
    // Empty-element warning: solid red border (shown after a blocked generate).
    elementBoxEmpty: {
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#FF3B30',
        backgroundColor: 'rgba(255, 59, 48, 0.10)',
    },
    // Bright phase of the blink (the dim phase is elementBoxEmpty).
    elementBoxEmptyFlash: {
        backgroundColor: 'rgba(255, 59, 48, 0.28)',
        shadowColor: '#FF3B30',
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 6,
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
        userSelect: 'none',
    },
    elementDescText: {
        fontSize: 11,
        color: '#666',
        textAlign: 'center',
        userSelect: 'none',
    },
    elementMoveArea: {
        position: 'absolute',
    },
    // Invisible hit target, centered on the corner: 21x21 (1.5x the visible
    // 14x14 handle) so a near-miss still grabs the resize.
    resizeHit: {
        position: 'absolute',
        width: 21,
        height: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resizeHit_nw: { top: -10.5, left: -10.5 },
    resizeHit_ne: { top: -10.5, right: -10.5 },
    resizeHit_sw: { bottom: -10.5, left: -10.5 },
    resizeHit_se: { bottom: -10.5, right: -10.5 },
    resizeHandle: {
        width: 14,
        height: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 3,
    },
});

/**
 * The corner icon look (orange "T" for text, blue image icon for obj),
 * exported so the layer list can show the same icon per element type.
 */
export const elementIconStyles = {
    base: styles.elementIcon,
    text: styles.elementIconText,
    obj: styles.elementIconObj,
    char: styles.elementIconChar,
};
