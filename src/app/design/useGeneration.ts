import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { Design, upsertDesign } from '../services/designStore';
import { normalizePromptForIdeogram } from '../services/IdeogramPrompt';
import { resolveContradictionInBBox } from '../services/PromptRefiner';
import { getImageUrl, getMissingSettings, loadSettings } from '../services/settings';
import { RefinedPrompt, isEmptyElement } from '../types';

/**
 * Parse the LLM's rewritten caption, tolerating stray markdown fences or prose
 * around the JSON object (the prompt asks for bare JSON, but be defensive).
 * Throws if the response is not a usable caption.
 */
function parseRewrittenCaption(content: string): RefinedPrompt {
    const trimmed = content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error('The bbox-rewrite model did not return a JSON caption.');
    }
    const parsed: any = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed?.compositional_deconstruction?.elements)) {
        throw new Error('The rewritten caption is missing compositional_deconstruction.elements.');
    }
    return parsed as RefinedPrompt;
}

// Load the bbox-rewrite system prompt from the public assets directory.
async function loadRewriteSystemPrompt(): Promise<string> {
    try {
        const response = await fetch('/system_prompt_rewrite_adapt_bbox.txt');
        if (!response.ok) {
            throw new Error(`Failed to fetch system prompt: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        console.error('[loadRewriteSystemPrompt Error]:', error);
        throw new Error('Could not load the bbox-rewrite system prompt. Please ensure assets are correctly bundled.');
    }
}

/**
 * Image generation + saving: runs the on-demand bbox desc-rewrite, calls the
 * Ideogram-compatible service, manages the generated-image history, and
 * persists the current prompt + images as a design. Also owns the empty-element
 * red flash and the brief "Saved" confirmation timers.
 */
export function useGeneration(
    refinedData: RefinedPrompt | null,
    setRefinedData: Dispatch<SetStateAction<RefinedPrompt | null>>,
    canvasSize: { width: number; height: number },
    designId: string,
    bboxEditedRef: RefObject<boolean>,
) {
    // All generated image URLs, in generation order.
    const [images, setImages] = useState<string[]>([]);
    // Which generated image is currently shown on the canvas.
    const [viewIndex, setViewIndex] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    // When a generate attempt was blocked on empty elements, keep their boxes
    // highlighted (red) until the user fills them in.
    const [showEmptyHighlight, setShowEmptyHighlight] = useState(false);
    // Toggle driving the red border's blink; only animates during the flash.
    const [flashOn, setFlashOn] = useState(false);
    // Brief "Saved" confirmation shown after a successful save.
    const [showSaved, setShowSaved] = useState(false);
    const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up timers if the screen unmounts mid-blink / mid-save-flash.
    useEffect(() => () => {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }, []);

    // Blink the empty-element highlight for a few cycles, then settle on a
    // steady red border (showEmptyHighlight stays true until they're fixed).
    const startFlash = () => {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        let ticks = 0;
        const totalTicks = 6; // 3 full on/off cycles
        setFlashOn(true);
        flashTimerRef.current = setInterval(() => {
            ticks += 1;
            if (ticks >= totalTicks) {
                if (flashTimerRef.current) clearInterval(flashTimerRef.current);
                flashTimerRef.current = null;
                setFlashOn(true); // settle on the bright red border
            } else {
                setFlashOn((v) => !v);
            }
        }, 320);
    };

    // Rewrite element descs (to match the user-modified bboxes), then call the
    // local Ideogram-compatible service to generate the image.
    const handleGenerate = async () => {
        if (!refinedData || isGenerating) return;
        // The LLM (rewrite) and image endpoints come from Settings: refuse to
        // generate with a message naming whatever is still missing.
        const settings = loadSettings();
        const missing = getMissingSettings(settings);
        if (missing.length > 0) {
            setGenerateError(`Cannot generate — missing settings: ${missing.join(', ')}. Open Settings (gear icon) to configure them.`);
            return;
        }
        // No empty elements: a text element needs its text, an obj element its
        // description. They can be filled in via the right-click menu.
        const elements = refinedData.compositional_deconstruction.elements;
        const emptyIndex = elements.findIndex(isEmptyElement);
        if (emptyIndex !== -1) {
            const empty = elements[emptyIndex];
            const field = empty?.type === 'text' ? 'text' : 'description';
            setGenerateError(`Element ${emptyIndex + 1} is empty — right-click it on the canvas to edit its ${field}.`);
            // Point the user at the offending box(es) on the canvas.
            setShowEmptyHighlight(true);
            startFlash();
            return;
        }
        setIsGenerating(true);
        setGenerateError(null);
        try {
            // Only when the user actually moved or resized a box can descs be
            // at odds with bboxes — unedited designs skip the extra LLM call.
            let dataToGenerate = refinedData;
            if (bboxEditedRef.current) {
                // Resolve the contradiction between each element's desc and its
                // bbox (which the user moved or resized on the canvas).
                const systemPrompt = await loadRewriteSystemPrompt();
                const rewritten = parseRewrittenCaption(
                    await resolveContradictionInBBox(systemPrompt, JSON.stringify(refinedData)),
                );

                // The model is instructed to keep every field except desc, but
                // the bboxes on the canvas are the source of truth, so merge
                // only the rewritten descs back into the local caption and
                // send that.
                const elements = refinedData.compositional_deconstruction.elements.map((element, i) => {
                    const fix = rewritten.compositional_deconstruction.elements[i];
                    if (!fix || fix.type !== element.type || typeof fix.desc !== 'string' || !fix.desc) return element;
                    return { ...element, desc: fix.desc };
                });
                const resolvedData: RefinedPrompt = {
                    ...refinedData,
                    compositional_deconstruction: {
                        ...refinedData.compositional_deconstruction,
                        elements,
                    },
                };
                dataToGenerate = resolvedData;
                setRefinedData(resolvedData);
                // The descs now match the current bboxes; don't rewrite again
                // until the next box edit.
                bboxEditedRef.current = false;
            }
            console.log(dataToGenerate)
            const formData = new FormData();
            // The service expects json_prompt as a plain string field, not a file
            // upload. Normalize first so style_description carries exactly one
            // of photo/art_style, in the key order Ideogram 4.0 expects.
            formData.append('json_prompt', JSON.stringify(normalizePromptForIdeogram(dataToGenerate)));
            formData.append('response_type', 'url');
            formData.append('resolution', `${canvasSize.width}x${canvasSize.height}`);

            const imageKey = settings.imageSecretKey.trim();
            const headers: Record<string, string> = {};
            if (imageKey) headers['Api-Key'] = imageKey;

            const response = await fetch(getImageUrl(settings), {
                method: 'POST',
                headers,
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const result = await response.json();
            const url: string | undefined = result?.data?.[0]?.url;
            if (!url) {
                throw new Error('No image URL in response');
            }
            // Append to the history and switch the canvas to the new latest image.
            setImages((prev) => [...prev, url]);
            setViewIndex(images.length);
        } catch (error: any) {
            setGenerateError(error?.message ?? 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    // Persist the current prompt + generated images as a design (the design-file
    // framework: { prompt, images }).
    const handleSave = () => {
        if (!refinedData) return;
        const design: Design = {
            id: designId,
            prompt: normalizePromptForIdeogram(refinedData),
            images,
            size: { width: canvasSize.width, height: canvasSize.height },
            updatedAt: Date.now(),
        };
        upsertDesign(design);
        setShowSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setShowSaved(false), 1800);
    };

    // The image shown on the canvas: the one the user selected in the history
    // strip, defaulting to the most recently generated.
    const shownIndex = images.length === 0 ? -1 : Math.min(viewIndex, images.length - 1);
    const shownImage = shownIndex >= 0 ? images[shownIndex] : null;

    // When re-opening a saved design, restore its generated image history and
    // show the latest one on the canvas.
    const restoreImages = (imgs: string[]) => {
        if (Array.isArray(imgs) && imgs.length > 0) {
            setImages(imgs);
            setViewIndex(imgs.length - 1);
        }
    };

    return {
        images,
        viewIndex,
        setViewIndex,
        restoreImages,
        shownIndex,
        shownImage,
        isGenerating,
        generateError,
        showEmptyHighlight,
        flashOn,
        showSaved,
        handleGenerate,
        handleSave,
    };
}
