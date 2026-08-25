import { Dispatch, RefObject, SetStateAction, useRef, useState } from 'react';
import { RefinedPrompt } from '../types';
import { Snapshot, UNDO_HISTORY_LIMIT } from './constants';

/**
 * Snapshot-based undo/redo over the document (refinedData + palette). One
 * step per completed user action; capped at UNDO_HISTORY_LIMIT. The current
 * (refinedData, palette) is the "present"; only completed pre-action
 * snapshots are kept.
 */
export function useHistory(
    refinedData: RefinedPrompt | null,
    palette: string[],
    setRefinedData: Dispatch<SetStateAction<RefinedPrompt | null>>,
    setPalette: Dispatch<SetStateAction<string[]>>,
    bboxEditedRef: RefObject<boolean>,
) {
    const [undoState, setUndoState] = useState<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
    // Pre-action snapshot captured at the start of an undoable operation.
    const pendingSnapshotRef = useRef<Snapshot | null>(null);

    // Capture the document as it is BEFORE the caller mutates it.
    const beginHistory = () => {
        pendingSnapshotRef.current = { data: refinedData, palette };
    };

    // Promote the captured pre-action snapshot into the undo stack (and drop
    // the redo stack — a new action invalidates it). Call once per completed
    // action, only when something actually changed.
    const commitHistory = () => {
        const snap = pendingSnapshotRef.current;
        pendingSnapshotRef.current = null;
        if (!snap) return;
        setUndoState((prev) => ({ past: [...prev.past, snap].slice(-UNDO_HISTORY_LIMIT), future: [] }));
    };

    // For atomic actions (edit, add, delete, palette change): capture and
    // commit in one go, right before the state update.
    const recordAction = () => {
        beginHistory();
        commitHistory();
    };

    // A restored document may put descs at odds with bboxes again (e.g. the
    // user undoes a drag after the rewrite already ran), so re-arm the
    // generate-time rewrite whenever the document object actually changes.
    const restoreSnapshot = (snap: Snapshot) => {
        if (snap.data !== refinedData) bboxEditedRef.current = true;
        setRefinedData(snap.data);
        setPalette(snap.palette);
    };

    const undo = () => {
        if (undoState.past.length === 0) return;
        const snap = undoState.past[undoState.past.length - 1];
        restoreSnapshot(snap);
        setUndoState({
            past: undoState.past.slice(0, -1),
            future: [{ data: refinedData, palette }, ...undoState.future].slice(0, UNDO_HISTORY_LIMIT),
        });
    };

    const redo = () => {
        if (undoState.future.length === 0) return;
        const snap = undoState.future[0];
        restoreSnapshot(snap);
        setUndoState({
            past: [...undoState.past, { data: refinedData, palette }].slice(-UNDO_HISTORY_LIMIT),
            future: undoState.future.slice(1),
        });
    };

    // A freshly loaded (or re-opened) design starts with clean history.
    const resetHistory = () => {
        pendingSnapshotRef.current = null;
        setUndoState({ past: [], future: [] });
    };

    // Discard the in-flight pre-action snapshot (a gesture that ended as a
    // no-op must not leave a pending step behind).
    const cancelHistory = () => {
        pendingSnapshotRef.current = null;
    };

    return { undoState, beginHistory, commitHistory, recordAction, cancelHistory, undo, redo, resetHistory };
}
