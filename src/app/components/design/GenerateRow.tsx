import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';

/** Save + Generate buttons (with the "Saved ✓" confirmation) and the error line. */
export const GenerateRow = ({
    dataMissing,
    isGenerating,
    showSaved,
    generateError,
    onSave,
    onGenerate,
}: {
    /** True when there is no refinedData — Save/Generate are disabled. */
    dataMissing: boolean;
    isGenerating: boolean;
    showSaved: boolean;
    generateError: string | null;
    onSave: () => void;
    onGenerate: () => void;
}) => (
    <>
        <View style={styles.generateRow}>
            <TouchableOpacity
                style={[styles.saveButton, dataMissing && styles.saveButtonDisabled]}
                onPress={onSave}
                disabled={dataMissing}
            >
                <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.generateButton, dataMissing && styles.generateButtonDisabled]}
                onPress={onGenerate}
                disabled={dataMissing || isGenerating}
            >
                {isGenerating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <Text style={styles.generateButtonText}>Generate</Text>
                )}
            </TouchableOpacity>
            {showSaved && <Text style={styles.savedText}>Saved ✓</Text>}
        </View>
        {generateError && <Text style={styles.generateError}>{generateError}</Text>}
    </>
);
