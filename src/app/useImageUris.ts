import { useEffect, useRef, useState } from 'react';
import { resolveImageRef } from './services/imageStore';

/**
 * Resolve image refs to displayable URIs, aligned by index with `refs`.
 * Refs are ids into the IndexedDB image store (the only ref kind — every
 * image, generated or bundled example, is persisted there). Entries that are
 * still being resolved, or whose IDB record is missing, are null — renderers
 * show an empty placeholder for those.
 *
 * Resolution is cached per ref (first write wins); a late completion for a ref
 * that left the array is harmless because nothing renders it anymore, so no
 * cancellation tokens are needed.
 */
export function useImageUris(refs: ReadonlyArray<string | null | undefined>): (string | null)[] {
    // ref -> resolved uri (null = looked up, record missing)
    const [resolved, setResolved] = useState<Record<string, string | null>>({});
    const requestedRef = useRef<Set<string>>(new Set());

    // Join with a NUL separator so distinct ref lists can't collide.
    const refsKey = refs.join('\u0000');
    useEffect(() => {
        for (const ref of refs) {
            if (!ref || requestedRef.current.has(ref)) continue;
            requestedRef.current.add(ref);
            resolveImageRef(ref).then((uri) => {
                setResolved((prev) => (prev[ref] !== undefined ? prev : { ...prev, [ref]: uri }));
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refsKey]);

    return refs.map((ref) => (!ref ? null : resolved[ref] ?? null));
}
