import { useRouter } from 'expo-router';
import { Settings as SettingsIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SettingsDialog } from './components/SettingsDialog';
import { Design, loadDesigns, newDesignId, setDesignHandoff } from './services/designStore';
import { refine } from './services/PromptRefiner';
import { getMissingSettings, loadSettings } from './services/settings';

const PRESET_RATIOS = ['4:3', '3:4', '16:9', '16:10', '9:16', '10:16', '1:1'];

// The LLM (temperature 1.0) occasionally answers with malformed JSON; how many
// refine attempts are made before giving up with an Alert.
const REFINE_MAX_ATTEMPTS = 3;

export default function IndexScreen() {
    const router = useRouter();

    // State
    const [prompt, setPrompt] = useState('');
    const [selectedRatio, setSelectedRatio] = useState('4:3');
    const [width, setWidth] = useState('1024');
    const [height, setHeight] = useState('768');
    const [isLoading, setIsLoading] = useState(false);
    // Saved designs shown in the "recent designs" sidebar, most recent first.
    const [designs, setDesigns] = useState<Design[]>([]);
    // Settings dialog (opened from the gear icon, top-right of the page).
    const [showSettings, setShowSettings] = useState(false);
    // Transient "invalid JSON, retrying" message (auto-dismisses after 5s).
    const [refineError, setRefineError] = useState<string | null>(null);
    const refineErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Show the transient refine error; a fresh failure restarts the 5s timer.
    const showRefineError = (message: string) => {
        setRefineError(message);
        if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current);
        refineErrorTimer.current = setTimeout(() => setRefineError(null), 5000);
    };

    useEffect(() => {
        setDesigns(loadDesigns());
        return () => { if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current); };
    }, []);

    // Re-open a saved design: the full payload lives in the design store, so
    // only the id goes in the URL.
    const handleOpenDesign = (design: Design) => {
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

    const handleStartDesigning = async () => {
        if (!prompt.trim()) {
            Alert.alert('Error', 'Please enter a prompt.');
            return;
        }
        // The LLM rewrite needs a configured provider: name, a credential for
        // preset vendors, and an endpoint for self-hosted backends.
        const missingLlm = getMissingSettings(loadSettings()).filter((m) => m.startsWith('LLM'));
        if (missingLlm.length > 0) {
            Alert.alert('Error', `Missing settings: ${missingLlm.join(', ')}. Open Settings (gear icon) to configure them.`);
            return;
        }

        setIsLoading(true);
        try {
            const ratioString = selectedRatio === 'custom' ? `${width}:${height}` : selectedRatio;
            const refinedPrompt = await refineWithRetry(await loadSystemPrompt(), ratioString);

            // The refined prompt is too large for URL query params (HTTP 431):
            // stash it as a handoff keyed by a fresh design id and navigate
            // with the id alone.
            const id = newDesignId();
            setDesignHandoff(id, {
                promptData: refinedPrompt,
                size: { width: parseInt(width, 10) || 0, height: parseInt(height, 10) || 0 },
            });
            router.push({ pathname: '/design', params: { id } });
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to generate prompt. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Refine the prompt. The LLM can answer with malformed JSON (temperature
    // 1.0): parse each attempt, and on failure show a transient error and
    // retry, giving up with an error after REFINE_MAX_ATTEMPTS.
    const refineWithRetry = async (systemPrompt: string, ratioString: string): Promise<string> => {
        for (let attempt = 1; attempt <= REFINE_MAX_ATTEMPTS; attempt++) {
            const raw = await refine(systemPrompt, prompt, ratioString);
            try {
                JSON.parse(raw);
                return raw;
            } catch {
                showRefineError(
                    attempt < REFINE_MAX_ATTEMPTS
                        ? `The LLM returned invalid JSON — retrying (${attempt + 1} of ${REFINE_MAX_ATTEMPTS})…`
                        : 'The LLM returned invalid JSON on every attempt.',
                );
                if (attempt === REFINE_MAX_ATTEMPTS) {
                    throw new Error('The LLM returned invalid JSON on every attempt. Please try again.');
                }
            }
        }
        throw new Error('Refine failed.'); // unreachable: the loop returns or throws
    };

    async function loadSystemPrompt(): Promise<string> {
        try {
            const response = await fetch("/system_prompt.txt");
            if (!response.ok) {
                throw new Error(`Failed to fetch system prompt: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error('[loadSystemPrompt Error]:', error);
            throw new Error(`Could not load system prompt. Please ensure assets are correctly bundled.`);
        }
    }

    return (
        <SafeAreaView style={styles.container}>
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
                    <Text style={styles.sidebarTitle}>最近的设计</Text>
                    <ScrollView style={styles.recentList}>
                        {designs.length === 0 ? (
                            <Text style={styles.emptyText}>还没有保存的设计</Text>
                        ) : (
                            designs.map((design) => {
                                // Preview the most recently generated image (if any).
                                const latest = design.images.length > 0 ? design.images[design.images.length - 1] : null;
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
                    <Text style={styles.sectionTitle}>Enter the description of your dreamed image</Text>

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
                                <Text style={[styles.ratioText, selectedRatio === 'custom' && styles.ratioTextActive]}>custom</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>

                    {/* Dimensions Row */}
                    <View style={styles.dimensionRow}>
                        <View style={styles.dimensionGroup}>
                            <Text style={styles.dimensionLabel}>Width (W)</Text>
                            <TextInput
                                style={styles.dimInput}
                                keyboardType="numeric"
                                value={width}
                                onChangeText={handleWidthChange}
                            />
                        </View>
                        <View style={styles.dimensionGroup}>
                            <Text style={styles.dimensionLabel}>Height (H)</Text>
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
                        <Text style={styles.buttonText}>{isLoading ? 'Processing...' : '开始设计'}</Text>
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
