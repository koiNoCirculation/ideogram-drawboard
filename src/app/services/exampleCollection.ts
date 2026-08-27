import { RefinedPrompt } from '../types';
import { Design } from './designStore';
import { resolveImageRef, saveGeneratedImage } from './imageStore';

/**
 * One entry from the static example collection
 * (public/example_collection/example.json): the user's original one-line
 * prompt, the refined Ideogram 4.0 JSON prompt, and the generated image url.
 * The home page's default (Home) wall is populated from these.
 */
interface RawExampleEntry {
    prompt: string;
    jsonprompt: RefinedPrompt;
    url: string;
}

export interface ExampleEntry extends RawExampleEntry {
    /**
     * Id the example's image is stored under in the IndexedDB image store;
     * null when the image could not be persisted (the entry then gets no
     * wall tile and can't seed a design image).
     */
    imageId: string | null;
}

const EXAMPLE_COLLECTION_URL = '/example_collection/example.json';

/**
 * Fetch the example collection and persist each example image into the
 * IndexedDB image store under a stable id (the wall and the design page only
 * understand IDB refs). Any collection-level failure (network, non-2xx,
 * non-array payload) resolves to an empty list so the home wall shows its
 * empty state instead of crashing; a single image that fails to persist gets
 * imageId null (no tile) without affecting the others.
 */
export async function loadExampleCollection(): Promise<ExampleEntry[]> {
    let raw: unknown;
    try {
        const response = await fetch(EXAMPLE_COLLECTION_URL);
        if (!response.ok) return [];
        raw = await response.json();
    } catch (error) {
        console.error('[loadExampleCollection Error]:', error);
        return [];
    }
    if (!Array.isArray(raw)) return [];
    const entries = (raw as RawExampleEntry[]).filter(isRawExampleEntry);
    return Promise.all(entries.map((entry, i) => ensureImageId(entry, i)));
}

function isRawExampleEntry(value: any): value is RawExampleEntry {
    return !!value
        && typeof value.url === 'string' && value.url.length > 0
        && typeof value.prompt === 'string'
        && !!value.jsonprompt && typeof value.jsonprompt === 'object';
}

// Stable image-store id for an example, derived from its file name (the pngs
// are named design-<...>.png): the ~2MB base64 conversion then happens once
// per browser instead of on every home-page load (check-then-store).
function exampleImageId(url: string, index: number): string {
    const base = (url.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    return base ? `img-${base}` : `img-example-${index}`;
}

async function ensureImageId(entry: RawExampleEntry, index: number): Promise<ExampleEntry> {
    const id = exampleImageId(entry.url, index);
    if (await resolveImageRef(id)) return { ...entry, imageId: id };
    const saved = await saveGeneratedImage(entry.url, id);
    return { ...entry, imageId: saved };
}

// Baseline edge (px) used to turn an aspect ratio into a concrete canvas size,
// matching the home page's ratio inputs (longer side = 1024).
const SIZE_BASELINE = 1024;

/** Concrete canvas size for an aspect ratio ("W:H"); square/unknown -> 1024². */
export function sizeFromRatio(ratio: string | undefined): { width: number; height: number } {
    const [rw, rh] = (ratio ?? '').split(':').map(Number);
    if (!rw || !rh || rw <= 0 || rh <= 0) return { width: SIZE_BASELINE, height: SIZE_BASELINE };
    return rw >= rh
        ? { width: SIZE_BASELINE, height: Math.round(SIZE_BASELINE * (rh / rw)) }
        : { width: Math.round(SIZE_BASELINE * (rw / rh)), height: SIZE_BASELINE };
}

// Reuse the design id embedded in the example image filename (the pngs are
// named design-<...>.png); fall back to a positional id if the url has none.
function idFromUrl(url: string, index: number): string {
    const base = url.split('/').pop() ?? '';
    const id = base.replace(/\.[^.]+$/, '');
    return id || `example-${index}`;
}

/**
 * Present an example as a Design so the home wall (which renders Design[]) can
 * show it unchanged: the persisted image id is the single "generated" image
 * (empty when persistence failed), the original prompt becomes rawPrompt
 * (hover overlay), and the canvas size comes from the prompt's aspect ratio.
 */
export function exampleToDesign(entry: ExampleEntry, index: number): Design {
    return {
        id: idFromUrl(entry.url, index),
        prompt: entry.jsonprompt,
        images: entry.imageId ? [entry.imageId] : [],
        size: sizeFromRatio(entry.jsonprompt?.aspect_ratio),
        updatedAt: 0,
        rawPrompt: entry.prompt,
    };
}
