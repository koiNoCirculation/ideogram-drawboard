import { X } from 'lucide-react-native';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../../i18n';

/**
 * Read-only dialog showing the two prompt versions side by side:
 * the user's ORIGINAL prompt (left; empty when the design has no record of
 * one) and the LLM-refined STRUCTURED JSON prompt (right). Opened from the
 * "Show Prompt" button next to Download Image.
 */
export const PromptDialog = ({ original, enhanced, onClose }: {
    original: string;
    enhanced: string;
    onClose: () => void;
}) => {
    const { t } = useI18n();
    return (
        <View style={styles.backdrop} onPointerDown={onClose}>
            <View style={styles.card} onPointerDown={(e) => e.stopPropagation()}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>{t('showPrompt')}</Text>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose} testID="prompt-dialog-close">
                        <X size={18} color="#888" />
                    </TouchableOpacity>
                </View>
                <View style={styles.body}>
                    <View style={styles.pane}>
                        <Text style={styles.paneLabel}>{t('originalPrompt')}</Text>
                        <TextInput
                            style={styles.paneText}
                            value={original}
                            editable={false}
                            multiline
                            testID="prompt-original"
                        />
                    </View>
                    <View style={styles.pane}>
                        <Text style={styles.paneLabel}>{t('enhancedPrompt')}</Text>
                        <TextInput
                            style={styles.paneText}
                            value={enhanced}
                            editable={false}
                            multiline
                            testID="prompt-enhanced"
                        />
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        zIndex: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // A definite height (a percentage of the fixed backdrop), so the flex
    // panes below have a resolvable height to fill.
    card: {
        width: 920,
        maxWidth: '94%',
        height: '72%',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 20,
        zIndex: 100,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    closeButton: {
        padding: 4,
    },
    body: {
        flex: 1,
        flexDirection: 'row',
        gap: 12,
        minHeight: 0,
    },
    pane: {
        flex: 1,
        minHeight: 0,
    },
    paneLabel: {
        fontSize: 10,
        color: '#AAA',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    paneText: {
        flex: 1,
        minHeight: 0,
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        lineHeight: 18,
        color: '#333',
        textAlignVertical: 'top',
        backgroundColor: '#FAFAFA',
    },
});
