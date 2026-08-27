/**
 * Convert a dropped image File into a base64 data URI
 * (`data:<mime>;base64,…`) so it can be inlined into a multimodal LLM
 * message (OpenAI-compatible image_url part / Ollama images entry).
 */
export async function fileToDataUri(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    // Chunked base64 (same 32KB pattern as imageStore): spreading a whole
    // large Uint8Array into String.fromCharCode blows the argument stack.
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const mime = file.type || 'image/png';
    return `data:${mime};base64,${btoa(binary)}`;
}
