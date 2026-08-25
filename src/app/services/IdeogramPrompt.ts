import { RefinedPrompt } from '../types';

/** Ideogram 4.0 accepts at most 16 palette colors. */
const MAX_PALETTE_COLORS = 16;

/**
 * Normalizes a caption into the Ideogram 4.0 JSON prompt contract before it is
 * sent to the API (or persisted):
 *
 * - `style_description` contains EXACTLY ONE of `photo` / `art_style` (the two
 *   are mutually exclusive): when both are present, `medium` decides which
 *   wins (a photo medium keeps `photo`, anything else keeps `art_style`);
 *   when neither is present, the medium-appropriate key gets a neutral default.
 * - Keys are emitted in the documented order: photo captions
 *   `aesthetics, lighting, photo, medium, color_palette`; non-photo captions
 *   `aesthetics, lighting, medium, art_style, color_palette`.
 * - `color_palette` entries are uppercased, invalid hex values are dropped,
 *   and the list is capped at 16.
 *
 * Returns a new object; the input is never mutated.
 */
export function normalizePromptForIdeogram(data: RefinedPrompt): RefinedPrompt {
    const style = data.style_description;
    if (!style) return data;

    const aesthetics = (style.aesthetics ?? '').trim();
    const lighting = (style.lighting ?? '').trim();
    const medium = (style.medium ?? '').trim();
    const photo = (style.photo ?? '').trim();
    const artStyle = (style.art_style ?? '').trim();
    const mediumIsPhoto = medium.toLowerCase().includes('photo');

    // Pick the single photo/art_style value (exactly one must remain).
    let isPhotoMode: boolean;
    let photoValue = photo;
    let artValue = artStyle;
    if (photo && artStyle) {
        isPhotoMode = mediumIsPhoto;
    } else if (photo) {
        isPhotoMode = true;
    } else if (artStyle) {
        isPhotoMode = false;
    } else {
        // Neither present: the contract still requires one, so the
        // medium-appropriate key is kept (empty) rather than inventing a
        // default that would fight the prompt's own description.
        isPhotoMode = mediumIsPhoto;
    }

    const normalized: NonNullable<RefinedPrompt['style_description']> = {};
    if (aesthetics) normalized.aesthetics = aesthetics;
    if (lighting) normalized.lighting = lighting;
    if (isPhotoMode) {
        normalized.photo = photoValue;
        if (medium) normalized.medium = medium;
    } else {
        if (medium) normalized.medium = medium;
        normalized.art_style = artValue;
    }
    if (style.color_palette?.length) {
        normalized.color_palette = style.color_palette
            .filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c))
            .map((c) => c.toUpperCase())
            .slice(0, MAX_PALETTE_COLORS);
    }

    return { ...data, style_description: normalized };
}
