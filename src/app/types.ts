/**
 * The structured caption produced by the prompt-refining LLM and edited on the
 * design canvas. `compositional_deconstruction.elements` holds the objects and
 * text blocks the user can place by dragging/resizing bounding boxes.
 */
export interface RefinedPrompt {
    aspect_ratio: string;
    high_level_description: string;
    style_description?: {
        aesthetics?: string;
        lighting?: string;
        medium?: string;
        art_style?: string;
        photo?: string;
        color_palette?: string[];
    };
    compositional_deconstruction: {
        background: string;
        elements: Array<{
            type: 'obj' | 'text';
            /** Ideogram normalized bbox: [y_min, x_min, y_max, x_max] in 0-1000, top-left origin. */
            bbox?: [number, number, number, number];
            desc?: string;
            text?: string;
        }>;
    };
}

/** A single placeable element (object or text block) on the design canvas. */
export type CanvasElement = RefinedPrompt['compositional_deconstruction']['elements'][number];

/**
 * An element is "empty" when it has no content for the renderer to place:
 * a text element with no `text`, or an obj element with no `desc`.
 */
export function isEmptyElement(el: CanvasElement): boolean {
    const content = el.type === 'text' ? (el.text ?? '') : (el.desc ?? '');
    return content.trim() === '';
}
