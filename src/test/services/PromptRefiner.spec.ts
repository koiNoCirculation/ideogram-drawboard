import { expect, test } from '@jest/globals';
import { refine, resolveContradictionInBBox } from '../../app/services/PromptRefiner';

// Pin the configured LLM (the service reads it from localStorage at call
// time; the jest environment has none) to the legacy test endpoint. The mock
// is mutable so individual tests can switch the provider (which only swaps
// the active per-provider profile).
const mockSettings = {
    llmProvider: 'vLLM' as string,
    llmProfiles: {
        OpenAI: { endpoint: '', secretKey: '', name: '' },
        Google: { endpoint: '', secretKey: '', name: '' },
        DeepSeek: { endpoint: '', secretKey: '', name: '' },
        GLM: { endpoint: '', secretKey: '', name: '' },
        Qwen: { endpoint: '', secretKey: '', name: '' },
        vLLM: { endpoint: 'http://192.168.10.4:8000/v1', secretKey: 'yiteng_liu_access', name: 'nvidia/Gemma-4-26B-A4B-NVFP4' },
        SGLang: { endpoint: '', secretKey: '', name: '' },
        Ollama: { endpoint: '', secretKey: '', name: '' },
    },
    imageProvider: 'Custom',
    imageEndpoint: 'http://127.0.0.1:8000',
    imageSecretKey: '',
};
jest.mock('../../app/services/settings', () => ({
    ...jest.requireActual('../../app/services/settings'),
    getLlmUrl: () => 'http://192.168.10.4:8000/v1/chat/completions',
    loadSettings: () => mockSettings,
}));

async function loadSystemPrompt() {
    try {
        const fs = require('fs');
        return fs.readFileSync('public/system_prompt.txt', 'utf8');
    } catch (error) {
        console.error('[loadSystemPrompt Error]:', error);
        throw new Error(`Could not load system prompt. Please ensure assets are correctly bundled.`);
    }
}

function loadFixture(path: string): string {
    try {
        const fs = require('fs');
        return fs.readFileSync(path, 'utf8');
    } catch (error) {
        console.error('[loadFixture Error]:', error);
        throw new Error(`Could not load fixture ${path}. Please ensure the file exists.`);
    }
}
test('refine: A lone sailboat on calm water at golden hour.', async () => {
    const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'http://192.168.10.4:8000/v1/chat/completions',
        json: async () => ({
            choices: [{
                message: {
                    content: `{
   "high_level_description":"A lone sailboat on calm water at golden hour.",
   "style_description":{
      "aesthetics":"serene, warm, golden hour",
      "lighting":"golden hour backlighting, warm atmospheric haze",
      "photo":"wide angle, f/8, long exposure",
      "medium":"photograph",
      "color_palette":[
         "#FF6B35",
         "#F7C59F",
         "#004E89",
         "#1A659E",
         "#2B2D42"
      ]
   },
   "compositional_deconstruction":{
      "background":"A calm ocean stretching to a low horizon, sky washed in orange and pink with thin wisps of cloud.",
      "elements":[
         {
            "type":"obj",
            "desc":"A single sailboat with a white triangular sail, silhouetted against the setting sun."
         }
      ]
   }
}` }
            }]
        }),
        text: async () => 'success',
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
    const result = await refine(await loadSystemPrompt(), "A lone sailboat on calm water at golden hour.", "4:3");
    console.log(result);
    expect(result).toBeDefined();
    fetchSpy.mockRestore();

}, 30000); // Increase timeout to 30 seconds

test('resolveContradictionInBBox: sends the system prompt and JSON caption, returns the rewritten caption', async () => {
    // A plausible rewritten caption: same structure/bboxes as the fixture,
    // with the descs adjusted to the (user-moved) bbox positions.
    const rewritten = {
        high_level_description: "A bold event poster for a jazz night called 'Blue Note Sessions' at The Velvet Room, Saturday August 9th.",
        style_description: {
            aesthetics: "moody, retro, sophisticated, 1960s jazz club aesthetic",
            lighting: "dramatic, deep shadows, warm spotlight glow",
            medium: "graphic_design",
            art_style: "vintage poster design, textured paper, bold typography, muted color palette with warm accents",
            color_palette: ["#1A1A2E", "#16213E", "#E8C97A", "#D4A843", "#F5F0E8", "#8B4513"]
        },
        compositional_deconstruction: {
            background: "Deep navy and near-black background with subtle aged paper texture and faint horizontal grain lines.",
            elements: [
                {
                    type: "obj",
                    bbox: [150, 200, 650, 800],
                    desc: "A silhouetted jazz trumpeter in side profile, mid-performance, instrument raised, positioned in the left half of the poster. Warm golden spotlight illuminates from above, casting dramatic shadows. Stylized, slightly abstract illustration style."
                },
                {
                    type: "text",
                    bbox: [30, 50, 140, 950],
                    text: "BLUE NOTE SESSIONS",
                    desc: "Large bold all-caps serif headline in warm golden-yellow, spanning the full width near the top of the poster."
                },
                {
                    type: "text",
                    bbox: [660, 100, 760, 900],
                    text: "Live jazz every Saturday night",
                    desc: "Medium-weight italic serif subheading in off-white, placed below the headline in the middle of the poster."
                },
                {
                    type: "text",
                    bbox: [820, 200, 900, 800],
                    text: "THE VELVET ROOM",
                    desc: "Smaller all-caps sans-serif venue name in warm gold, centered near the bottom of the poster."
                },
                {
                    type: "text",
                    bbox: [900, 300, 970, 700],
                    text: "SAT · AUGUST 9",
                    desc: "Small light-weight serif date text in off-white, in the bottom-right corner of the poster."
                }
            ]
        }
    };
    const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'http://192.168.10.4:8000/v1/chat/completions',
        json: async () => ({
            choices: [{ message: { content: JSON.stringify(rewritten) } }]
        }),
        text: async () => 'success',
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
    const systemPrompt = loadFixture('public/system_prompt_rewrite_adapt_bbox.txt');
    const caption = JSON.parse(loadFixture('ideogram_bbox.json'));
    const result = await resolveContradictionInBBox(systemPrompt, JSON.stringify(caption));
    console.log(result);
    expect(result).toBeDefined();
    // The request must carry the rewrite system prompt and the JSON caption
    // itself (no "User idea:" wrapper) as the user message.
    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    expect(call[0]).toBe('http://192.168.10.4:8000/v1/chat/completions');
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.messages[0]).toEqual({ role: 'system', content: systemPrompt });
    expect(body.messages[1]).toEqual({ role: 'user', content: JSON.stringify(caption) });
    // The LLM content is passed through unchanged.
    expect(result).toBe(JSON.stringify(rewritten));
    fetchSpy.mockRestore();
}, 30000);

test('resolveContradictionInBBox: rejects when the LLM API returns an error status', async () => {
    const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
        text: async () => 'boom',
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
    await expect(
        resolveContradictionInBBox('system', '{"compositional_deconstruction":{"elements":[]}}')
    ).rejects.toThrow('LLM API Error (500): boom');
    fetchSpy.mockRestore();
});

test('refine: sends no reasoning/thinking fields (thinking stays enabled)', async () => {
    const ok = {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
        text: async () => 'success',
    };
    for (const provider of ['OpenAI', 'Google', 'DeepSeek', 'GLM', 'Qwen', 'vLLM', 'SGLang']) {
        mockSettings.llmProvider = provider;
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok as any);
        await refine('system', 'idea', '1:1');
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.thinkingConfig).toBeUndefined();
        expect(body.thinking).toBeUndefined();
        expect(body.enable_thinking).toBeUndefined();
        expect(body.chat_template_kwargs).toBeUndefined();
        fetchSpy.mockRestore();
    }
    // Ollama's native body: non-streaming, temperature under options, no think flag.
    const okOllama = {
        ok: true,
        status: 200,
        json: async () => ({ message: { role: 'assistant', content: '{}' } }),
        text: async () => 'success',
    };
    mockSettings.llmProvider = 'Ollama';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okOllama as any);
    await refine('system', 'idea', '1:1');
    const ollamaBody = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(ollamaBody.stream).toBe(false);
    expect(ollamaBody.think).toBeUndefined();
    expect(ollamaBody.options).toEqual({ temperature: 1.0 });
    mockSettings.llmProvider = 'vLLM';
    fetchSpy.mockRestore();
});

test('refine: with reference images, sends a multimodal content array (text + image_url data URIs)', async () => {
    const ok = {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
        text: async () => 'success',
    };
    const img1 = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
    const img2 = `data:image/jpeg;base64,${Buffer.from('jpg-bytes').toString('base64')}`;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok as any);
    await refine('system', 'an idea', '16:9', [img1, img2]);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    // vLLM "image inputs" format: content is an array — the text part first,
    // then one image_url part per reference image (data URIs verbatim).
    const content = body.messages[1].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({
        type: 'text',
        text: 'TARGET IMAGE ASPECT RATIO: 16:9 (width:height).\nUser idea: an idea',
    });
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: img1 } });
    expect(content[2]).toEqual({ type: 'image_url', image_url: { url: img2 } });
    fetchSpy.mockRestore();
});

test('refine: without reference images, the user message stays a plain string', async () => {
    const ok = {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
        text: async () => 'success',
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok as any);
    await refine('system', 'an idea', '16:9');
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(typeof body.messages[1].content).toBe('string');
    fetchSpy.mockRestore();
});

test('refine (Ollama): reference images ride as raw base64 in a sibling `images` array', async () => {
    const okOllama = {
        ok: true,
        status: 200,
        json: async () => ({ message: { role: 'assistant', content: '{}' } }),
        text: async () => 'success',
    };
    const b64 = Buffer.from('raw-ollama-bytes').toString('base64');
    mockSettings.llmProvider = 'Ollama';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okOllama as any);
    await refine('system', 'idea', '1:1', [`data:image/png;base64,${b64}`]);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    // Ollama's native /api/chat: string content + raw base64 (no data-URI
    // prefix) in the sibling images array.
    expect(body.messages[1].content).toBe('TARGET IMAGE ASPECT RATIO: 1:1 (width:height).\nUser idea: idea');
    expect(body.messages[1].images).toEqual([b64]);
    mockSettings.llmProvider = 'vLLM';
    fetchSpy.mockRestore();
});

test('resolveContradictionInBBox: rejects on an unexpected response structure', async () => {
    const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ choices: [] }),
        text: async () => 'success',
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
    await expect(
        resolveContradictionInBBox('system', '{"compositional_deconstruction":{"elements":[]}}')
    ).rejects.toThrow('Received an unexpected response structure from the LLM API.');
    fetchSpy.mockRestore();
});
