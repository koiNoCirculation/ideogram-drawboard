import { HttpError } from './requestError';
import { getActiveLlmProfile, getLlmUrl, loadSettings } from './settings';

/**
 * One OpenAI-compatible chat completion against the LLM configured in
 * Settings (gear icon). Endpoint, credential and model name all come from
 * localStorage; the endpoint is the vendor's OpenAI-compatible base for preset
 * providers and the user-provided base for self-hosted backends.
 *
 * @param system_prompt - The system prompt
 * @param user_prompt - The user message
 * @returns A promise that resolves to the LLM's content response.
 */
// One chat message. `content` is a plain string, or (OpenAI-compatible
// multimodal) an array of text / image_url parts; `images` is Ollama's
// sibling raw-base64 payload list.
type ChatMessage = {
  role: string;
  content: string | Array<Record<string, unknown>>;
  images?: string[];
};

async function chatCompletion(system_prompt: string, user_prompt: string, images?: string[]): Promise<string> {
  try {
    const settings = loadSettings();
    // The active provider's profile (endpoint/credential/model are kept
    // separately per provider, so switching providers doesn't clobber them).
    const profile = getActiveLlmProfile(settings);
    const url = getLlmUrl(settings);
    const key = profile.secretKey.trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) {
      // Google's OpenAI-compatible endpoint authenticates via x-goog-api-key;
      // the other providers use the standard Bearer header.
      if (settings.llmProvider === 'Google') headers['x-goog-api-key'] = key;
      else headers['Authorization'] = `Bearer ${key}`;
    }

    const isOllama = settings.llmProvider === 'Ollama';
    const hasImages = !!images && images.length > 0;
    // Reference images (base64 data URIs). OpenAI-compatible backends (the
    // vLLM "image inputs" format) take a content ARRAY: one text part plus
    // one image_url part per image. Ollama's native /api/chat keeps a string
    // content and carries the images separately as RAW base64 (no data-URI
    // prefix) in a sibling `images` array. Without images the user message
    // stays a plain string (non-vision backends).
    const userMessage: ChatMessage = isOllama
      ? hasImages
        ? { role: 'user', content: user_prompt, images: images.map((u) => u.split(',')[1] ?? u) }
        : { role: 'user', content: user_prompt }
      : hasImages
        ? {
          role: 'user',
          content: [
            { type: 'text', text: user_prompt },
            ...images.map((u) => ({ type: 'image_url', image_url: { url: u } })),
          ],
        }
        : { role: 'user', content: user_prompt };
    const messages: ChatMessage[] = [
      { role: 'system', content: system_prompt },
      userMessage,
    ];
    // Ollama speaks its native /api/chat dialect (docs.ollama.com/api/chat)
    // instead of the OpenAI-compatible one: non-streaming, sampling controls
    // under `options`. No reasoning fields are sent — every backend runs with
    // its own thinking/reasoning mode enabled.
    const body = isOllama
      ? {
          model: profile.name.trim(),
          messages,
          stream: false,
          options: { temperature: 1.0 },
        }
      : {
          model: profile.name.trim(),
          messages,
          temperature: 1.0,
        };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      // Typed with the status so the UI layer (requestError) can classify
      // 401/403 vs 404 vs 5xx for the user; the raw details stay in the
      // message for the console, never for the user.
      throw new HttpError(`LLM API Error (${response.status}): ${errorDetails}`, response.status);
    }

    const data = await response.json();

    // Validate and return the response content. Ollama answers with
    // { message: { content } }; the OpenAI-compatible backends with
    // { choices: [{ message: { content } }] }.
    const content = isOllama ? data?.message?.content : data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.length > 0) {
      return content;
    } else {
      throw new Error('Received an unexpected response structure from the LLM API.');
    }
  } catch (error) {
    console.error('[chatCompletion Error]:', error);
    throw error;
  }
}

/**
 * Calls the LLM to generate a structured caption for an image description.
 *
 * @param system_prompt - The system prompt
 * @param prompt - The user's natural language idea for the image.
 * @param aspectRatio - The target aspect ratio in W:H format (e.g. "16:9").
 * @param images - Optional reference images (base64 data URIs) the LLM should
 *   take into account when refining the idea (multimodal input, see the
 *   vLLM "image inputs" docs).
 * @returns A promise that resolves to the LLM's content response.
 */
export async function refine(system_prompt: string, prompt: string, aspectRatio: string, images?: string[]): Promise<string> {
  const userPrompt = `TARGET IMAGE ASPECT RATIO: ${aspectRatio} (width:height).\nUser idea: ${prompt}`;
  return chatCompletion(system_prompt, userPrompt, images);
}

/**
 * Calls the LLM to resolve contradictions between element bboxes and their
 * descriptions (e.g. after the user moved or resized a bbox on the canvas).
 *
 * @param system_prompt - The system prompt (public/system_prompt_rewrite_adapt_bbox.txt).
 * @param prompt - The structured JSON caption with the user-modified bboxes.
 * @returns A promise that resolves to the LLM's rewritten caption (a JSON string).
 */
export async function resolveContradictionInBBox(system_prompt: string, prompt: string): Promise<string> {
  // The JSON caption is the user message; the rewrite contract lives in the
  // system prompt, so send the caption verbatim.
  return chatCompletion(system_prompt, prompt);
}
