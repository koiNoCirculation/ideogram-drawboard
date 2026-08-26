import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { useI18n } from '../../../i18n';
import { CanvasElement } from '../../types';

/**
 * Right-click context menu: a transparent full-viewport catcher (closes the
 * menu on any other click) plus the fixed-position menu itself. For an element
 * box: Copy, Paste, Edit description, Edit text (text elements), Delete.
 * For a right-click on empty canvas (element === undefined): Paste only.
 * Paste is greyed out (and inert) while the in-app clipboard is empty.
 */
export const ContextMenu = ({
    menu,
    element,
    canPaste,
    onClose,
    onCopy,
    onPaste,
    onEditDesc,
    onEditText,
    onDelete,
}: {
    menu: { index: number | null; x: number; y: number };
    element?: CanvasElement;
    canPaste: boolean;
    onClose: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onEditDesc: () => void;
    onEditText: () => void;
    onDelete: () => void;
}) => {
    const isCanvasMenu = !element;
    const { t } = useI18n();
    return (
        <>
            <View style={styles.menuBackdrop} onPointerDown={onClose} />
            <View style={[styles.contextMenu, { left: menu.x, top: menu.y }]}>
                {!isCanvasMenu && (
                    <TouchableOpacity style={styles.contextMenuItem} onPress={onCopy}>
                        <Text style={styles.contextMenuItemText}>{t('copy')}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.contextMenuItem, !canPaste && styles.contextMenuItemDisabled]}
                    onPress={canPaste ? onPaste : undefined}
                >
                    <Text style={styles.contextMenuItemText}>{t('paste')}</Text>
                </TouchableOpacity>
                {!isCanvasMenu && (
                    <>
                        <View style={styles.contextMenuDivider} />
                        <TouchableOpacity style={styles.contextMenuItem} onPress={onEditDesc}>
                            <Text style={styles.contextMenuItemText}>{t('editDescription')}</Text>
                        </TouchableOpacity>
                        {element.type === 'text' && (
                            <TouchableOpacity style={styles.contextMenuItem} onPress={onEditText}>
                                <Text style={styles.contextMenuItemText}>{t('editText')}</Text>
                            </TouchableOpacity>
                        )}
                        <View style={styles.contextMenuDivider} />
                        <TouchableOpacity style={styles.contextMenuItemDanger} onPress={onDelete}>
                            <Text style={styles.contextMenuItemTextDanger}>{t('delete')}</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </>
    );
};
