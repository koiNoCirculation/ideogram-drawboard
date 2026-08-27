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
 * settings, refine with retries on malformed JSON, stash the refined prompt
 * in the navigation handoff and push /design?id=...
 *
 * Every LLM-side failure — missing settings, an unreachable/misconfigured
 * endpoint (fetch/HTTP error), or malformed JSON on every attempt — is
 * reported as a RED error line above the prompt bar: "retrying" notices are
 * transient (auto-dismiss after 5s), final errors persist until the next
 * submit attempt. (Alert.alert is a no-op on web, so the inline red line is
 * the only visible feedback.)
 *
 * Returns the loading flag, the current refine error and the button handler.
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
    // Red error line above the prompt bar (null = hidden).
    const [refineError, setRefineError] = useState<string | null>(null);
    const refineErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Show the refine error. Transient ones (a retry is still in flight)
    // auto-dismiss after 5s; final failures persist until the next submit
    // attempt — a misconfigured endpoint won't fix itself in 5s. A fresh
    // failure restarts the timer.
    const showRefineError = (message: string, transient = true) => {
        setRefineError(message);
        if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current);
        refineErrorTimer.current = transient
            ? setTimeout(() => setRefineError(null), 5000)
            : null;
    };

    // Hide the error line and cancel any pending auto-dismiss (a new submit
    // attempt starts clean).
    const clearRefineError = () => {
        setRefineError(null);
        if (refineErrorTimer.current) {
            clearTimeout(refineErrorTimer.current);
            refineErrorTimer.current = null;
        }
    };

    useEffect(() => {
        return () => { if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current); };
    }, []);

    const handleStartDesigning = async () => {
        // A new attempt starts clean: hide any previous error line.
        clearRefineError();
        if (!prompt.trim()) {
            Alert.alert(t('errorTitle'), t('promptRequired'));
            return;
        }
        // The LLM rewrite needs a configured provider: name, a credential for
        // preset vendors, and an endpoint for self-hosted backends.
        const missingLlm = getMissingSettings(loadSettings()).filter((m) => m.startsWith('LLM'));
        if (missingLlm.length > 0) {
            // Red error line (Alert.alert is a no-op on web) listing the
            // missing items; no LLM request is sent.
            showRefineError(t('missingSettingsAlert', { items: missingLlm.join(', ') }), false);
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
            // Misconfigured/unreachable endpoint, HTTP error or every JSON
            // retry failed: keep the red error line visible until the next
            // submit attempt (no auto-dismiss).
            showRefineError(error.message || t('refineFailedAlert'), false);
        } finally {
            setIsLoading(false);
        }
    };

    // Refine the prompt. The LLM can answer with malformed JSON (temperature
    // 1.0): parse each attempt, and on failure show an error line (transient
    // while retries remain, persistent after the final one) and retry,
    // giving up with an error after REFINE_MAX_ATTEMPTS.
    const refineWithRetry = async (systemPrompt: string, ratioString: string): Promise<string> => {
        for (let attempt = 1; attempt <= REFINE_MAX_ATTEMPTS; attempt++) {
            const raw = await refine(systemPrompt, prompt, ratioString);
            try {
                JSON.parse(raw);
                return raw;
            } catch {
                const last = attempt === REFINE_MAX_ATTEMPTS;
                // "Retrying" is transient (5s); the final message persists —
                // the catch in handleStartDesigning re-shows it after the
                // throw.
                showRefineError(
                    last
                        ? t('refineAllFailed')
                        : t('refineRetrying', { n: attempt + 1, max: REFINE_MAX_ATTEMPTS }),
                    !last,
                );
                if (last) {
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
