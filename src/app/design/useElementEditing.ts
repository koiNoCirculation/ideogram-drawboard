import { Dispatch, RefObject, SetStateAction, useState } from 'react';
import { CanvasElement, RefinedPrompt } from '../types';
import { DEFAULT_TEXT_FONT_SIZE } from './constants';

export type EditField = 'desc' | 'text';
export type FontOpt = { size: string; font: string; bold: boolean; italic: boolean };

/**
 * Right-click context menu + element field editor (desc / text, with the
 * text-only font options) + element deletion. `extra_fontoption` stores only
 * the user's explicitly-changed (non-default) keys, so the prompt's own
 * default font description is never overridden.
 */
export function useElementEditing(
    refinedData: RefinedPrompt | null,
    setRefinedData: Dispatch<SetStateAction<RefinedPrompt | null>>,
    recordAction: () => void,
    bboxEditedRef: RefObject<boolean>,
) {
    // Right-click context menu on an element box: its index and viewport position.
    const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
    // Element field editor dialog: which element and which field (desc | text).
    const [editing, setEditing] = useState<{ index: number; field: EditField } | null>(null);
    // The value being edited in the dialog's input.
    const [draft, setDraft] = useState('');
    // Font options of the element being edited. `size` is kept as raw input text.
    const [fontOpt, setFontOpt] = useState<FontOpt>({ size: String(DEFAULT_TEXT_FONT_SIZE), font: '', bold: false, italic: false });
    // Whether the font-size preset dropdown is open.
    const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

    // Right-click an element box: open the context menu at the cursor,
    // clamped so the menu stays inside the viewport.
    const openContextMenu = (index: number, e: any) => {
        // Suppress the browser's native context menu.
        e?.preventDefault?.();
        e?.nativeEvent?.preventDefault?.();
        const point = e?.nativeEvent ?? e ?? {};
        const element = refinedData?.compositional_deconstruction.elements[index];
        const itemH = 36;
        const menuW = 180;
        // Edit description (+ Edit text for text elements) plus Delete.
        const itemCount = (element?.type === 'text' ? 2 : 1) + 1;
        const menuH = 12 + itemH * itemCount + 10;
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        setContextMenu({
            index,
            x: Math.min(Math.max(point.clientX ?? 0, 8), vw - menuW - 8),
            y: Math.min(Math.max(point.clientY ?? 0, 8), vh - menuH - 8),
        });
    };

    // Open the edit dialog for the field of the context-menu target element.
    const openEditor = (field: EditField) => {
        if (!contextMenu) return;
        const { index } = contextMenu;
        const element = refinedData?.compositional_deconstruction.elements[index];
        setContextMenu(null);
        if (!element) return;
        setDraft(field === 'desc' ? (element.desc ?? '') : (element.text ?? ''));
        // Seed the font options from the element's existing extra_fontoption
        // (defaults = the plain canvas look) and close the size preset list.
        const fo = element.extra_fontoption;
        setFontOpt({
            size: String(fo?.size ?? DEFAULT_TEXT_FONT_SIZE),
            font: fo?.font ?? '',
            bold: fo?.bold ?? false,
            italic: fo?.italic ?? false,
        });
        setSizeMenuOpen(false);
        setEditing({ index, field });
    };

    // Save the dialog's draft back into the element and close the dialog.
    const saveEdit = () => {
        if (!editing) return;
        const value = draft.trim();
        if (!value) return;
        const { index, field } = editing;
        recordAction();
        // A font-option change alters the text element's rendering, so the
        // caption needs an LLM rewrite at generate time: re-arm the rewrite
        // whenever the stored extra_fontoption actually changes.
        if (field === 'text') {
            const element = refinedData?.compositional_deconstruction.elements[index];
            const typed = parseInt(fontOpt.size, 10);
            const sizeNum = Number.isFinite(typed) && typed > 0 ? typed : DEFAULT_TEXT_FONT_SIZE;
            const fo: NonNullable<CanvasElement['extra_fontoption']> = {};
            if (sizeNum !== DEFAULT_TEXT_FONT_SIZE) fo.size = sizeNum;
            if (fontOpt.font !== '') fo.font = fontOpt.font;
            if (fontOpt.bold) fo.bold = true;
            if (fontOpt.italic) fo.italic = true;
            const next = Object.keys(fo).length ? fo : undefined;
            const changed = (['size', 'font', 'bold', 'italic'] as const)
                .some((k) => (element?.extra_fontoption?.[k] ?? null) !== (next?.[k] ?? null));
            if (changed) bboxEditedRef.current = true;
        }
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) => {
                if (i !== index) return el;
                if (field === 'desc') return { ...el, desc: value };
                // Text: apply the font options. Only NON-DEFAULT values are
                // stored — the prompt's own desc carries the default font
                // description, so a stored default would fight it. No
                // explicit change -> the field is (re)removed entirely.
                const typed = parseInt(fontOpt.size, 10);
                const sizeNum = Number.isFinite(typed) && typed > 0 ? typed : DEFAULT_TEXT_FONT_SIZE;
                const fo: NonNullable<CanvasElement['extra_fontoption']> = {};
                if (sizeNum !== DEFAULT_TEXT_FONT_SIZE) fo.size = sizeNum;
                if (fontOpt.font !== '') fo.font = fontOpt.font;
                if (fontOpt.bold) fo.bold = true;
                if (fontOpt.italic) fo.italic = true;
                const isDefault = Object.keys(fo).length === 0;
                if (isDefault) {
                    const rest = { ...el };
                    delete rest.extra_fontoption;
                    return { ...rest, text: value };
                }
                return { ...el, text: value, extra_fontoption: fo };
            });
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
        setEditing(null);
    };

    // Remove the context-menu target element from the caption and close the menu.
    const deleteElement = () => {
        if (!contextMenu) return;
        const { index } = contextMenu;
        setContextMenu(null);
        recordAction();
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.filter((_, i) => i !== index);
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    return {
        contextMenu,
        setContextMenu,
        editing,
        setEditing,
        draft,
        setDraft,
        fontOpt,
        setFontOpt,
        sizeMenuOpen,
        setSizeMenuOpen,
        openContextMenu,
        openEditor,
        saveEdit,
        deleteElement,
    };
}
