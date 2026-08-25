import { Eye, EyeOff, Image as ImageIcon } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import { CanvasElement } from '../../types';
import { styles } from '../../design/designStyles';
import { elementIconStyles } from '../ElementBox';

/** Rows the panel shows before it switches to a scrollbar. */
const LAYER_MAX_ROWS = 8;
/** Row height in px (also drives the panel's max height). */
const LAYER_ROW_HEIGHT = 34;
/** Panel vertical padding in px (must match styles.layerPanel.paddingVertical). */
const LAYER_PANEL_PADDING = 8;
/** Label length before it is cut off and ellipsized. */
const LAYER_LABEL_MAX_CHARS = 30;

/** Truncate a layer label to 30 chars, ellipsizing the overflow. */
const truncate = (s: string): string =>
    s.length > LAYER_LABEL_MAX_CHARS ? s.slice(0, LAYER_LABEL_MAX_CHARS) + '…' : s;

/**
 * Photoshop-style layer list, docked at the canvas area's bottom-right corner.
 * One row per prompt element: a checkbox-styled eye (visibility toggle, on by
 * default), the same type icon the canvas uses (orange "T" / blue image), and
 * the element's desc (obj) or text (text), cut at 30 chars. Shows at most 8
 * rows — more than that scrolls. Props-driven, no own state.
 */
export const LayerList = ({
    elements,
    onToggleVisible,
}: {
    elements: CanvasElement[];
    onToggleVisible: (index: number) => void;
}) => {
    if (elements.length === 0) return null;
    return (
        <View
            testID="layer-list"
            style={[
                styles.layerPanel,
                { maxHeight: LAYER_MAX_ROWS * LAYER_ROW_HEIGHT + LAYER_PANEL_PADDING * 2 },
                // Web: vertical scrollbar only (no horizontal track when few rows).
                { overflowY: 'auto', overflowX: 'hidden' } as any,
            ]}
        >
            {elements.map((element, index) => {
                const isText = element.type === 'text';
                const hidden = element.visible === false;
                const label = truncate((isText ? element.text : element.desc) ?? '');
                return (
                    <View
                        key={`layer-${index}`}
                        style={[styles.layerRow, { height: LAYER_ROW_HEIGHT }, index < elements.length - 1 && styles.layerRowDivider]}
                    >
                        {/* Checkbox-styled eye: blue when the layer is visible. */}
                        <TouchableOpacity
                            testID={`layer-eye-${index}`}
                            activeOpacity={0.7}
                            onPress={() => onToggleVisible(index)}
                            style={[styles.checkbox, !hidden && styles.checkboxChecked]}
                        >
                            {hidden
                                ? <EyeOff size={11} color="#999" />
                                : <Eye size={11} color="#FFFFFF" />}
                        </TouchableOpacity>

                        {/* Same type icon as the canvas box's corner badge. */}
                        <View
                            style={[
                                elementIconStyles.base,
                                { position: 'relative', top: 0, left: 0, marginLeft: 8 },
                                isText ? elementIconStyles.text : elementIconStyles.obj,
                            ]}
                        >
                            {isText ? (
                                <Text style={elementIconStyles.char}>T</Text>
                            ) : (
                                <ImageIcon size={14} color="#FFFFFF" />
                            )}
                        </View>

                        <Text
                            testID={`layer-label-${index}`}
                            numberOfLines={1}
                            style={styles.layerLabel}
                        >
                            {label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};
