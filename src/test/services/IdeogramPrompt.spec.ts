import { expect, test } from '@jest/globals';
import { normalizePromptForIdeogram } from '../../app/services/IdeogramPrompt';
import { RefinedPrompt } from '../../app/types';

function base(data: Partial<NonNullable<RefinedPrompt['style_description']>> = {}): RefinedPrompt {
    return {
        aspect_ratio: '4:3',
        high_level_description: 'A test subject.',
        style_description: {
            aesthetics: 'moody, cinematic',
            lighting: 'soft rim light',
            medium: 'photograph',
            color_palette: ['#1A1A2E'],
            ...data,
        },
        compositional_deconstruction: {
            background: 'A plain backdrop.',
            elements: [],
        },
    };
}

test('exactly one of photo/art_style: both present + photo medium keeps photo', () => {
    const result = normalizePromptForIdeogram(base({
        photo: '35mm, f/1.4, bokeh',
        art_style: 'film noir illustration',
    }));
    expect(result.style_description?.photo).toBe('35mm, f/1.4, bokeh');
    expect(result.style_description?.art_style).toBeUndefined();
});

test('exactly one of photo/art_style: both present + non-photo medium keeps art_style', () => {
    const result = normalizePromptForIdeogram(base({
        medium: 'graphic_design',
        photo: '35mm, f/1.4, bokeh',
        art_style: 'vintage poster design',
    }));
    expect(result.style_description?.art_style).toBe('vintage poster design');
    expect(result.style_description?.photo).toBeUndefined();
});

test('only photo present: kept unchanged', () => {
    const result = normalizePromptForIdeogram(base({ photo: '85mm, f/2' }));
    expect(result.style_description?.photo).toBe('85mm, f/2');
    expect(result.style_description?.art_style).toBeUndefined();
});

test('only art_style present: kept unchanged', () => {
    const result = normalizePromptForIdeogram(base({
        medium: 'illustration',
        art_style: 'watercolor',
    }));
    expect(result.style_description?.art_style).toBe('watercolor');
    expect(result.style_description?.photo).toBeUndefined();
});

test('neither present + photo medium: a neutral photo default is filled in', () => {
    const result = normalizePromptForIdeogram(base({}));
    expect(result.style_description?.photo).toBeTruthy();
    expect(result.style_description?.art_style).toBeUndefined();
});

test('neither present + non-photo medium: art_style defaults to the medium', () => {
    const result = normalizePromptForIdeogram(base({ medium: 'painting' }));
    expect(result.style_description?.art_style).toBe('painting');
    expect(result.style_description?.photo).toBeUndefined();
});

test('key order follows the documented photo / non-photo sequences', () => {
    const photo = normalizePromptForIdeogram(base({ photo: '35mm' }));
    expect(Object.keys(photo.style_description!)).toEqual(['aesthetics', 'lighting', 'photo', 'medium', 'color_palette']);

    const art = normalizePromptForIdeogram(base({ medium: 'illustration', art_style: 'watercolor' }));
    expect(Object.keys(art.style_description!)).toEqual(['aesthetics', 'lighting', 'medium', 'art_style', 'color_palette']);
});

test('palette is uppercased, invalid entries dropped, capped at 16', () => {
    const many = Array.from({ length: 20 }, (_, i) => '#a1b2c3'.toUpperCase().replace('A1B2C3', i.toString(16).padStart(6, '0').toUpperCase()));
    const result = normalizePromptForIdeogram(base({ color_palette: ['#a1b2c3', 'not-a-hex', ...many] }));
    const palette = result.style_description?.color_palette ?? [];
    expect(palette).toHaveLength(16);
    expect(palette).toEqual(palette.map((c) => c.toUpperCase()));
    expect(palette[0]).toBe('#A1B2C3');
});

test('input is not mutated', () => {
    const input = base({ photo: '35mm', art_style: 'noir' });
    const original = JSON.stringify(input);
    normalizePromptForIdeogram(input);
    expect(JSON.stringify(input)).toBe(original);
});
