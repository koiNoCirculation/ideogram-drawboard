const API_URL = 'http://192.168.10.4:8000/v1/chat/completions';
const API_TOKEN = 'yiteng_liu_access';

/**
 * Calls the LLM to generate a structured caption for an image description.
 *
 * @param system_prompt - The system prompt
 * @param prompt - The user's natural language idea for the image.
 * @param aspectRatio - The target aspect ratio in W:H format (e.g., "16:9").
 * @returns A promise that resolves to the LLM's content response.
 */
export async function refine(system_prompt: string, prompt: string, aspectRatio: string): Promise<string> {
  try {
    // 1. Load the system prompt from the assets directory

    // 2. Construct the user prompt using the specified template
    const userPrompt = `TARGET IMAGE ASPECT RATIO: ${aspectRatio} (width:height).\nUser idea: ${prompt}`;

    // 3. Perform the fetch request to the OpenAI-compatible endpoint
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/Gemma-4-26B-A4B-NVFP4',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 1.0,
      }),
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${errorDetails}`);
    }

    const data = await response.json();

    // 4. Validate and return the response content
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error('Received an unexpected response structure from the LLM API.');
    }
  } catch (error) {
    console.error('[refine Error]:', error);
    throw error;
  }
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
  try {
    // The JSON caption is the user message; the rewrite contract lives in the
    // system prompt, so send the caption verbatim.
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/Gemma-4-26B-A4B-NVFP4',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: prompt },
        ],
        temperature: 1.0,
      }),
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${errorDetails}`);
    }

    const data = await response.json();

    // Validate and return the response content
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error('Received an unexpected response structure from the LLM API.');
    }
  } catch (error) {
    console.error('[resolveContradictionInBBox Error]:', error);
    throw error;
  }
}

