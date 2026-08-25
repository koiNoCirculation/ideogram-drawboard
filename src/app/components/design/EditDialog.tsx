import { ChevronDown } from 'lucide-react-native';
import { Dispatch, SetStateAction } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { FONT_CHOICES, FONT_SIZE_PRESETS } from '../../design/constants';
import type { FontOpt } from '../../design/useElementEditing';
import { CanvasElement } from '../../types';
import { SelectField } from '../SettingsDialog';

/**
 * Element field editor dialog (desc or text). Text elements additionally offer
 * font options (size preset dropdown + manual integer entry, font, bold/italic)
 * applied on save; absent/defaults keep the plain canvas look.
 */
export const EditDialog = ({
    editing,
    element,
    draft,
    onDraftChange,
    fontOpt,
    onFontOptChange,
    sizeMenuOpen,
    onToggleSizeMenu,
    onSave,
    onClose,
}: {
    editing: { index: number; field: 'desc' | 'text' };
    element?: CanvasElement;
    draft: string;
    onDraftChange: (value: string) => void;
    fontOpt: FontOpt;
    onFontOptChange: Dispatch<SetStateAction<FontOpt>>;
    sizeMenuOpen: boolean;
    onToggleSizeMenu: (updater: (open: boolean) => boolean) => void;
    onSave: () => void;
    onClose: () => void;
}) => {
    if (!element) return null;
    const isDesc = editing.field === 'desc';
    return (
        <View style={styles.dialogBackdrop} onPointerDown={onClose}>
            <View style={styles.dialogCard} onPointerDown={(e) => e.stopPropagation()}>
                <Text style={styles.dialogTitle}>{isDesc ? 'Edit description' : 'Edit text'}</Text>
                <TextInput
                    style={styles.dialogInput}
                    value={draft}
                    onChangeText={onDraftChange}
                    multiline
                    textAlignVertical="top"
                    selectTextOnFocus
                    autoFocus
                />

                {/* Font options — text elements only. Applied on
                    save; absent/defaults keep the plain look. */}
                {!isDesc && (
                    <View style={styles.fontOptions}>
                        <View style={styles.fontField}>
                            <Text style={styles.fontLabel}>Font size (px)</Text>
                            <View style={styles.sizeCombo}>
                                <TextInput
                                    testID="font-size-input"
                                    style={styles.sizeInput}
                                    value={fontOpt.size}
                                    onChangeText={(v) => onFontOptChange((p) => ({ ...p, size: v.replace(/[^0-9]/g, '') }))}
                                    keyboardType="numeric"
                                    selectTextOnFocus
                                />
                                <TouchableOpacity
                                    testID="font-size-menu"
                                    style={styles.sizeChevron}
                                    onPress={() => onToggleSizeMenu((o) => !o)}
                                >
                                    <ChevronDown
                                        size={14}
                                        color="#888"
                                        style={{ transform: [{ rotate: sizeMenuOpen ? '180deg' : '0deg' }] } as any}
                                    />
                                </TouchableOpacity>
                            </View>
                            {sizeMenuOpen && (
                                <View style={styles.sizeList}>
                                    {FONT_SIZE_PRESETS.map((s) => (
                                        <TouchableOpacity
                                            key={s}
                                            testID={`font-size-${s}`}
                                            style={styles.sizeOption}
                                            onPress={() => {
                                                onFontOptChange((p) => ({ ...p, size: String(s) }));
                                                onToggleSizeMenu(() => false);
                                            }}
                                        >
                                            <Text style={styles.sizeOptionText}>{s}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                        <SelectField
                            id="font-choice"
                            label="Font"
                            value={fontOpt.font === '' ? 'Default' : fontOpt.font}
                            options={['Default', ...FONT_CHOICES]}
                            onChange={(v) => onFontOptChange((p) => ({ ...p, font: v === 'Default' ? '' : v }))}
                        />
                        <View style={styles.fontToggles}>
                            <TouchableOpacity
                                testID="font-bold"
                                style={[styles.fontToggle, fontOpt.bold && styles.fontToggleActive]}
                                onPress={() => onFontOptChange((p) => ({ ...p, bold: !p.bold }))}
                            >
                                <Text style={[styles.fontToggleText, { fontWeight: '700' }, fontOpt.bold && { color: '#FFFFFF' }]}>B</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID="font-italic"
                                style={[styles.fontToggle, fontOpt.italic && styles.fontToggleActive]}
                                onPress={() => onFontOptChange((p) => ({ ...p, italic: !p.italic }))}
                            >
                                <Text style={[styles.fontToggleText, { fontStyle: 'italic' }, fontOpt.italic && { color: '#FFFFFF' }]}>I</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.dialogActions}>
                    <TouchableOpacity style={styles.dialogCancelButton} onPress={onClose}>
                        <Text style={styles.dialogCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.dialogSaveButton, !draft.trim() && styles.dialogButtonDisabled]}
                        onPress={onSave}
                        disabled={!draft.trim()}
                    >
                        <Text style={styles.dialogSaveText}>Save</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};
