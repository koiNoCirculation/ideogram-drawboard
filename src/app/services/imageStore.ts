/**
 * Local persistence for generated images. Ideogram (especially the official
 * API) returns image URLs that expire, so right after a successful generation
 * the image is fetched and stored as a base64 data URI in IndexedDB under an
 * id; the design's `images` array holds that id. The id is the ONLY ref kind —
 * every image (generated or bundled example) lives in this store, and a ref
 * is resolved by looking the id up here.
 */
import { HttpError } from './requestError';

/** One persisted image. `uri` is a full `data:<mime>;base64,...` string. */
export interface StoredImage {
    id: string;
    uri: string;
    createdAt: number;
}

/**
 * Outcome of saveGeneratedImage. On success the caller gets the id the image
 * was stored under; on failure the error that caused it (an HttpError when a
 * non-2xx fetch answered, the raw error otherwise) — the UI layer classifies
 * it to decide between the network-error float and the local-storage line.
 */
export type SaveImageResult = { ok: true; id: string } | { ok: false; error: Error };

const DB_NAME = 'drawboard-images';
const DB_VERSION = 1;
const STORE = 'images';

/** Fresh image id (same shape as newDesignId in designStore.ts). */
export function newImageId(): string {
    return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolve a generated image url for fetching. The cf-worker CORS proxy
 * rewrites `data[].url` to a ROOT-RELATIVE path on the worker
 * (`/v1/ideogram-v4/image_proxy?url=…`); a browser would resolve that against
 * the APP's origin (the static host) — the wrong host when the image service
 * lives on another origin. Root-relative / relative urls are therefore joined
 * against the image service endpoint base (trailing slashes tolerated);
 * absolute http(s)/data: urls pass through. An EMPTY base ("Official" has no
 * host prefix — its requests resolve against the app's own origin) leaves the
 * url as-is for the browser to resolve against the page origin.
 */
export function resolveGeneratedImageUrl(url: string, endpointBase: string): string {
    if (/^(https?:|data:)/i.test(url)) return url;
    const base = endpointBase.replace(/\/+$/, '');
    if (!base) return url;
    try {
        return new URL(url, `${base}/`).toString();
    } catch {
        return url;
    }
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
 * Fetch `url`, convert it to a base64 data URI, and persist it in the image
 * store; resolves to the id it was stored under (a fresh random one when
 * `id` is omitted, the caller's id otherwise — so stable-id callers can
 * check-then-store without duplicating). On ANY failure (fetch/CORS/network,
 * non-2xx, IDB unavailable) resolves to { ok: false, error } — there is no
 * raw-URL fallback, a ref that can't be persisted doesn't exist. Never throws.
 */
export async function saveGeneratedImage(url: string, id?: string): Promise<SaveImageResult> {
    const imageId = id || newImageId();
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new HttpError(`Failed to fetch image: ${response.status}`, response.status);
        }
        const buf = await response.arrayBuffer();
        const contentType = (response.headers?.get?.('content-type') ?? '').split(';')[0].trim();
        const mime = contentType || 'image/png';
        const uri = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
        await putImage({ id: imageId, uri, createdAt: Date.now() });
        return { ok: true, id: imageId };
    } catch (error) {
        console.error('[saveGeneratedImage Error]:', error);
        return { ok: false, error: error as Error };
    }
}

/**
 * Resolve an image ref (an id into the image store) to its data URI. A
 * missing record or IDB error resolves to null (the caller renders an empty
 * placeholder) — never throws.
 */
export async function resolveImageRef(ref: string): Promise<string | null> {
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
