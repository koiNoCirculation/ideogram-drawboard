import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { useI18n } from '../../../i18n';

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
}) => {
    const { t } = useI18n();
    return (
    <>
        <View style={styles.generateRow}>
            <TouchableOpacity
                style={[styles.saveButton, dataMissing && styles.saveButtonDisabled]}
                onPress={onSave}
                disabled={dataMissing}
                testID="save-button"
            >
                <Text style={styles.saveButtonText}>{t('save')}</Text>
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
                    <Text style={styles.generateButtonText}>{t('generate')}</Text>
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
                    <Text style={styles.generateButtonText}>{t('downloadImage')}</Text>
                )}
            </TouchableOpacity>
            {showSaved && <Text style={styles.savedText}>{t('saved')}</Text>}
        </View>
        {generateError && <Text style={styles.generateError}>{generateError}</Text>}
    </>
    );
};
