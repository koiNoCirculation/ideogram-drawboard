import { Stack, useRouter } from 'expo-router';
import { ArrowUp, Home as HomeIcon, Images, Settings as SettingsIcon, X } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ErrorFloat, useErrorFloat } from './components/ErrorFloat';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { RecentDesignsWall } from './components/RecentDesignsWall';
import { ResolutionPicker } from './components/ResolutionPicker';
import { SettingsDialog } from './components/SettingsDialog';
import { useI18n } from '../i18n';
import { useStartDesign } from './useStartDesign';
import { useImageUris } from './useImageUris';
import { Design, loadDesigns, markNavigationFromHome, newDesignId, setDesignHandoff } from './services/designStore';
import { exampleToDesign, loadExampleCollection } from './services/exampleCollection';
import { fileToDataUri } from './services/imageFile';
import { ImageProvider, loadSettings } from './services/settings';
import { OFFICIAL_RATIO_GROUPS, pickOfficialSize, ratioLabel } from './services/resolutions';
// The prompt bar's capsule height: 56px for a single line, growing with
// wrapped multiline text up to 200px (longer text scrolls inside).
const MIN_INPUT_BAR_HEIGHT = 56;
const MAX_INPUT_BAR_HEIGHT = 200;

// Which home section is active: 'home' leaves the image wall empty (title
// hidden), 'recent' shows the masonry of saved designs' latest images.
type HomeSection = 'home' | 'recent';

export default function IndexScreen() {
    const router = useRouter();
    const { t } = useI18n();

    // State
    const [prompt, setPrompt] = useState('');
    const [selectedRatio, setSelectedRatio] = useState('4:3');
    const [width, setWidth] = useState('1024');
    const [height, setHeight] = useState('768');
    // The image generation provider (settings); the size picker is
    // provider-dependent (Official = fixed resolution list, Custom = the
    // preset ratios + free W/H). Re-read when the settings dialog closes.
    const [imageProvider, setImageProvider] = useState<ImageProvider>(() => loadSettings().imageProvider);
    // Saved designs backing the Recent Designs wall, most recent first.
    const [designs, setDesigns] = useState<Design[]>([]);
    // Bundled example designs (public/example_collection) backing the default
    // Home wall; empty when the collection fails to load.
    const [examples, setExamples] = useState<Design[]>([]);
    // Settings dialog (opened from the gear icon, top-right of the page).
    const [showSettings, setShowSettings] = useState(false);
    const [activeSection, setActiveSection] = useState<HomeSection>('home');
    // Reference images added to the prompt bar (dropped or pasted, base64
    // data URIs); sent to the LLM as multimodal content. Home-only state —
    // cleared on
    // navigation. `dragging` highlights the drop zone while a file hovers it.
    const [refImages, setRefImages] = useState<string[]>([]);
    const [dragging, setDragging] = useState(false);
    // Prompt bar height: follows the (multiline) text content, clamped to
    // [MIN_INPUT_BAR_HEIGHT, MAX_INPUT_BAR_HEIGHT].
    const [inputBarHeight, setInputBarHeight] = useState(MIN_INPUT_BAR_HEIGHT);

    // Start Design flow (settings validation → refine with retry → handoff →
    // navigate); also owns the red LLM error line (transient "retrying"
    // notices, persistent final failures) and the red float for LLM request /
    // system-prompt asset failures. Triggered by the circular arrow button
    // inside the prompt bar.
    const { isLoading, refineError, errorFloatMessage, handleStartDesigning } = useStartDesign({
        prompt, selectedRatio, width, height, images: refImages,
    });
    // Red float for the bundled example collection failing to load (once, at
    // mount) — a different flow from the Start-Design float, rendered on its
    // own ErrorFloat.
    const { message: exampleFloatMessage, show: showExampleFloat } = useErrorFloat();

    // Reference images into the prompt bar, via drag-and-drop OR clipboard
    // paste (Ctrl+V). RN has no native DnD, so attach DOM listeners to the
    // bar's node (same testID-lookup pattern as the design page's canvas
    // wheel zoom): dragover/drop are prevented so the browser lets the drop
    // land; pastes carrying image/* clipboard items (e.g. a screenshot) are
    // intercepted the same way. Every image file becomes a base64 data URI
    // (preview row + multimodal refine input); text-only pastes fall through
    // to the input's default behavior.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const node = document.querySelector('[data-testid="prompt-dropzone"]') as HTMLElement | null;
        if (!node) return;
        const pushImageFiles = (files: File[]) => {
            files.forEach((file) => {
                fileToDataUri(file)
                    .then((uri) => setRefImages((prev) => [...prev, uri]))
                    .catch((err) => console.error('[refImage Error]:', err));
            });
        };
        const onDragOver = (e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
        };
        const onDragLeave = (e: DragEvent) => {
            e.preventDefault();
            // Moving onto a child (input, button) also fires dragleave;
            // only clear when actually leaving the bar.
            if (e.relatedTarget && node.contains(e.relatedTarget as Node)) return;
            setDragging(false);
        };
        const onDrop = (e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
            pushImageFiles(files);
        };
        const onPaste = (e: ClipboardEvent) => {
            const files = Array.from(e.clipboardData?.items ?? [])
                .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                .map((it) => it.getAsFile())
                .filter((f): f is File => f !== null);
            if (files.length === 0) return;
            // Consume the paste so the textarea doesn't also insert it.
            e.preventDefault();
            pushImageFiles(files);
        };
        node.addEventListener('dragover', onDragOver);
        node.addEventListener('dragleave', onDragLeave);
        node.addEventListener('drop', onDrop);
        node.addEventListener('paste', onPaste);
        return () => {
            node.removeEventListener('dragover', onDragOver);
            node.removeEventListener('dragleave', onDragLeave);
            node.removeEventListener('drop', onDrop);
            node.removeEventListener('paste', onPaste);
        };
    }, []);

    // Auto-grow the prompt bar to fit the (multiline) text. The input's own
    // scrollHeight tracks its box (it is flex:1 inside the bar, and a
    // textarea's auto height comes from its rows attribute, not the text),
    // so measure the real content height by collapsing the box to 1px first —
    // a taller bar would otherwise feed back into the measurement.
    useLayoutEffect(() => {
        if (typeof document === 'undefined') return;
        const ta = document.querySelector('[data-testid="prompt-input"]') as HTMLTextAreaElement | null;
        if (!ta) return;
        const id = requestAnimationFrame(() => {
            const prev = ta.style.height;
            ta.style.height = '1px';
            const content = ta.scrollHeight;
            ta.style.height = prev;
            setInputBarHeight(Math.min(MAX_INPUT_BAR_HEIGHT,
                Math.max(MIN_INPUT_BAR_HEIGHT, content + 12)));
        });
        return () => cancelAnimationFrame(id);
    }, [prompt]);

    useEffect(() => {
        setDesigns(loadDesigns());
        // Populate the default Home wall with the bundled example collection;
        // a load failure leaves the wall empty (its empty state shows) and
        // floats a friendly "couldn't load the examples" message.
        loadExampleCollection().then(({ entries, error }) => {
            setExamples(entries.map((entry, i) => exampleToDesign(entry, i)));
            if (error) showExampleFloat(t('examplesLoadFailed'));
        });
    }, []);

    // Resolve each design's latest image (ids into the IndexedDB image store —
    // the only ref kind), aligned by index with `designs`.
    const latestRefs = useMemo(
        () => designs.map((d) => (d.images.length > 0 ? d.images[d.images.length - 1] : null)),
        [designs],
    );
    const latestUris = useImageUris(latestRefs);

    // Resolve each example's image (ids persisted by loadExampleCollection,
    // looked up in the IndexedDB image store), aligned by index with `examples`.
    const exampleRefs = useMemo(
        () => examples.map((d) => (d.images.length > 0 ? d.images[d.images.length - 1] : null)),
        [examples],
    );
    const exampleUris = useImageUris(exampleRefs);

    // Re-open a saved design: the full payload lives in the design store, so
    // only the id goes in the URL.
    const handleOpenDesign = (design: Design) => {
        markNavigationFromHome();
        router.push({ pathname: '/design', params: { id: design.id } });
    };

    // Open an example as a fresh, editable design: stash its refined prompt,
    // canvas size, original prompt and reference image in the navigation
    // handoff (too large for URL query params), then navigate with a new id.
    const handleOpenExample = (example: Design) => {
        const id = newDesignId();
        setDesignHandoff(id, {
            promptData: JSON.stringify(example.prompt),
            size: example.size,
            rawPrompt: example.rawPrompt,
            images: example.images,
        });
        markNavigationFromHome();
        router.push({ pathname: '/design', params: { id } });
    };

    // Official: snap the default 4:3 1024×768 onto the fixed resolution list
    // before the first paint (it is not an official size).
    useLayoutEffect(() => {
        if (imageProvider !== 'Official') return;
        const r = pickOfficialSize(1024, 768);
        setWidth(String(r.w));
        setHeight(String(r.h));
        setSelectedRatio(ratioLabel(r.w, r.h));
    }, []);

    // Synchronize width/height when a Custom preset ratio is selected (the
    // official mode's W/H is owned by its resolution pills instead).
    useEffect(() => {
        if (imageProvider === 'Official' || selectedRatio === 'custom') return;
        const [rw, rh] = selectedRatio.split(':').map(Number);
        // We use a baseline width of 1024 or height of 1024 depending on aspect
        if (rw >= rh) {
            setWidth('1024');
            setHeight(Math.round(1024 * (rh / rw)).toString());
        } else {
            setHeight('1024');
            setWidth(Math.round(1024 * (rw / rh)).toString());
        }
    }, [selectedRatio, imageProvider]);

    // Ratio pill (both modes); official mode also selects the ratio's LARGEST resolution.
    const handleSelectRatio = (ratio: string) => {
        setSelectedRatio(ratio);
        if (imageProvider === 'Official') {
            const top = OFFICIAL_RATIO_GROUPS.find((g) => g.ratio === ratio)?.resolutions[0];
            if (top) {
                setWidth(String(top.w));
                setHeight(String(top.h));
            }
        }
    };

    // Official resolution pill: the chosen size becomes W/H; the ratio its group label.
    const handleResolutionSelect = (w: number, h: number) => {
        setWidth(String(w));
        setHeight(String(h));
        setSelectedRatio(ratioLabel(w, h));
    };

    // Settings dialog closed (Save or Cancel): re-read the persisted image
    // provider and adapt the size state when it changed.
    const handleSettingsClose = () => {
        setShowSettings(false);
        const provider = loadSettings().imageProvider;
        setImageProvider(provider);
        if (provider === imageProvider) return;
        if (provider === 'Official') {
            // The official set is fixed: snap the current W/H onto it.
            const r = pickOfficialSize(parseInt(width, 10) || 0, parseInt(height, 10) || 0);
            setWidth(String(r.w));
            setHeight(String(r.h));
            setSelectedRatio(ratioLabel(r.w, r.h));
        } else {
            // The official ratio may not exist among the Custom presets — park on 'custom' (keeps W/H).
            setSelectedRatio('custom');
        }
    };

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            {/* Red floats: LLM request / system-prompt failures (Start
                Design) and the example-collection load failure. */}
            <ErrorFloat message={errorFloatMessage} />
            <ErrorFloat message={exampleFloatMessage} />
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
                    {/* Left sidebar: Home / Recent Designs nav (no logo). */}
                    <View style={styles.sidebar}>
                        <TouchableOpacity
                            style={[styles.navItem, activeSection === 'home' && styles.navItemActive]}
                            onPress={() => setActiveSection('home')}
                            testID="nav-home"
                        >
                            <HomeIcon size={18} color={activeSection === 'home' ? '#111111' : '#666666'} />
                            <Text style={[styles.navText, activeSection === 'home' && styles.navTextActive]}>
                                {t('homeNav')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.navItem, activeSection === 'recent' && styles.navItemActive]}
                            onPress={() => setActiveSection('recent')}
                            testID="nav-recent-designs"
                        >
                            <Images size={18} color={activeSection === 'recent' ? '#111111' : '#666666'} />
                            <Text style={[styles.navText, activeSection === 'recent' && styles.navTextActive]}>
                                {t('recentDesigns')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Main column: centered hero + image wall below it. */}
                    <ScrollView style={styles.mainScroll}>
                        <View style={styles.hero}>
                            <Text style={styles.sectionTitle}>{t('enterDescription')}</Text>

                            {/* Aspect ratio + size picker (provider-dependent) */}
                            <ResolutionPicker
                                official={imageProvider === 'Official'}
                                selectedRatio={selectedRatio}
                                width={width}
                                height={height}
                                onSelectRatio={handleSelectRatio}
                                onResolutionSelect={handleResolutionSelect}
                                onWidthChange={setWidth}
                                onHeightChange={setHeight}
                            />

                            {/* Reference-image previews (dropped onto /
                                pasted into the prompt bar): below W/H,
                                above the input bar; each is removable. */}
                            {refImages.length > 0 && (
                                <View style={styles.previewRow}>
                                    {refImages.map((uri, i) => (
                                        <View key={i} style={styles.previewItem} testID={`image-preview-${i}`}>
                                            <Image source={{ uri }} style={styles.previewImg} />
                                            <Pressable
                                                style={styles.previewRemove}
                                                onPress={() => setRefImages((prev) => prev.filter((_, j) => j !== i))}
                                                accessibilityLabel={t('removeImage')}
                                                testID={`image-preview-remove-${i}`}
                                            >
                                                <X size={10} color="#FFFFFF" />
                                            </Pressable>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Red LLM error line: non-request failures only —
                                missing settings (persistent) and "retrying"
                                (auto-dismisses after 5s) / all JSON retries
                                failed (persistent until the next submit).
                                LLM request failures surface in the red float. */}
                            {refineError && (
                                <View style={styles.refineErrorRow} testID="refine-error">
                                    <Text style={styles.refineErrorText}>{refineError}</Text>
                                </View>
                            )}

                            {/* Prompt bar: rounded capsule input + circular start
                                button; also the drop zone for reference images
                                (blue border while a file is dragged over it). */}
                            <View
                                style={[styles.inputBar, dragging && styles.inputBarDragging, { height: inputBarHeight }]}
                                testID="prompt-dropzone"
                            >
                                <TextInput
                                    style={[styles.promptInput, inputBarHeight > MIN_INPUT_BAR_HEIGHT && { textAlignVertical: 'top', paddingTop: 8 }]}
                                    placeholder={t('promptPlaceholder')}
                                    placeholderTextColor="#999999"
                                    value={prompt}
                                    onChangeText={setPrompt}
                                    multiline
                                    testID="prompt-input"
                                />
                                <TouchableOpacity
                                    style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
                                    onPress={handleStartDesigning}
                                    disabled={isLoading}
                                    accessibilityLabel={isLoading ? t('processing') : t('startDesign')}
                                    testID="start-design-button"
                                >
                                    {isLoading
                                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                                        : <ArrowUp color="#FFFFFF" size={20} strokeWidth={2.5} />}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Image wall: bundled examples on Home (titled
                            "Collections"), saved designs on Recent Designs. */}
                        <View style={styles.wallWrap}>
                            {activeSection === 'recent' ? (
                                <RecentDesignsWall
                                    designs={designs}
                                    uris={latestUris}
                                    titleText={t('recentDesigns')}
                                    emptyText={t('noDesigns')}
                                    onOpen={handleOpenDesign}
                                />
                            ) : (
                                <RecentDesignsWall
                                    designs={examples}
                                    uris={exampleUris}
                                    titleText={t('collections')}
                                    emptyText={t('noExamples')}
                                    onOpen={handleOpenExample}
                                />
                            )}
                        </View>
                    </ScrollView>
                </View>

                {/* Settings dialog (LLM + image generation endpoints/credentials) */}
                {showSettings && <SettingsDialog onClose={handleSettingsClose} />}
            </SafeAreaView>
        </>
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
    // Left sidebar: nav only, no logo (bordered off the main column).
    sidebar: {
        width: 200,
        borderRightWidth: 1,
        borderRightColor: '#EEEEEE',
        paddingTop: 64,
        paddingLeft: 12,
        paddingRight: 12,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 10,
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 4,
    },
    navItemActive: {
        backgroundColor: '#F2F3F5',
    },
    navText: {
        fontSize: 14,
        color: '#666666',
    },
    navTextActive: {
        color: '#111111',
        fontWeight: '600',
    },
    mainScroll: {
        flex: 1,
    },
    // Centered hero column (title / ratios / dimensions / prompt bar).
    hero: {
        width: '100%',
        maxWidth: 900,
        alignSelf: 'center',
        paddingTop: 56,
        paddingHorizontal: 24,
    },
    sectionTitle: {
        fontSize: 34,
        fontWeight: '600',
        color: '#111111',
        textAlign: 'center',
        marginBottom: 28,
    },
    // Reference-image preview row (below W/H, above the prompt bar).
    previewRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: 8,
        rowGap: 8,
        marginBottom: 12,
    },
    previewItem: {
        width: 48,
        height: 48,
        borderRadius: 6,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#DDDDDD',
        backgroundColor: '#F5F5F5',
    },
    previewImg: {
        width: 48,
        height: 48,
    },
    previewRemove: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Blue border while a file is dragged over the prompt bar (color only —
    // keeping the 1px width so the capsule doesn't shift).
    inputBarDragging: {
        borderColor: '#007AFF',
    },
    // Rounded capsule prompt bar (Ideogram-style) with the circular start
    // button embedded on the right.
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
        paddingLeft: 24,
        paddingRight: 8,
    },
    promptInput: {
        flex: 1,
        fontSize: 16,
        color: '#111111',
        paddingVertical: 0,
        // Multiline: once the bar hits MAX_INPUT_BAR_HEIGHT, longer text
        // scrolls inside instead of growing the capsule further.
        overflow: 'scroll',
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#111111',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#CCCCCC',
    },
    // Red LLM error line above the prompt bar (transient "retrying" notice
    // or persistent final failure — bad endpoint, HTTP error, bad JSON).
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
    // The wall spans the full main-column width (wider than the hero), like
    // the reference design; the component adds its own inner padding.
    wallWrap: {
        width: '100%',
    },
});
