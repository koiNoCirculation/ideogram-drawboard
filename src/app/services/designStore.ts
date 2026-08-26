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

/**
 * Navigation handoff for not-yet-saved designs: the refined LLM prompt can be
 * large enough to trip HTTP 431 (request header too large) when carried as a
 * URL query param, so the home page stashes it here keyed by design id and
 * navigates with the id alone. The design page reads it on load; the handoff
 * is kept (not consumed) so refresh / back-forward on an unsaved design still
 * resolves, and Save clears it so the saved design is the source of truth.
 */
export interface DesignHandoff {
    /** The raw LLM JSON string, parsed (defensively) by the design page. */
    promptData: string;
    size: { width: number; height: number };
}

const HANDOFF_KEY = 'drawboard.handoff';
/** Cap on how many pending handoffs are kept (oldest evicted first). */
const HANDOFF_LIMIT = 10;

/** Fresh design id (same format the design page used to generate on the fly). */
export function newDesignId(): string {
    return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readHandoffs(): Record<string, DesignHandoff> {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(HANDOFF_KEY) ?? '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeHandoffs(map: Record<string, DesignHandoff>) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.setItem(HANDOFF_KEY, JSON.stringify(map));
    } catch (e) {
        console.error('Failed to persist design handoff', e);
    }
}

/** Stash the not-yet-saved design payload so /design can load it by id alone. */
export function setDesignHandoff(id: string, handoff: DesignHandoff) {
    const map = readHandoffs();
    map[id] = handoff;
    // Object key order is insertion order: evict the oldest entries past the cap.
    const keys = Object.keys(map);
    while (keys.length > HANDOFF_LIMIT) {
        const oldest = keys.shift();
        if (oldest === undefined) break;
        delete map[oldest];
    }
    writeHandoffs(map);
}

/** Read the handoff for a design id (if any) without consuming it. */
export function getDesignHandoff(id: string): DesignHandoff | undefined {
    return readHandoffs()[id];
}

/** Drop the handoff once the design is saved (the store now owns the data). */
export function clearDesignHandoff(id: string) {
    const map = readHandoffs();
    if (!(id in map)) return;
    delete map[id];
    writeHandoffs(map);
}

// Set by the home page when it navigates into a design, so the design page's
// back button can tell a known previous page (the home page) from an unknown
// one (bare /design visit, fresh tab, external referrer). sessionStorage
// survives refresh, so the flag is still valid after a reload.
const FROM_HOME_KEY = 'drawboard.fromHome';

/** Record that this session navigated from the home page into a design. */
export function markNavigationFromHome() {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
        window.sessionStorage.setItem(FROM_HOME_KEY, '1');
    } catch (e) {
        // sessionStorage unavailable (private mode) — back falls back to home.
    }
}

/** True when the current session reached /design from the home page. */
export function cameFromHome(): boolean {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    try {
        return window.sessionStorage.getItem(FROM_HOME_KEY) === '1';
    } catch (e) {
        return false;
    }
}

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
