import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { downloadImage } from '../../app/services/imageDownload';

const PNG_BYTES = 'fake-png-bytes';

// jest-expo (RN-web) provides window but no document / URL object-URL API;
// stub the minimal surface downloadImage uses.
let anchor: any;
let appendChild: jest.Mock;

beforeEach(() => {
    anchor = { href: '', download: '', click: jest.fn(), remove: jest.fn() };
    appendChild = jest.fn();
    (global as any).document = {
        createElement: (tag: string) => (tag === 'a' ? anchor : {}),
        body: { appendChild },
    };
    (URL as any).createObjectURL = jest.fn(() => 'blob:mock-object-url');
    (URL as any).revokeObjectURL = jest.fn();
    (global as any).fetch = jest.fn(() =>
        Promise.resolve({
            ok: true,
            status: 200,
            blob: () => Promise.resolve(new Blob([PNG_BYTES], { type: 'image/png' })),
        }),
    );
});

afterEach(() => {
    delete (global as any).document;
    delete (URL as any).createObjectURL;
    delete (URL as any).revokeObjectURL;
    jest.restoreAllMocks();
});

test('downloadImage: fetches the URL and triggers the browser download via an <a download> click', async () => {
    await downloadImage('http://images.test/pic.png', 'design-abc.png');

    expect((global as any).fetch).toHaveBeenCalledWith('http://images.test/pic.png');
    // The clicked anchor points at the blob of the fetched bytes, with the
    // requested file name — this is what makes the browser save the image.
    expect((URL as any).createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe('blob:mock-object-url');
    expect(anchor.download).toBe('design-abc.png');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalled();
});

test('downloadImage: rejects when the fetch fails, without triggering a download', async () => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }));

    await expect(downloadImage('http://images.test/missing.png', 'x.png')).rejects.toThrow('Failed to download image: 500');

    expect(anchor.click).not.toHaveBeenCalled();
});
