import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, Type } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

interface RefinedPrompt {
    aspect_ratio: string;
    high_level_description: string;
    compositional_deconstruction: {
        background: string;
        elements: Array<{
            type: 'obj' | 'text';
            bbox?: [number, number, number, number];
            desc?: string;
            text?: string;
        }>;
    };
}

/**
 * A small component to display a keyword as a stylized tag.
 */
const Tag = ({ text }: { text: string }) => {
    if (!text || text.trim() === "") return null;
    return (
        <View style={styles.tag}>
            <Text style={styles.tagText}>{text.trim()}</Text>
        </View>
    );
};

/**
 * A component to display a color as a circular swatch.
 */
const ColorSwatch = ({ color }: { color: string }) => (
    <View style={[styles.swatch, { backgroundColor: color }]} />
);

export default function DesignScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const [title, setTitle] = useState('Untitled Design');
    const [aesthetics, setAesthetics] = useState("");
    const [lighting, setLighting] = useState("");
    const [medium, setMedium] = useState("");
    const [photo, setPhoto] = useState("")
    const [artStyle, setArtStyle] = useState("");
    const [palette, setPalette] = useState<string[]>([]);
    const [refinedData, setRefinedData] = useState<RefinedPrompt | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    useEffect(() => {
        try {
            const parsed = JSON.parse(params.promptData as string);
            console.log(parsed)
            setRefinedData(parsed);

            // Use the high level description as the initial title
            if (parsed.high_level_description) {
                setTitle(parsed.high_level_description);
            }

            if (parsed.style_description) {
                setAesthetics(parsed.style_description.aesthetics || "");
                setLighting(parsed.style_description.lighting || "");
                setMedium(parsed.style_description.medium || "");
                setArtStyle(parsed.style_description.art_style || "");
                setPhoto(parsed.style_description.photo || "");
                setPalette(parsed.style_description.color_palette || []);
            }

            const size = (params.size as string).split(",");
            setCanvasSize({ width: Number.parseInt(size[0]), height: Number.parseInt(size[1]) });
        } catch (e) {
            console.error('Failed to parse promptData', e);
        }
    }, [params.promptData, params.size]);

    const handleBack = () => {
        router.back();
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.mainContent}>
                {/* Left Sidebar: Toolbar */}
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Text')}>
                        <Type color="#007AFF" size={28} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Object')}>
                        <ImageIcon color="#007AFF" size={28} />
                    </TouchableOpacity>
                </View>

                {/* Right Content: Title, Metadata & Canvas */}
                <View style={styles.canvasArea}>
                    {/* Top Header: Title Input */}
                    <View style={styles.header}>
                        <TextInput
                            style={styles.titleInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Untitled Design"
                        />
                        <View style={styles.spacer} />
                    </View>

                    {/* Metadata Bar: Styled Tags and Color Swatches */}
                    <View style={styles.metadataContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Aesthetics</Text>
                                <View style={styles.tagRow}>
                                    {aesthetics.split(',').map((val, i) => <Tag key={`aes-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Lighting</Text>
                                <View style={styles.tagRow}>
                                    {lighting.split(',').map((val, i) => <Tag key={`light-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={artStyle === "" ? { ...styles.metadataGroup, display: "none" } : styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Art Style</Text>
                                <View style={styles.tagRow}>
                                    {artStyle.split(' ').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={photo === "" ? { ...styles.metadataGroup, display: "none" } : styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Photo</Text>
                                <View style={styles.tagRow}>
                                    {photo.split(',').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Medium</Text>
                                <View style={styles.tagRow}>
                                    <Tag text={medium} />
                                </View>
                            </View>
                            <View style={styles.metadataGroup}>
                                <Text style={styles.groupLabel}>Palette</Text>
                                <View style={styles.paletteRow}>
                                    {palette.map((color, i) => <ColorSwatch key={`pal-${i}`} color={color} />)}
                                </View>
                            </View>
                        </ScrollView>
                    </View>

                    {/* Canvas Placeholder */}
                    <View style={styles.canvasContainer}>
                        <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
                            {refinedData ? (
                                <View style={styles.infoOverlay}>
                                    <Text style={styles.infoText}>Parsed Concept:</Text>
                                    <Text style={styles.descText}>{refinedData.high_level_description}</Text>
                                    <Text style={styles.countText}>Elements detected: {refinedData.compositional_deconstruction.elements.length}</Text>
                                </View>
                            ) : (
                                <Text style={styles.canvasPlaceholderText}>Canvas Area</Text>
                            )}
                        </View>
                    </View>
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
    toolbar: {
        width: 70,
        backgroundColor: '#F8F9FA',
        borderRightWidth: 1,
        borderRightColor: '#EEEEEE',
        alignItems: 'center',
        paddingTop: 20,
    },
    toolButton: {
        marginBottom: 30,
        padding: 10,
    },
    canvasArea: {
        flex: 1,
        flexDirection: 'column',
    },
    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    titleInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
    },
    spacer: {
        width: 40,
    },
    metadataContainer: {
        height: 85,
        backgroundColor: '#FDFDFD',
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
    },
    scrollContent: {
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    metadataGroup: {
        marginRight: 24,
        justifyContent: 'center',
    },
    groupLabel: {
        fontSize: 10,
        color: '#AAA',
        textTransform: 'uppercase',
        marginBottom: 4,
        fontWeight: 'bold',
    },
    tag: {
        backgroundColor: '#F0F0F0',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginHorizontal: 2,
    },
    tagText: {
        fontSize: 12,
        color: '#444',
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    paletteRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    swatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 6,
        borderWidth: 1,
        borderColor: '#EEE',
    },
    canvasContainer: {
        flex: 1,
        padding: 20,
        backgroundColor: '#F0F0F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    canvas: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    canvasPlaceholderText: {
        color: '#CCC',
        fontSize: 20,
    },
    infoOverlay: {
        width: '100%',
        alignItems: 'center',
    },
    infoText: {
        fontSize: 12,
        color: '#AAA',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    descText: {
        fontSize: 16,
        color: '#333',
        textAlign: 'center',
        lineHeight: 24,
        fontStyle: 'italic',
    },
    countText: {
        marginTop: 16,
        fontSize: 14,
        color: '#007AFF',
        fontWeight: 'bold',
    },
});
