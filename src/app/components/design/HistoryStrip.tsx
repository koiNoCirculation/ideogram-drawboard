import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { useI18n } from '../../../i18n';

/**
 * Horizontal strip of generated-image thumbnails. Clicking a thumbnail views
 * that image on the canvas; the one currently shown gets a blue border.
 */
export const HistoryStrip = ({
    images,
    shownIndex,
    onView,
}: {
    images: string[];
    shownIndex: number;
    onView: (index: number) => void;
}) => {
    const { t } = useI18n();
    if (images.length === 0) return null;
    return (
        <View style={styles.historyStrip}>
            <Text style={styles.historyLabel}>{`${t('generated')} (${images.length})`}</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyRow}
            >
                {images.map((url, i) => (
                    <TouchableOpacity
                        key={`hist-${i}`}
                        onPress={() => onView(i)}
                        activeOpacity={0.8}
                        testID={`history-thumb-${i}`}
                    >
                        <Image
                            source={{ uri: url }}
                            style={[styles.historyThumb, i === shownIndex && styles.historyThumbActive]}
                            resizeMode="cover"
                        />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};
