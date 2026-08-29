import { ChevronDown, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    IMAGE_PROVIDERS,
    LLM_PROVIDERS,
    LLM_SELF_HOSTED_DEFAULTS,
    LlmProfile,
    Settings,
    emptyLlmProfile,
    getLlmUrl,
    isSelfHostedLlm,
    loadSettings,
    saveSettings,
} from '../services/settings';
import { useI18n } from '../../i18n';

/**
 * A labeled dropdown. RN has no native select, so the options render as an
 * inline expanding list under the field (pushes content down — no overlay or
 * z-index management inside the dialog card).
 */
export function SelectField({ id, label, value, options, onChange }: {
    id: string;
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                style={styles.select}
                testID={`${id}-select`}
                onPress={() => setOpen((o) => !o)}
            >
                <Text style={styles.selectText} numberOfLines={1}>{value}</Text>
                <ChevronDown
                    size={14}
                    color="#888"
                    style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] } as any}
                />
            </TouchableOpacity>
            {open && (
                <View style={styles.optionList}>
                    {options.map((opt) => (
                        <TouchableOpacity
                            key={opt}
                            style={styles.optionRow}
                            testID={`${id}-option-${opt}`}
                            onPress={() => {
                                onChange(opt);
                                setOpen(false);
                            }}
                        >
                            <Text style={[styles.optionText, opt === value && styles.optionTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

/** A labeled single-line input; `editable=false` shows a derived/read-only value. */
function TextField({ label, value, onChange, placeholder, editable = true, testID }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    editable?: boolean;
    testID?: string;
}) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                testID={testID}
                style={[styles.input, !editable && styles.inputDisabled]}
                value={value}
                onChangeText={editable ? onChange : undefined}
                placeholder={placeholder}
                placeholderTextColor="#BBB"
                editable={editable}
            />
        </View>
    );
}

/**
 * The Settings dialog (opened from the gear icon on the home and design pages).
 * All fields are loaded from / saved to localStorage via the settings service.
 * Each LLM provider keeps its own profile (endpoint/key/model); switching
 * providers only changes which profile is shown — the others are preserved.
 * LLM endpoint is editable only for self-hosted backends (vLLM/SGLang/Ollama,
 * prefilled with their conventional addresses when empty); otherwise the vendor
 * endpoint is shown read-only. Image endpoint is editable ONLY for "Custom"
 * (local/self-hosted service, or a CORS proxy mirroring the official API such
 * as the cf-worker project); "Official" hardcodes the bare path
 * /v1/ideogram-v4/generate, shown read-only.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
    const [settings, setSettings] = useState<Settings>(() => loadSettings());
    const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
        setSettings((prev) => ({ ...prev, [key]: value }));

    // Update one field of the ACTIVE provider's LLM profile (leaving the
    // other providers' profiles untouched).
    const setLlmField = (field: keyof LlmProfile, value: string) =>
        setSettings((prev) => ({
            ...prev,
            llmProfiles: {
                ...prev.llmProfiles,
                [prev.llmProvider]: { ...(prev.llmProfiles[prev.llmProvider] ?? emptyLlmProfile()), [field]: value },
            },
        }));

    const activeLlm = settings.llmProfiles[settings.llmProvider] ?? emptyLlmProfile();
    const isSelfHostedLlmProvider = isSelfHostedLlm(settings.llmProvider);
    const isCustomImage = settings.imageProvider === 'Custom';

    const handleSave = () => {
        saveSettings(settings);
        onClose();
    };

    return (
        <View style={styles.backdrop} onPointerDown={onClose}>
            <View style={styles.card} onPointerDown={(e) => e.stopPropagation()}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>{t('settingsTitle')}</Text>
                    <TouchableOpacity onPress={onClose} testID="settings-close" style={{ padding: 4 }}>
                        <X size={18} color="#888" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                    <Text style={styles.sectionTitle}>{t('llmSection')}</Text>
                    <SelectField
                        id="llm-provider"
                        label={t('llmProvider')}
                        value={settings.llmProvider}
                        options={LLM_PROVIDERS}
                        onChange={(v) => {
                            // Switching only changes the active profile; the
                            // other providers' endpoint/key/name are untouched.
                            set('llmProvider', v as Settings['llmProvider']);
                            // Prefill the conventional address when switching to a
                            // self-hosted backend whose endpoint is still empty.
                            if (isSelfHostedLlm(v) && !settings.llmProfiles[v]?.endpoint.trim()) {
                                setLlmField('endpoint', LLM_SELF_HOSTED_DEFAULTS[v]);
                            }
                        }}
                    />
                    <TextField
                        label={t('llmEndpoint')}
                        value={isSelfHostedLlmProvider ? activeLlm.endpoint : getLlmUrl(settings)}
                        onChange={(v) => setLlmField('endpoint', v)}
                        placeholder="http://localhost:8000/v1"
                        editable={isSelfHostedLlmProvider}
                    />
                    <TextField
                        label={t('llmKey')}
                        value={activeLlm.secretKey}
                        onChange={(v) => setLlmField('secretKey', v)}
                        placeholder="sk-..."
                    />
                    <TextField
                        label={t('llmName')}
                        value={activeLlm.name}
                        onChange={(v) => setLlmField('name', v)}
                        placeholder="gpt-4o"
                    />

                    <Text style={styles.sectionTitle}>{t('imageSection')}</Text>
                    <SelectField
                        id="image-provider"
                        label={t('imageProvider')}
                        value={settings.imageProvider}
                        options={IMAGE_PROVIDERS}
                        onChange={(v) => set('imageProvider', v as Settings['imageProvider'])}
                    />
                    <TextField
                        label={t('imageEndpoint')}
                        testID="settings-image-endpoint"
                        value={isCustomImage ? settings.imageEndpoint : '/v1/ideogram-v4/generate'}
                        onChange={(v) => set('imageEndpoint', v)}
                        placeholder={isCustomImage ? 'http://127.0.0.1:8000' : '/v1/ideogram-v4/generate'}
                        editable={isCustomImage}
                    />
                    <TextField
                        label={t('imageKey')}
                        value={settings.imageSecretKey}
                        onChange={(v) => set('imageSecretKey', v)}
                        placeholder="Ideogram API key"
                    />
                </ScrollView>

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                        <Text style={styles.cancelText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveButton} onPress={handleSave} testID="settings-save">
                        <Text style={styles.saveText}>{t('saveSettings')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        zIndex: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        width: 460,
        maxWidth: '92%',
        maxHeight: '85%',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 20,
        zIndex: 100,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    body: {
        flexGrow: 0,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#007AFF',
        textTransform: 'uppercase',
        marginTop: 6,
        marginBottom: 10,
    },
    field: {
        marginBottom: 14,
    },
    label: {
        fontSize: 10,
        color: '#AAA',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    select: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderColor: '#DDD',
        borderWidth: 1,
        borderRadius: 6,
        backgroundColor: '#FAFAFA',
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    selectText: {
        flex: 1,
        fontSize: 14,
        color: '#333',
        marginRight: 8,
    },
    optionList: {
        borderColor: '#DDD',
        borderTopWidth: 0,
        borderWidth: 1,
        borderRadius: 6,
        marginTop: -4,
        backgroundColor: '#FFFFFF',
    },
    optionRow: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    optionText: {
        fontSize: 14,
        color: '#333',
    },
    optionTextActive: {
        color: '#007AFF',
        fontWeight: '600',
    },
    input: {
        borderColor: '#DDD',
        borderWidth: 1,
        borderRadius: 6,
        backgroundColor: '#FAFAFA',
        paddingHorizontal: 10,
        paddingVertical: 9,
        fontSize: 14,
        color: '#333',
    },
    inputDisabled: {
        backgroundColor: '#F0F0F0',
        color: '#888',
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 16,
    },
    cancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#DDD',
        backgroundColor: '#FFFFFF',
    },
    cancelText: {
        fontSize: 14,
        color: '#555',
    },
    saveButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: '#007AFF',
    },
    saveText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
