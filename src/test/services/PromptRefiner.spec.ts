import { expect, test } from '@jest/globals';
import { refine } from '../../services/PromptRefiner';

test('refine: a golden retriever on a skateboard', async () => {
    const result = await refine("a golden retriever on a skateboard", "4:3");
    console.log(result);
    expect(result).toBeDefined();
}, 30000); // Increase timeout to 30 seconds
