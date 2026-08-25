import { Dispatch, RefObject, SetStateAction, useRef, useState } from 'react';
import { CanvasElement, RefinedPrompt } from '../types';
import { clampBbox } from './canvas';
import { DEFAULT_TEXT_FONT_SIZE } from './constants';

export type EditField = 'desc' | 'text';
export type FontOpt = { size: string; font: string; bold: boolean; italic: boolean };

/** 0-1000 units a pasted element is offset from the previous position. */
const PASTE_OFFSET = 20;

/**
 * Right-click context menu (copy / paste / edit / delete) + element field
 * editor (desc / text, with the text-only font options). `extra_fontoption`
 * stores only the user's explicitly-changed (non-default) keys, so the
 * prompt's own default font description is never overridden.
 */
export function useElementEditing(
    refinedData: RefinedPrompt | null,
    setRefinedData: Dispatch<SetStateAction<RefinedPrompt | null>>,
    recordAction: () => void,
    bboxEditedRef: RefObject<boolean>,
) {
    // Right-click context menu: its viewport position and target — an element
    // index (full menu) or null (a right-click on empty canvas: Paste only).
    const [contextMenu, setContextMenu] = useState<{ index: number | null; x: number; y: number } | null>(null);
    // Element field editor dialog: which element and which field (desc | text).
    const [editing, setEditing] = useState<{ index: number; field: EditField } | null>(null);
    // The value being edited in the dialog's input.
    const [draft, setDraft] = useState('');
    // Font options of the element being edited. `size` is kept as raw input text.
    const [fontOpt, setFontOpt] = useState<FontOpt>({ size: String(DEFAULT_TEXT_FONT_SIZE), font: '', bold: false, italic: false });
    // Whether the font-size preset dropdown is open.
    const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
    // In-app clipboard: the last copied element. Deep-cloned at copy time so
    // later edits to the original never leak into the clipboard.
    const [copiedElement, setCopiedElement] = useState<CanvasElement | null>(null);
    // The bbox the next paste offsets from: the copied bbox, then each
    // successive paste's result, so consecutive pastes cascade apart.
    const pasteBaseRef = useRef<[number, number, number, number] | null>(null);

    // Shared menu opener: clamps the (item-count-sized) menu to the viewport.
    const openMenuAt = (index: number | null, e: any, itemCount: number) => {
        // Suppress the browser's native context menu.
        e?.preventDefault?.();
        e?.nativeEvent?.preventDefault?.();
        const point = e?.nativeEvent ?? e ?? {};
        const itemH = 36;
        const menuW = 180;
        const menuH = 12 + itemH * itemCount + 10;
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        setContextMenu({
            index,
            x: Math.min(Math.max(point.clientX ?? 0, 8), vw - menuW - 8),
            y: Math.min(Math.max(point.clientY ?? 0, 8), vh - menuH - 8),
        });
    };

    // Right-click an element box: open the full context menu at the cursor.
    const openContextMenu = (index: number, e: any) => {
        const element = refinedData?.compositional_deconstruction.elements[index];
        // Copy + Paste + Edit description (+ Edit text for text elements) + Delete.
        openMenuAt(index, e, (element?.type === 'text' ? 2 : 1) + 3);
    };

    // Right-click empty canvas: a Paste-only menu (same in-app clipboard).
    const openCanvasContextMenu = (e: any) => openMenuAt(null, e, 1);

    // Open the edit dialog for the field of the context-menu target element.
    const openEditor = (field: EditField) => {
        if (!contextMenu || contextMenu.index === null) return;
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

    // Copy the context-menu target element into the in-app clipboard.
    // Closes the menu on the action, like the other menu items.
    const copyElement = () => {
        // The canvas (Paste-only) menu has no element to copy.
        if (!contextMenu || contextMenu.index === null) return;
        const element = refinedData?.compositional_deconstruction.elements[contextMenu.index];
        setContextMenu(null);
        if (!element) return;
        setCopiedElement(JSON.parse(JSON.stringify(element)));
        pasteBaseRef.current = element.bbox ? [...element.bbox] : null;
    };

    // Paste the clipboard element as a new element at the end of the list
    // (front-most, last layer-list row), offset PASTE_OFFSET from the
    // previous paste position and clamped to the canvas. One undo step.
    const pasteElement = () => {
        setContextMenu(null);
        if (!copiedElement) return;
        const source = pasteBaseRef.current ?? copiedElement.bbox ?? null;
        const bbox = source
            ? clampBbox([source[0] + PASTE_OFFSET, source[1] + PASTE_OFFSET, source[2] + PASTE_OFFSET, source[3] + PASTE_OFFSET])
            : undefined;
        // The pasted desc was written for the copied bbox: re-arm the LLM
        // rewrite only when the offset (after clamping) actually moved the box.
        if (bbox && source && bbox.some((v, i) => v !== source[i])) {
            bboxEditedRef.current = true;
        }
        pasteBaseRef.current = bbox ?? null;
        recordAction();
        setRefinedData((prev) => {
            if (!prev) return prev;
            const { visible: _v, ...rest } = JSON.parse(JSON.stringify(copiedElement)) as CanvasElement;
            const next: CanvasElement = bbox ? { ...rest, bbox } : { ...rest };
            const elements = [...prev.compositional_deconstruction.elements, next];
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    // Remove the context-menu target element from the caption and close the menu.
    const deleteElement = () => {
        if (!contextMenu || contextMenu.index === null) return;
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
        openCanvasContextMenu,
        openEditor,
        saveEdit,
        copyElement,
        pasteElement,
        copiedElement,
        deleteElement,
    };
}
