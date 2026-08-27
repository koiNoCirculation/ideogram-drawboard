import { expect, test } from '@jest/globals';
import { fileToDataUri } from '../../app/services/imageFile';

test('fileToDataUri: converts a PNG File to a data URI with its mime type', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([bytes], 'a.png', { type: 'image/png' });
    const uri = await fileToDataUri(file);
    expect(uri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
});

test('fileToDataUri: falls back to image/png when the File has no type', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'x');
    const uri = await fileToDataUri(file);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri.split(',')[1]).toBe(Buffer.from([1, 2, 3]).toString('base64'));
});

test('fileToDataUri: files larger than one base64 chunk round-trip byte-exact', async () => {
    // 3 full 0x8000 chunks + a remainder: exercises the chunked encoding.
    const bytes = new Uint8Array(0x8000 * 3 + 7).fill(7);
    const file = new File([bytes], 'big.jpg', { type: 'image/jpeg' });
    const uri = await fileToDataUri(file);
    expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true);
    const decoded = Buffer.from(uri.split(',')[1], 'base64');
    expect(Buffer.compare(decoded, Buffer.from(bytes)) === 0).toBe(true);
});
