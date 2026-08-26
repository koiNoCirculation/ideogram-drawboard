import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../i18n';
import { markNavigationFromHome, newDesignId, setDesignHandoff } from './services/designStore';
import { refine } from './services/PromptRefiner';
import { getMissingSettings, loadSettings } from './services/settings';

// The LLM (temperature 1.0) occasionally answers with malformed JSON; how many
// refine attempts are made before giving up with an Alert.
const REFINE_MAX_ATTEMPTS = 3;

/**
 * The home page's "Start Design" flow: validate the prompt and the LLM
 * settings, refine with retries on malformed JSON (transient 5s error line),
 * stash the refined prompt in the navigation handoff and push /design?id=...
 * Returns the loading flag, the transient refine error and the button handler.
 */
export const useStartDesign = ({ prompt, selectedRatio, width, height }: {
    prompt: string;
    selectedRatio: string;
    width: string;
    height: string;
}) => {
    const router = useRouter();
    const { t } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
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
        return () => { if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current); };
    }, []);

    const handleStartDesigning = async () => {
        if (!prompt.trim()) {
            Alert.alert(t('errorTitle'), t('promptRequired'));
            return;
        }
        // The LLM rewrite needs a configured provider: name, a credential for
        // preset vendors, and an endpoint for self-hosted backends.
        const missingLlm = getMissingSettings(loadSettings()).filter((m) => m.startsWith('LLM'));
        if (missingLlm.length > 0) {
            Alert.alert(t('errorTitle'), t('missingSettingsAlert', { items: missingLlm.join(', ') }));
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
                // Keep the user's original prompt so the design page's Show
                // Prompt dialog can display it next to the refined JSON.
                rawPrompt: prompt,
            });
            markNavigationFromHome();
            router.push({ pathname: '/design', params: { id } });
        } catch (error: any) {
            Alert.alert(t('errorTitle'), error.message || t('refineFailedAlert'));
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
                        ? t('refineRetrying', { n: attempt + 1, max: REFINE_MAX_ATTEMPTS })
                        : t('refineAllFailed'),
                );
                if (attempt === REFINE_MAX_ATTEMPTS) {
                    throw new Error(t('refineAllFailed'));
                }
            }
        }
        throw new Error('Refine failed.'); // unreachable: the loop returns or throws
    };

    const loadSystemPrompt = async (): Promise<string> => {
        try {
            const response = await fetch("/system_prompt.txt");
            if (!response.ok) {
                throw new Error(`Failed to fetch system prompt: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error('[loadSystemPrompt Error]:', error);
            throw new Error(t('systemPromptLoadFailed'));
        }
    };

    return { isLoading, refineError, handleStartDesigning };
};
