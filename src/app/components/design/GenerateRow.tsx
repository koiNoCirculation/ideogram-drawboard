import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';

/** Save + Generate + Download Image buttons (with the "Saved ✓" confirmation) and the error line. */
export const GenerateRow = ({
    dataMissing,
    isGenerating,
    isDownloading,
    showSaved,
    generateError,
    onSave,
    onGenerate,
    onDownload,
}: {
    /** True when there is no refinedData — Save/Generate/Download are disabled. */
    dataMissing: boolean;
    isGenerating: boolean;
    isDownloading: boolean;
    showSaved: boolean;
    generateError: string | null;
    onSave: () => void;
    onGenerate: () => void;
    onDownload: () => void;
}) => (
    <>
        <View style={styles.generateRow}>
            <TouchableOpacity
                style={[styles.saveButton, dataMissing && styles.saveButtonDisabled]}
                onPress={onSave}
                disabled={dataMissing}
                testID="save-button"
            >
                <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.generateButton, dataMissing && styles.generateButtonDisabled]}
                onPress={onGenerate}
                disabled={dataMissing || isGenerating}
                testID="generate-button"
            >
                {isGenerating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <Text style={styles.generateButtonText}>Generate</Text>
                )}
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.generateButton, styles.downloadButton, dataMissing && styles.generateButtonDisabled]}
                onPress={onDownload}
                disabled={dataMissing || isDownloading}
                testID="download-image-button"
            >
                {isDownloading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <Text style={styles.generateButtonText}>Download Image</Text>
                )}
            </TouchableOpacity>
            {showSaved && <Text style={styles.savedText}>Saved ✓</Text>}
        </View>
        {generateError && <Text style={styles.generateError}>{generateError}</Text>}
    </>
);
