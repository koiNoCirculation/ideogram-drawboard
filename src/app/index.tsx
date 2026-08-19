import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { refine } from './services/PromptRefiner';

const RECENT_DESIGNS = [
    "A lone sailboat on calm water at sunset.",
    "A medium-shot photograph of a barista pouring latte art in a cozy cafe",
    "an isometric illustration of a tiny city floating in the clouds",
];

const PRESET_RATIOS = ['4:3', '3:4', '16:9', '16:10', '9:16', '10:16', '1:1'];

export default function IndexScreen() {
    const router = useRouter();

    // State
    const [prompt, setPrompt] = useState('');
    const [selectedRatio, setSelectedRatio] = useState('4:3');
    const [width, setWidth] = useState('1024');
    const [height, setHeight] = useState('768');
    const [isLoading, setIsLoading] = useState(false);

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

        setIsLoading(true);
        try {
            const ratioString = selectedRatio === 'custom' ? `${width}:${height}` : selectedRatio;
            const refinedPrompt = await refine(await loadSystemPrompt(), prompt, ratioString);

            // Pass the JSON prompt to design.tsx
            router.push({
                pathname: '/design',
                params: { promptData: refinedPrompt },
            });
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to generate prompt. Please try again.');
        } finally {
            setIsLoading(false);
        }
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
            <View style={styles.mainContent}>
                {/* Left Sidebar: Recent Designs */}
                <View style={styles.leftSidebar}>
                    <Text style={styles.sidebarTitle}>最近的设计</Text>
                    <ScrollView style={styles.recentList}>
                        {RECENT_DESIGNS.map((item, index) => (
                            <TouchableOpacity key={index} style={styles.card}>
                                <Text numberOfLines={2} style={styles.cardText}>{item}</Text>
                            </TouchableOpacity>
                        ))}
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
        backgroundColor: '#F5F5F5',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    cardText: {
        fontSize: 14,
        color: '#666',
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
