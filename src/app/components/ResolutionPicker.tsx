import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../i18n';
import { OFFICIAL_RATIO_GROUPS, PRESET_RATIOS } from '../services/resolutions';

/** A ratio/resolution pill (shared by both provider modes). */
function Pill({ label, active, testID, onPress }: {
    label: string;
    active: boolean;
    testID: string;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[styles.pill, active && styles.pillActive]}
            onPress={onPress}
            testID={testID}
        >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

/**
 * The home page's aspect-ratio + size picker — provider dependent:
 * - "Official" image provider: TWO rows of pills, no W/H inputs. Row 1 = the
 *   aspect-ratio groups of the fixed official resolution list; row 2 = the
 *   resolutions under the selected ratio (selecting one fixes the exact W/H).
 * - "Custom": the preset ratio pills + a "custom" pill (existing logic) and
 *   the free W/H inputs (typing one recomputes the other from the active
 *   preset ratio; independent when "custom" is selected).
 *
 * Fully controlled: the page owns selectedRatio/width/height and passes the
 * setters back down as callbacks.
 */
export function ResolutionPicker({ official, selectedRatio, width, height,
    onSelectRatio, onResolutionSelect, onWidthChange, onHeightChange }: {
    official: boolean;
    selectedRatio: string;
    width: string;
    height: string;
    onSelectRatio: (ratio: string) => void;
    onResolutionSelect: (w: number, h: number) => void;
    onWidthChange: (value: string) => void;
    onHeightChange: (value: string) => void;
}) {
    const { t } = useI18n();

    // Custom mode: typing one dimension recomputes the other from the active
    // preset ratio ("custom" = no linkage).
    const linkedWidthChange = (val: string) => {
        const cleanVal = val.replace(/[^0-9]/g, '');
        onWidthChange(cleanVal);
        if (selectedRatio !== 'custom') {
            const [rw, rh] = selectedRatio.split(':').map(Number);
            const wNum = parseInt(cleanVal, 10) || 0;
            if (wNum > 0) onHeightChange(Math.round(wNum * (rh / rw)).toString());
        }
    };
    const linkedHeightChange = (val: string) => {
        const cleanVal = val.replace(/[^0-9]/g, '');
        onHeightChange(cleanVal);
        if (selectedRatio !== 'custom') {
            const [rw, rh] = selectedRatio.split(':').map(Number);
            const hNum = parseInt(cleanVal, 10) || 0;
            if (hNum > 0) onWidthChange(Math.round(hNum * (rw / rh)).toString());
        }
    };

    if (official) {
        const group = OFFICIAL_RATIO_GROUPS.find((g) => g.ratio === selectedRatio);
        return (
            <>
                {/* Row 1: aspect-ratio groups of the official list. */}
                <View style={styles.ratioRow}>
                    {OFFICIAL_RATIO_GROUPS.map((g) => (
                        <Pill
                            key={g.ratio}
                            label={g.ratio}
                            testID={`official-ratio-${g.ratio}`}
                            active={g.ratio === selectedRatio}
                            onPress={() => onSelectRatio(g.ratio)}
                        />
                    ))}
                </View>
                {/* Row 2: the official resolutions under the selected ratio. */}
                <View style={styles.resolutionRow}>
                    {(group?.resolutions ?? []).map((r) => (
                        <Pill
                            key={`${r.w}x${r.h}`}
                            label={`${r.w}x${r.h}`}
                            testID={`official-resolution-${r.w}x${r.h}`}
                            active={r.w === parseInt(width, 10) && r.h === parseInt(height, 10)}
                            onPress={() => onResolutionSelect(r.w, r.h)}
                        />
                    ))}
                </View>
            </>
        );
    }

    return (
        <>
            <View style={styles.ratioRow} testID="preset-ratio-row">
                {PRESET_RATIOS.map((ratio) => (
                    <Pill
                        key={ratio}
                        label={ratio}
                        testID={`ratio-${ratio}`}
                        active={ratio === selectedRatio}
                        onPress={() => onSelectRatio(ratio)}
                    />
                ))}
                <Pill
                    label={t('customRatio')}
                    testID="ratio-custom"
                    active={selectedRatio === 'custom'}
                    onPress={() => onSelectRatio('custom')}
                />
            </View>
            <View style={styles.dimensionRow}>
                <View style={styles.dimensionGroup}>
                    <Text style={styles.dimensionLabel}>{t('widthLabel')}</Text>
                    <TextInput
                        style={styles.dimInput}
                        keyboardType="numeric"
                        value={width}
                        onChangeText={linkedWidthChange}
                        testID="width-input"
                    />
                </View>
                <View style={styles.dimensionGroup}>
                    <Text style={styles.dimensionLabel}>{t('heightLabel')}</Text>
                    <TextInput
                        style={styles.dimInput}
                        keyboardType="numeric"
                        value={height}
                        onChangeText={linkedHeightChange}
                        testID="height-input"
                    />
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    // Ratio row (both modes): centered, wraps on narrow screens.
    ratioRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: 8,
        rowGap: 8,
        marginBottom: 20,
    },
    // Official mode: the resolution row replaces the dimension row (same
    // spacing to the next element).
    resolutionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: 8,
        rowGap: 8,
        marginBottom: 20,
    },
    pill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFF',
    },
    pillActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    pillText: {
        color: '#666',
        fontSize: 14,
    },
    pillTextActive: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    dimensionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        columnGap: 48,
        marginBottom: 20,
    },
    dimensionGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dimensionLabel: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
    },
    dimInput: {
        borderBottomWidth: 1,
        borderBottomColor: '#DDD',
        minWidth: 60,
        fontSize: 16,
        paddingVertical: 4,
    },
});
