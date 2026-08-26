import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { useI18n } from '../../../i18n';

/**
 * Horizontal strip of generated-image thumbnails. Clicking a thumbnail views
 * that image on the canvas; the one currently shown gets a blue border.
 */
export const HistoryStrip = ({
    uris,
    shownIndex,
    onView,
}: {
    /** Resolved image URIs (null while resolving or when the IDB record is gone). */
    uris: (string | null)[];
    shownIndex: number;
    onView: (index: number) => void;
}) => {
    const { t } = useI18n();
    if (uris.length === 0) return null;
    return (
        <View style={styles.historyStrip}>
            <Text style={styles.historyLabel}>{`${t('generated')} (${uris.length})`}</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyRow}
            >
                {uris.map((uri, i) => (
                    <TouchableOpacity
                        key={`hist-${i}`}
                        onPress={() => onView(i)}
                        activeOpacity={0.8}
                        testID={`history-thumb-${i}`}
                    >
                        {uri ? (
                            <Image
                                source={{ uri }}
                                style={[styles.historyThumb, i === shownIndex && styles.historyThumbActive]}
                                resizeMode="cover"
                            />
                        ) : (
                            // IDB record not resolved yet (or gone): empty slot
                            // keeps the strip's layout and click targets stable.
                            <View style={[styles.historyThumb, styles.historyThumbMissing]} />
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};
