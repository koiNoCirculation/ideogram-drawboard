import { expect, test } from '@jest/globals';
import { refine } from '../../app/services/PromptRefiner';

async function loadSystemPrompt() {
    try {
        const fs = require('fs');
        return fs.readFileSync('public/system_prompt.txt', 'utf8');
    } catch (error) {
        console.error('[loadSystemPrompt Error]:', error);
        throw new Error(`Could not load system prompt. Please ensure assets are correctly bundled.`);
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
