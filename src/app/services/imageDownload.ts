import { HttpError } from './requestError';

/**
 * Fetch an image URL and trigger the browser's save via a temporary
 * `<a download>` click (works for cross-origin hosts that send CORS
 * headers; the browser shows its native save dialog / download bar).
 * Non-2xx throws an HttpError (typed with the status so the UI layer can
 * classify it); a network-level failure throws the browser's raw TypeError.
 */
export async function downloadImage(url: string, filename: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new HttpError(`Failed to download image: ${response.status}`, response.status);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Let the download start before the object URL is released.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
