import { RefinedPrompt } from '../types';

/**
 * A saved design. The core payload follows the design-file framework:
 * `{ prompt, images }`. `id`/`size`/`updatedAt` are added so designs can be
 * re-opened (canvas size is not recoverable from the prompt alone) and listed
 * most-recent-first on the home page.
 */
export interface Design {
    id: string;
    prompt: RefinedPrompt;
    images: string[];
    size: { width: number; height: number };
    updatedAt: number;
}

const STORAGE_KEY = 'drawboard.designs';

/** All saved designs, most-recently-updated first. Empty when none are stored. */
export function loadDesigns(): Design[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return (parsed as Design[]).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
        console.error('Failed to load saved designs', e);
        return [];
    }
}

/** Find a single saved design by id. */
export function getDesign(id: string): Design | undefined {
    return loadDesigns().find((d) => d.id === id);
}

/**
 * Insert or update a design (matched by id) and persist the list. Returns the
 * updated, most-recent-first list so the caller can refresh its view.
 */
export function upsertDesign(design: Design): Design[] {
    const designs = loadDesigns();
    const idx = designs.findIndex((d) => d.id === design.id);
    if (idx === -1) designs.push(design);
    else designs[idx] = design;
    const sorted = [...designs].sort((a, b) => b.updatedAt - a.updatedAt);
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
        } catch (e) {
            console.error('Failed to persist saved designs', e);
        }
    }
    return sorted;
}
