/**
 * Local persistence for generated images. Ideogram (especially the official
 * API) returns image URLs that expire, so right after a successful generation
 * the image is fetched and stored as a base64 data URI in IndexedDB under a
 * fresh random id; the design's `images` array holds that id. Values that
 * already look like URLs (legacy designs, or entries that fell back to the raw
 * URL when the base64 conversion failed) are passed through untouched when
 * resolving.
 */

/** One persisted image. `uri` is a full `data:<mime>;base64,...` string. */
export interface StoredImage {
    id: string;
    uri: string;
    createdAt: number;
}

const DB_NAME = 'drawboard-images';
const DB_VERSION = 1;
const STORE = 'images';

/** Fresh image id (same shape as newDesignId in designStore.ts). */
export function newImageId(): string {
    return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** True for values already directly usable as an <Image> uri. */
export function isDirectUri(ref: string): boolean {
    return /^(https?|data):/i.test(ref);
}

// Singleton open promise; cleared on failure/close so a transient error
// (or a missing indexedDB at module-eval time) doesn't poison later opens.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB is not available'));
    }
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onclose = () => {
                dbPromise = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            dbPromise = null;
            reject(request.error ?? new Error('Failed to open the image store'));
        };
        request.onblocked = () => {
            dbPromise = null;
            reject(new Error('Opening the image store was blocked'));
        };
    });
    return dbPromise;
}

/**
 * Encode an ArrayBuffer as base64. Chunked (String.apply over 32KB blocks) so
 * large images don't blow the argument-spread stack limit.
 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

async function putImage(image: StoredImage): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(image);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to store the image'));
    });
}

/**
 * Fetch `url`, convert it to a base64 data URI, and persist it under a fresh
 * random id; returns the id. On ANY failure (fetch/CORS/network, non-2xx,
 * IDB unavailable) the raw `url` is returned instead, so the image still
 * displays (albeit with the service's own expiry). Never throws.
 */
export async function saveGeneratedImage(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const buf = await response.arrayBuffer();
        const contentType = (response.headers?.get?.('content-type') ?? '').split(';')[0].trim();
        const mime = contentType || 'image/png';
        const uri = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
        const id = newImageId();
        await putImage({ id, uri, createdAt: Date.now() });
        return id;
    } catch (error) {
        // Fall back to the raw URL: it may expire with the service, but the
        // generation flow itself must never fail because of local storage.
        console.error('[saveGeneratedImage Error]:', error);
        return url;
    }
}

/**
 * Resolve a design image ref to a displayable uri: URL-like values pass
 * through as-is (legacy / fallback entries); anything else is looked up in
 * the image store. Missing record or IDB error resolves to null (the caller
 * renders an empty placeholder) — never throws.
 */
export async function resolveImageRef(ref: string): Promise<string | null> {
    if (isDirectUri(ref)) return ref;
    try {
        const db = await openDb();
        const record: StoredImage | undefined = await new Promise((resolve, reject) => {
            const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(ref);
            request.onsuccess = () => resolve(request.result as StoredImage | undefined);
            request.onerror = () => reject(request.error ?? new Error('Failed to read the image'));
        });
        return record && typeof record.uri === 'string' && record.uri ? record.uri : null;
    } catch (error) {
        console.error('[resolveImageRef Error]:', error);
        return null;
    }
}
