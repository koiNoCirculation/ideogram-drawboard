import { useRouter } from 'expo-router';
import { Settings as SettingsIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SettingsDialog } from './components/SettingsDialog';
import { useI18n } from '../i18n';
import { useStartDesign } from './useStartDesign';
import { useImageUris } from './useImageUris';
import { Design, loadDesigns, markNavigationFromHome } from './services/designStore';

const PRESET_RATIOS = ['4:3', '3:4', '16:9', '16:10', '9:16', '10:16', '1:1'];

export default function IndexScreen() {
    const router = useRouter();
    const { t } = useI18n();

    // State
    const [prompt, setPrompt] = useState('');
    const [selectedRatio, setSelectedRatio] = useState('4:3');
    const [width, setWidth] = useState('1024');
    const [height, setHeight] = useState('768');
    // Saved designs shown in the "recent designs" sidebar, most recent first.
    const [designs, setDesigns] = useState<Design[]>([]);
    // Settings dialog (opened from the gear icon, top-right of the page).
    const [showSettings, setShowSettings] = useState(false);

    // Start Design flow (settings validation → refine with retry → handoff →
    // navigate); also owns the transient refine-error line.
    const { isLoading, refineError, handleStartDesigning } = useStartDesign({
        prompt, selectedRatio, width, height,
    });

    useEffect(() => {
        setDesigns(loadDesigns());
    }, []);

    // Resolve each card's preview image (IDs into the IndexedDB image store;
    // legacy URL entries pass through), aligned by index with `designs`.
    const latestRefs = useMemo(
        () => designs.map((d) => (d.images.length > 0 ? d.images[d.images.length - 1] : null)),
        [designs],
    );
    const latestUris = useImageUris(latestRefs);

    // Re-open a saved design: the full payload lives in the design store, so
    // only the id goes in the URL.
    const handleOpenDesign = (design: Design) => {
        markNavigationFromHome();
        router.push({ pathname: '/design', params: { id: design.id } });
    };

    // Synchronize width/height when preset ratio changes
    useEffect(() => {
        if (selectedRatio !== 'custom') {
            const [rw, rh] = selectedRatio.split(':').map(Number);
            // We use a baseline width of 1024 or height of 1024 depending on aspect
            if (rw >= rh) {
                setWidth('1024');
                setHeight(Math.round(1024 * (rh / rw)).toString());
            } else {
                setHeight('1024');
                setWidth(Math.round(1024 * (rw / rh)).toString());
            }
        }
    }, [selectedRatio]);

    const handleWidthChange = (val: string) => {
        const cleanVal = val.replace(/[^0-9]/g, '');
        setWidth(cleanVal);

        if (selectedRatio !== 'custom') {
            const [rw, rh] = selectedRatio.split(':').map(Number);
            const wNum = parseInt(cleanVal) || 0;
            if (wNum > 0) {
                setHeight(Math.round(wNum * (rh / rw)).toString());
            }
        }
    };

    const handleHeightChange = (val: string) => {
        const cleanVal = val.replace(/[^0-9]/g, '');
        setHeight(cleanVal);

        if (selectedRatio !== 'custom') {
            const [rw, rh] = selectedRatio.split(':').map(Number);
            const hNum = parseInt(cleanVal) || 0;
            if (hNum > 0) {
                setWidth(Math.round(hNum * (rw / rh)).toString());
            }
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Language switcher (flag), pinned left of the settings gear. */}
            <LanguageSwitcher style={styles.langButton} />

            {/* Settings gear, pinned to the page's top-right corner. */}
            <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => setShowSettings(true)}
                testID="settings-gear"
            >
                <SettingsIcon color="#007AFF" size={28} />
            </TouchableOpacity>

            <View style={styles.mainContent}>
                {/* Left Sidebar: Recent Designs (saved designs, most recent first) */}
                <View style={styles.leftSidebar}>
                    <Text style={styles.sidebarTitle}>{t('recentDesigns')}</Text>
                    <ScrollView style={styles.recentList}>
                        {designs.length === 0 ? (
                            <Text style={styles.emptyText}>{t('noDesigns')}</Text>
                        ) : (
                            designs.map((design, idx) => {
                                // Preview the most recently generated image (if any);
                                // null while the IDB lookup is in flight or if the record is gone.
                                const latest = latestUris[idx];
                                return (
                                    <TouchableOpacity
                                        key={design.id}
                                        style={styles.card}
                                        onPress={() => handleOpenDesign(design)}
                                    >
                                        {latest && (
                                            <Image source={{ uri: latest }} style={styles.cardThumb} resizeMode="cover" />
                                        )}
                                        <Text numberOfLines={3} style={styles.cardText}>
                                            {design.prompt.high_level_description}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                </View>

                {/* Right Section: Input Area */}
                <View style={styles.rightSection}>
                    <Text style={styles.sectionTitle}>{t('enterDescription')}</Text>

                    {/* Aspect Ratio Selection */}
                    <View style={styles.selectorContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratioList}>
                            {PRESET_RATIOS.map((ratio) => (
                                <TouchableOpacity
                                    key={ratio}
                                    style={[styles.ratioButton, selectedRatio === ratio && styles.ratioButtonActive]}
                                    onPress={() => setSelectedRatio(ratio)}
                                >
                                    <Text style={[styles.ratioText, selectedRatio === ratio && styles.ratioTextActive]}>{ratio}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                style={[styles.ratioButton, selectedRatio === 'custom' && styles.ratioButtonActive]}
                                onPress={() => setSelectedRatio('custom')}
                            >
                                <Text style={[styles.ratioText, selectedRatio === 'custom' && styles.ratioTextActive]}>{t('customRatio')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>

                    {/* Dimensions Row */}
                    <View style={styles.dimensionRow}>
                        <View style={styles.dimensionGroup}>
                            <Text style={styles.dimensionLabel}>{t('widthLabel')}</Text>
                            <TextInput
                                style={styles.dimInput}
                                keyboardType="numeric"
                                value={width}
                                onChangeText={handleWidthChange}
                            />
                        </View>
                        <View style={styles.dimensionGroup}>
                            <Text style={styles.dimensionLabel}>{t('heightLabel')}</Text>
                            <TextInput
                                style={styles.dimInput}
                                keyboardType="numeric"
                                value={height}
                                onChangeText={handleHeightChange}
                            />
                        </View>
                    </View>

                    {/* Prompt Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.textArea}
                            placeholder="a golden retriever on a skateboard"
                            placeholderTextColor="#999"
                            multiline
                            value={prompt}
                            onChangeText={setPrompt}
                        />
                    </View>

                    {/* Transient refine error (invalid JSON → retrying); auto-dismisses after 5s */}
                    {refineError && (
                        <View style={styles.refineErrorRow}>
                            <Text style={styles.refineErrorText}>{refineError}</Text>
                        </View>
                    )}

                    {/* Start Button */}
                    <TouchableOpacity
                        style={[styles.button, isLoading && styles.buttonDisabled]}
                        onPress={handleStartDesigning}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonText}>{isLoading ? t('processing') : t('startDesign')}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Settings dialog (LLM + image generation endpoints/credentials) */}
            {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    mainContent: {
        flex: 1,
        flexDirection: 'row',
    },
    // Language flag, pinned just left of the settings gear (the gear occupies
    // the rightmost 16+48px, so the flag sits at right: 72).
    langButton: {
        position: 'absolute',
        top: 16,
        right: 72,
        zIndex: 10,
    },
    // Settings gear, pinned to the page's top-right corner (matches the
    // design page's toolbar icon size).
    settingsButton: {
        position: 'absolute',
        top: 12,
        right: 16,
        padding: 10,
        zIndex: 10,
    },
    leftSidebar: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: '#EEEEEE',
        padding: 16,
    },
    sidebarTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#333',
    },
    recentList: {
        flex: 1,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    cardThumb: {
        width: 52,
        height: 52,
        borderRadius: 6,
        marginRight: 10,
        backgroundColor: '#E5E5E5',
    },
    cardText: {
        flex: 1,
        fontSize: 13,
        color: '#666',
    },
    emptyText: {
        fontSize: 13,
        color: '#999',
        fontStyle: 'italic',
    },
    rightSection: {
        flex: 2,
        padding: 24,
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#000',
    },
    selectorContainer: {
        marginBottom: 20,
    },
    ratioList: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ratioButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DDD',
        marginRight: 8,
        backgroundColor: '#FFF',
    },
    ratioButtonActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    ratioText: {
        color: '#666',
        fontSize: 14,
    },
    ratioTextActive: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    dimensionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    dimensionGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
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
    inputContainer: {
        flex: 1,
        marginBottom: 20,
    },
    textArea: {
        flex: 1,
        borderColor: '#DDD',
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
        fontSize: 18,
        textAlignVertical: 'top',
    },
    // Transient refine error (invalid JSON, retrying) above the start button.
    refineErrorRow: {
        marginBottom: 12,
        padding: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(229, 57, 53, 0.08)',
        borderWidth: 1,
        borderColor: '#E53935',
    },
    refineErrorText: {
        fontSize: 13,
        color: '#E53935',
    },
    button: {
        backgroundColor: '#007AFF',
        paddingVertical: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#AAA',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
