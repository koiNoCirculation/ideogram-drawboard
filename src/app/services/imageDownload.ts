/**
 * Fetch an image URL and trigger the browser's save via a temporary
 * `<a download>` click (works for cross-origin hosts that send CORS
 * headers; the browser shows its native save dialog / download bar).
 */
export async function downloadImage(url: string, filename: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
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
