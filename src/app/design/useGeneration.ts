import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { clearDesignHandoff, Design, upsertDesign } from '../services/designStore';
import { normalizePromptForIdeogram } from '../services/IdeogramPrompt';
import { resolveContradictionInBBox } from '../services/PromptRefiner';
import { downloadImage } from '../services/imageDownload';
import { resolveImageRef, saveGeneratedImage } from '../services/imageStore';
import { getImageUrl, getMissingSettings, loadSettings } from '../services/settings';
import { getPublicAssetUrl } from '../services/publicAsset';
import { RefinedPrompt, isEmptyElement } from '../types';
import { useImageUris } from '../useImageUris';
import { withVisibleElementsOnly } from './canvas';
import { TranslationKey, useI18n } from '../../i18n';

// The UI-language lookup, so module-level helpers can surface translated
// error messages (they run from the hook, which is inside the provider).
type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * Parse the LLM's rewritten caption, tolerating stray markdown fences or prose
 * around the JSON object (the prompt asks for bare JSON, but be defensive).
 * Throws if the response is not a usable caption.
 */
function parseRewrittenCaption(content: string, t: T): RefinedPrompt {
    const trimmed = content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error(t('rewriteNoJson'));
    }
    const parsed: any = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed?.compositional_deconstruction?.elements)) {
        throw new Error(t('rewriteMissingElements'));
    }
    return parsed as RefinedPrompt;
}

// Load the bbox-rewrite system prompt from the public assets directory.
async function loadRewriteSystemPrompt(t: T): Promise<string> {
    try {
        const response = await fetch(getPublicAssetUrl('/system_prompt_rewrite_adapt_bbox.txt'));
        if (!response.ok) {
            throw new Error(`Failed to fetch system prompt: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        console.error('[loadRewriteSystemPrompt Error]:', error);
        throw new Error(t('rewritePromptLoadFailed'));
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
    rawPrompt: string,
) {
    const { t } = useI18n();
    // All generated image refs (ids into the IndexedDB image store — the only
    // ref kind), in generation order.
    const [images, setImages] = useState<string[]>([]);
    // Refs resolved to displayable URIs, aligned by index with `images`.
    const imageUris = useImageUris(images);
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
    // Downloading the current image (blob fetch in flight).
    const [isDownloading, setIsDownloading] = useState(false);
    // Transient red floating error (e.g. no image generated yet);
    // auto-dismisses after 5s.
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const downloadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up timers if the screen unmounts mid-blink / mid-save-flash.
    useEffect(() => () => {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        if (downloadErrorTimerRef.current) clearTimeout(downloadErrorTimerRef.current);
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
            setGenerateError(t('genMissingSettings', { items: missing.join(', ') }));
            return;
        }
        // No empty elements: a text element needs its text, an obj element its
        // description. They can be filled in via the right-click menu. Hidden
        // elements (layer-list eye off) don't reach the image, so they can't
        // block a generate; the index is the full-list position (layer-list row).
        const elements = refinedData.compositional_deconstruction.elements;
        const emptyIndex = elements.findIndex((el) => el.visible !== false && isEmptyElement(el));
        if (emptyIndex !== -1) {
            const empty = elements[emptyIndex];
            const field = empty?.type === 'text' ? t('fieldText') : t('fieldDescription');
            setGenerateError(t('genEmptyElement', { n: emptyIndex + 1, field }));
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
                const systemPrompt = await loadRewriteSystemPrompt(t);
                const rewritten = parseRewrittenCaption(
                    await resolveContradictionInBBox(systemPrompt, JSON.stringify(refinedData)),
                    t,
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
            const formData = new FormData();
            // The service expects json_prompt as a plain string field, not a file
            // upload. Normalize first so style_description carries exactly one
            // of photo/art_style, in the key order Ideogram 4.0 expects.
            // Hidden layers are excluded from the image (the visible flag is
            // DrawBoard UI state, not part of the Ideogram contract).
            formData.append('json_prompt', JSON.stringify(normalizePromptForIdeogram(withVisibleElementsOnly(dataToGenerate))));
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
                throw new Error(t('requestFailedStatus', { status: response.status }));
            }
            const result = await response.json();
            const url: string | undefined = result?.data?.[0]?.url;
            if (!url) {
                throw new Error(t('noImageUrl'));
            }
            // Persist the image as base64 in IndexedDB under a fresh random id
            // (official Ideogram URLs expire). Persistence is the only image
            // path: if it fails there is no ref to keep, so the image is
            // dropped with an error instead of a raw-URL fallback.
            const ref = await saveGeneratedImage(url);
            if (!ref) {
                setGenerateError(t('imageSaveFailed'));
                return;
            }
            // Append to the history and switch the canvas to the new latest image.
            setImages((prev) => [...prev, ref]);
            setViewIndex(images.length);
        } catch (error: any) {
            setGenerateError(error?.message ?? t('generationFailed'));
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
            // Keep the original prompt with the design so re-opening it can
            // show both prompt versions (Show Prompt dialog).
            rawPrompt,
        };
        upsertDesign(design);
        // The stored design is now the source of truth: drop the navigation
        // handoff so a re-open (by id) can't load the pre-edit payload.
        clearDesignHandoff(designId);
        setShowSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setShowSaved(false), 1800);
    };

    // The image shown on the canvas: the one the user selected in the history
    // strip, defaulting to the most recently generated.
    const shownIndex = images.length === 0 ? -1 : Math.min(viewIndex, images.length - 1);
    const shownImage = shownIndex >= 0 ? imageUris[shownIndex] ?? null : null;

    // Show the transient download error; a fresh failure restarts the 5s timer.
    const showDownloadError = (message: string) => {
        setDownloadError(message);
        if (downloadErrorTimerRef.current) clearTimeout(downloadErrorTimerRef.current);
        downloadErrorTimerRef.current = setTimeout(() => setDownloadError(null), 5000);
    };

    // Download the image currently shown on the canvas. Without a generated
    // image there is nothing to save — a transient red toast says so instead.
    const handleDownload = async () => {
        if (isDownloading) return;
        const ref = shownIndex >= 0 ? images[shownIndex] : null;
        if (!ref) {
            showDownloadError(t('noImageYet'));
            return;
        }
        setIsDownloading(true);
        setDownloadError(null);
        try {
            // Resolve the ref (id -> data URI); an id whose IndexedDB record is
            // gone has nothing to download yet either.
            const uri = await resolveImageRef(ref);
            if (!uri) {
                showDownloadError(t('noImageYet'));
                return;
            }
            await downloadImage(uri, `${designId}.png`);
        } catch (error: any) {
            showDownloadError(error?.message ?? t('downloadFailed'));
        } finally {
            setIsDownloading(false);
        }
    };

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
        imageUris,
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
        isDownloading,
        downloadError,
        handleDownload,
        handleGenerate,
        handleSave,
    };
}
