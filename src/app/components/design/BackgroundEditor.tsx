import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { useI18n } from '../../../i18n';

/**
 * The scene-shell (background) description shown under the metadata bar.
 * Clicking it opens an edit dialog prefilled with the current text; saving
 * calls onSave with the trimmed value (the caller records the undo step and
 * writes back into the prompt). Hidden when the design has no background.
 */
export const BackgroundEditor = ({ background, onSave }: {
    background?: string;
    onSave: (value: string) => void;
}) => {
    const { t } = useI18n();
    const [showDialog, setShowDialog] = useState(false);
    const [draft, setDraft] = useState('');
    if (!background) return null;
    const open = () => { setDraft(background); setShowDialog(true); };
    const save = () => {
        if (!draft.trim()) return;
        onSave(draft.trim());
        setShowDialog(false);
    };

    // Portaled to document.body: the component lives inside the canvas area's
    // subtree, whose stacking context would trap the fixed backdrop under
    // sibling UI (e.g. the toolbar) — same mechanism as the palette popover.
    const dialog = (
        <View style={styles.dialogBackdrop} onPointerDown={() => setShowDialog(false)}>
            <View style={styles.dialogCard} onPointerDown={(e) => e.stopPropagation()} testID="edit-background-dialog">
                <Text style={styles.dialogTitle}>{t('editBackground')}</Text>
                <TextInput
                    style={styles.dialogInput}
                    testID="background-input"
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    textAlignVertical="top"
                    selectTextOnFocus
                    autoFocus
                />
                <View style={styles.dialogActions}>
                    <TouchableOpacity
                        style={styles.dialogCancelButton}
                        onPress={() => setShowDialog(false)}
                        testID="background-cancel"
                    >
                        <Text style={styles.dialogCancelText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.dialogSaveButton, !draft.trim() && styles.dialogButtonDisabled]}
                        onPress={save}
                        disabled={!draft.trim()}
                        testID="background-save"
                    >
                        <Text style={styles.dialogSaveText}>{t('save')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    return (
        <>
            <TouchableOpacity style={styles.backgroundContainer} onPress={open} testID="edit-background">
                <Text style={styles.groupLabel}>{t('background')}</Text>
                <Text style={styles.backgroundText}>{background}</Text>
            </TouchableOpacity>
            {showDialog && (typeof document !== 'undefined'
                ? createPortal(dialog, document.body)
                : dialog)}
        </>
    );
};
