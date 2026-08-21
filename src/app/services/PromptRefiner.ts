import { LlmProvider, getActiveLlmProfile, getLlmUrl, loadSettings } from './settings';

/**
 * Each OpenAI-compatible backend exposes reasoning/thinking behind a different
 * request field; these snippets turn it off (the caption rewrites are short
 * mechanical edits — thinking adds latency without quality). vLLM and SGLang
 * steer the chat template via top-level chat_template_kwargs (the SDK's
 * extra_body is merged into the request body; non-thinking templates ignore it).
 * Ollama is not in this table: its native /api/chat body disables thinking
 * with the top-level `think: false` flag instead (see chatCompletion).
 */
const DISABLE_REASONING: Record<Exclude<LlmProvider, 'Ollama'>, Record<string, unknown>> = {
    OpenAI: { reasoning_effort: 'none' },
    Google: { thinkingConfig: { thinkingBudget: 0 } },
    DeepSeek: { thinking: { type: 'disabled' } },
    GLM: { thinking: { type: 'disabled' } },
    Qwen: { enable_thinking: false },
    vLLM: { chat_template_kwargs: { enable_thinking: false } },
    SGLang: { chat_template_kwargs: { enable_thinking: false } },
};

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
async function chatCompletion(system_prompt: string, user_prompt: string): Promise<string> {
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

    const messages = [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt },
    ];
    // Ollama speaks its native /api/chat dialect (docs.ollama.com/api/chat)
    // instead of the OpenAI-compatible one: non-streaming, sampling controls
    // under `options`, and thinking disabled with the top-level `think` flag.
    const provider = settings.llmProvider;
    const isOllama = provider === 'Ollama';
    const body = isOllama
      ? {
          model: profile.name.trim(),
          messages,
          stream: false,
          think: false,
          options: { temperature: 1.0 },
        }
      : {
          model: profile.name.trim(),
          messages,
          temperature: 1.0,
          // Reasoning disabled per backend (see DISABLE_REASONING).
          ...DISABLE_REASONING[provider],
        };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${errorDetails}`);
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
 * @returns A promise that resolves to the LLM's content response.
 */
export async function refine(system_prompt: string, prompt: string, aspectRatio: string): Promise<string> {
  const userPrompt = `TARGET IMAGE ASPECT RATIO: ${aspectRatio} (width:height).\nUser idea: ${prompt}`;
  return chatCompletion(system_prompt, userPrompt);
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
