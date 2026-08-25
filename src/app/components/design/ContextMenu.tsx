import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { CanvasElement } from '../../types';

/**
 * Right-click context menu for an element box: a transparent full-viewport
 * catcher (closes the menu on any other click) plus the fixed-position menu
 * itself (Edit description, Edit text for text elements, Delete).
 */
export const ContextMenu = ({
    menu,
    element,
    onClose,
    onEditDesc,
    onEditText,
    onDelete,
}: {
    menu: { index: number; x: number; y: number };
    element?: CanvasElement;
    onClose: () => void;
    onEditDesc: () => void;
    onEditText: () => void;
    onDelete: () => void;
}) => {
    if (!element) return null;
    return (
        <>
            <View style={styles.menuBackdrop} onPointerDown={onClose} />
            <View style={[styles.contextMenu, { left: menu.x, top: menu.y }]}>
                <TouchableOpacity style={styles.contextMenuItem} onPress={onEditDesc}>
                    <Text style={styles.contextMenuItemText}>Edit description</Text>
                </TouchableOpacity>
                {element.type === 'text' && (
                    <TouchableOpacity style={styles.contextMenuItem} onPress={onEditText}>
                        <Text style={styles.contextMenuItemText}>Edit text</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.contextMenuDivider} />
                <TouchableOpacity style={styles.contextMenuItemDanger} onPress={onDelete}>
                    <Text style={styles.contextMenuItemTextDanger}>Delete</Text>
                </TouchableOpacity>
            </View>
        </>
    );
};
