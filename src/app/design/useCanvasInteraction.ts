import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { MIN_ELEMENT_SIZE } from '../components/ElementBox';
import type { Corner } from '../components/ElementBox';
import { CanvasElement, RefinedPrompt } from '../types';
import { ALIGN_GUIDE_THRESHOLD, MIN_CREATE_DRAG_PX } from './constants';
import { AlignGuides, clampBbox, computeAlignGuides } from './canvas';

export type ElementTool = 'text' | 'obj';
type Bbox = [number, number, number, number];

/**
 * All pointer interaction on the canvas: dragging/resizing existing element
 * boxes (with center-alignment guides) and dragging out a new element with an
 * active creation tool. Live bboxes are recomputed from a base captured at
 * gesture start so the moving position never feeds back into the gesture delta.
 */
export function useCanvasInteraction(
    refinedData: RefinedPrompt | null,
    setRefinedData: Dispatch<SetStateAction<RefinedPrompt | null>>,
    displaySize: { width: number; height: number },
    snapToGrid: (v: number) => number,
    activeTool: ElementTool | null,
    setActiveTool: Dispatch<SetStateAction<ElementTool | null>>,
    bboxEditedRef: RefObject<boolean>,
    beginHistory: () => void,
    commitHistory: () => void,
    cancelHistory: () => void,
    recordAction: () => void,
) {
    // Center-alignment guides while dragging: the nearest other element's
    // vertical/horizontal center line (position in 0-1000 units + that
    // element's index, which gets highlighted).
    const [alignGuides, setAlignGuides] = useState<AlignGuides>({ v: null, h: null });
    // Live rectangle (canvas px) of the element currently being created by dragging.
    const [createDraft, setCreateDraft] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    // Base bbox captured when a drag starts.
    const dragBaseRef = useRef<{ index: number; baseBbox: Bbox } | null>(null);
    // Base bbox and corner captured when a resize starts.
    const resizeBaseRef = useRef<{ index: number; baseBbox: Bbox; corner: Corner } | null>(null);
    // Anchor of the in-flight create-drag: start point in canvas px plus the
    // canvas origin in viewport px (for converting raw window pointer events).
    const createBaseRef = useRef<{ xPx: number; yPx: number; rectLeft: number; rectTop: number; type: ElementTool } | null>(null);

    const handleDragStart = (index: number) => {
        const element = refinedData?.compositional_deconstruction.elements[index];
        if (!element?.bbox) return;
        dragBaseRef.current = { index, baseBbox: element.bbox };
        beginHistory();
    };

    // Live-update the dragged element's bbox in the JSON prompt (normalized 0-1000).
    const handleDragMove = (dxPx: number, dyPx: number) => {
        const drag = dragBaseRef.current;
        if (!drag || displaySize.width <= 0 || displaySize.height <= 0) return;
        const dx = (dxPx / displaySize.width) * 1000;
        const dy = (dyPx / displaySize.height) * 1000;
        const [yMin, xMin, yMax, xMax] = drag.baseBbox;
        // Snap the moved origin to the current grid; the box size is kept.
        const nyMin = snapToGrid(yMin + dy);
        const nxMin = snapToGrid(xMin + dx);
        const clamped = clampBbox([nyMin, nxMin, nyMin + (yMax - yMin), nxMin + (xMax - xMin)]);
        // Only a real change (post-clamp) counts as an edit — drags that
        // no-op against the canvas edge keep the descs valid.
        if (clamped.some((v, i) => v !== drag.baseBbox[i])) bboxEditedRef.current = true;
        const { index } = drag;
        setAlignGuides(computeAlignGuides(
            refinedData?.compositional_deconstruction.elements ?? [], index, clamped, ALIGN_GUIDE_THRESHOLD,
        ));
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) =>
                i === index ? { ...el, bbox: clamped } : el
            );
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    const handleDragEnd = () => {
        const drag = dragBaseRef.current;
        // One undo step per drag — and only when the box really moved
        // (a no-op drag against the canvas edge is not an edit).
        const el = drag ? refinedData?.compositional_deconstruction.elements[drag.index] : undefined;
        if (drag && el?.bbox && !el.bbox.every((v, i) => v === drag.baseBbox[i])) {
            commitHistory();
        } else {
            cancelHistory();
        }
        dragBaseRef.current = null;
        setAlignGuides({ v: null, h: null });
    };

    const handleResizeStart = (index: number, corner: Corner) => {
        const element = refinedData?.compositional_deconstruction.elements[index];
        if (!element?.bbox) return;
        resizeBaseRef.current = { index, baseBbox: element.bbox, corner };
        beginHistory();
    };

    // Live-update the resized element's bbox: extend/shift the edges controlled
    // by the grabbed corner, clamped to the canvas and a minimum element size.
    const handleResizeMove = (dxPx: number, dyPx: number) => {
        const resize = resizeBaseRef.current;
        if (!resize || displaySize.width <= 0 || displaySize.height <= 0) return;
        const dx = (dxPx / displaySize.width) * 1000;
        const dy = (dyPx / displaySize.height) * 1000;
        const [yMin, xMin, yMax, xMax] = resize.baseBbox;
        const { corner } = resize;
        const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
        // Snap the grabbed edge to the current grid (the opposite edge stays).
        let nxMin = xMin, nxMax = xMax, nyMin = yMin, nyMax = yMax;
        if (corner === 'nw' || corner === 'sw') nxMin = snapToGrid(clamp(xMin + dx, 0, xMax - MIN_ELEMENT_SIZE));
        if (corner === 'ne' || corner === 'se') nxMax = snapToGrid(clamp(xMax + dx, xMin + MIN_ELEMENT_SIZE, 1000));
        if (corner === 'nw' || corner === 'ne') nyMin = snapToGrid(clamp(yMin + dy, 0, yMax - MIN_ELEMENT_SIZE));
        if (corner === 'sw' || corner === 'se') nyMax = snapToGrid(clamp(yMax + dy, yMin + MIN_ELEMENT_SIZE, 1000));
        // Snapping may have crossed the opposite edge — re-clamp (constraints win).
        nxMin = clamp(nxMin, 0, xMax - MIN_ELEMENT_SIZE);
        nxMax = clamp(nxMax, xMin + MIN_ELEMENT_SIZE, 1000);
        nyMin = clamp(nyMin, 0, yMax - MIN_ELEMENT_SIZE);
        nyMax = clamp(nyMax, yMin + MIN_ELEMENT_SIZE, 1000);
        const newBbox: Bbox = [Math.round(nyMin), Math.round(nxMin), Math.round(nyMax), Math.round(nxMax)];
        // Same as the drag path: mark edited only when the clamped bbox
        // actually changed.
        if (newBbox.some((v, i) => v !== resize.baseBbox[i])) bboxEditedRef.current = true;
        const { index } = resize;
        setRefinedData((prev) => {
            if (!prev) return prev;
            const elements = prev.compositional_deconstruction.elements.map((el, i) =>
                i === index ? { ...el, bbox: newBbox } : el
            );
            return { ...prev, compositional_deconstruction: { ...prev.compositional_deconstruction, elements } };
        });
    };

    const handleResizeEnd = () => {
        const resize = resizeBaseRef.current;
        // Same one-step-per-gesture rule as the drag path.
        const el = resize ? refinedData?.compositional_deconstruction.elements[resize.index] : undefined;
        if (resize && el?.bbox && !el.bbox.every((v, i) => v === resize.baseBbox[i])) {
            commitHistory();
        } else {
            cancelHistory();
        }
        resizeBaseRef.current = null;
    };

    // Append a new (empty) element of the given type with the given bbox.
    // It shows up on the canvas and can be filled in via the right-click menu.
    const addElement = (type: ElementTool, bbox: Bbox) => {
        recordAction();
        setRefinedData((prev) => {
            if (!prev) return prev;
            const element: CanvasElement = type === 'text'
                ? { type, bbox, text: '', desc: '' }
                : { type, bbox, desc: '' };
            return {
                ...prev,
                compositional_deconstruction: {
                    ...prev.compositional_deconstruction,
                    elements: [...prev.compositional_deconstruction.elements, element],
                },
            };
        });
    };

    // Start a create-drag on the canvas while a creation tool is active
    // (left button only; element boxes are pointer-transparent in tool mode).
    const handleCanvasPointerDown = (e: any) => {
        if (!activeTool || e.button !== 0 || displaySize.width <= 0 || displaySize.height <= 0) return;
        const rect = e.currentTarget?.getBoundingClientRect?.();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createBaseRef.current = { xPx: x, yPx: y, rectLeft: rect.left, rectTop: rect.top, type: activeTool };
        setCreateDraft({ left: x, top: y, width: 0, height: 0 });
    };

    // Abort any in-flight create-drag (Esc).
    const cancelCreation = () => {
        createBaseRef.current = null;
        setCreateDraft(null);
    };

    // While a create-drag is in flight, track the pointer on window so the
    // rectangle follows even when the pointer leaves the canvas.
    const isCreating = createDraft !== null;
    useEffect(() => {
        if (!isCreating) return;
        const base = createBaseRef.current;
        if (!base) return;
        const onMove = (ev: PointerEvent) => {
            const x = ev.clientX - base.rectLeft;
            const y = ev.clientY - base.rectTop;
            setCreateDraft({
                left: Math.min(base.xPx, x),
                top: Math.min(base.yPx, y),
                width: Math.abs(x - base.xPx),
                height: Math.abs(y - base.yPx),
            });
        };
        const onUp = (ev: PointerEvent) => {
            const x = ev.clientX - base.rectLeft;
            const y = ev.clientY - base.rectTop;
            const wPx = Math.abs(x - base.xPx);
            const hPx = Math.abs(y - base.yPx);
            createBaseRef.current = null;
            setCreateDraft(null);
            // A plain click (no real drag) creates nothing.
            if (wPx < MIN_CREATE_DRAG_PX || hPx < MIN_CREATE_DRAG_PX) return;
            // Convert to a normalized (0-1000) bbox, snap the origin to the
            // current grid, clamp to the canvas, enforce the minimum size.
            const xMin = Math.min(1000 - MIN_ELEMENT_SIZE, snapToGrid(Math.round((Math.min(base.xPx, x) / displaySize.width) * 1000)));
            const yMin = Math.min(1000 - MIN_ELEMENT_SIZE, snapToGrid(Math.round((Math.min(base.yPx, y) / displaySize.height) * 1000)));
            let xMax = Math.min(1000, Math.round(((Math.min(base.xPx, x) + wPx) / displaySize.width) * 1000));
            let yMax = Math.min(1000, Math.round(((Math.min(base.yPx, y) + hPx) / displaySize.height) * 1000));
            if (xMax - xMin < MIN_ELEMENT_SIZE) xMax = Math.min(1000, xMin + MIN_ELEMENT_SIZE);
            if (yMax - yMin < MIN_ELEMENT_SIZE) yMax = Math.min(1000, yMin + MIN_ELEMENT_SIZE);
            addElement(base.type, [yMin, xMin, yMax, xMax]);
            setActiveTool(null);
        };
        const onCancel = () => {
            createBaseRef.current = null;
            setCreateDraft(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCreating, displaySize.width, displaySize.height]);

    return {
        alignGuides,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleResizeStart,
        handleResizeMove,
        handleResizeEnd,
        addElement,
        isCreating,
        createDraft,
        handleCanvasPointerDown,
        cancelCreation,
    };
}
