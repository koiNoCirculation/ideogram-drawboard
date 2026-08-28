import { TranslationKey } from '../../i18n/translations';

/**
 * Error classification for network requests. The app talks to user-configured
 * endpoints (LLM, image generation) and same-origin bundled assets; when a
 * request fails the user needs to know whether it is a NETWORK problem (no
 * connection, endpoint down) or a CONFIGURATION problem (wrong endpoint URL,
 * bad API key, unknown model) — raw browser strings like "Failed to fetch"
 * tell them nothing.
 *
 * Services throw typed errors on their way up:
 *  - `HttpError` — the request reached a server that answered non-2xx
 *    (status preserved for classification);
 *  - `AssetLoadError` — a bundled (same-origin, not user-configurable) asset
 *    failed to load; the message points at refresh/deployment, not Settings.
 * Network-level failures arrive as the browser's raw `TypeError`
 * ("Failed to fetch" / "NetworkError…" / "Load failed") and are classified
 * here without any wrapping.
 */

/** Non-2xx HTTP response; `status` drives the classification below. */
export class HttpError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

/** Bundled-asset load failure (system prompt txt, example collection). */
export class AssetLoadError extends Error {
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'AssetLoadError';
        this.cause = cause;
    }
}

export type RequestErrorKind =
    | 'unreachable' // fetch never reached a server (offline/DNS/refused/CORS)
    | 'auth' // 401/403 — credentials rejected
    | 'notFound' // 404 — endpoint (or model) doesn't exist
    | 'rejected' // other 4xx — request the server refused
    | 'server' // 5xx — the server is failing
    | 'unexpected'; // a response arrived but isn't what was expected

export type RequestErrorService = 'llm' | 'image' | 'download';

// Browser fetch failures are TypeErrors with engine-specific messages
// (Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch
// resource", Safari "Load failed") — match all of them so the classification
// doesn't depend on which engine is running.
const NETWORK_MESSAGE_RE = /failed to fetch|networkerror|load failed/i;

/**
 * Classify a thrown value as a request error, or null when it is NOT a
 * request error (validation/content/storage failures — those keep their
 * caller-specific inline error lines).
 */
export function classifyRequestError(error: unknown): RequestErrorKind | null {
    if (error instanceof HttpError) {
        const { status } = error;
        if (status === 401 || status === 403) return 'auth';
        if (status === 404) return 'notFound';
        if (status >= 400 && status < 500) return 'rejected';
        if (status >= 500 && status < 600) return 'server';
        return 'unexpected';
    }
    if (error instanceof TypeError || (error instanceof Error && NETWORK_MESSAGE_RE.test(error.message))) {
        return 'unreachable';
    }
    if (error instanceof SyntaxError) return 'unexpected'; // bad JSON body, etc.
    return null;
}

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const SERVICE_LABEL_KEY: Record<RequestErrorService, TranslationKey> = {
    llm: 'netServiceLlm',
    image: 'netServiceImage',
    download: 'netServiceDownload',
};

const KIND_KEY: Record<RequestErrorKind, TranslationKey> = {
    unreachable: 'netUnreachable',
    auth: 'netAuth',
    notFound: 'netNotFound',
    rejected: 'netRejected',
    server: 'netServer',
    unexpected: 'netUnexpected',
};

/**
 * Build the user-facing (translated) message for a classified request error.
 * `unreachable` cannot distinguish offline/DNS/refused/CORS — the browser
 * hides the reason — so that message names BOTH possibilities: check the
 * connection, or verify the endpoint URL in Settings.
 */
export function requestErrorMessage(error: unknown, service: RequestErrorService, t: Translate): string {
    const kind = classifyRequestError(error) ?? 'unexpected';
    const vars: Record<string, string | number> = { service: t(SERVICE_LABEL_KEY[service]) };
    if (error instanceof HttpError && kind !== 'unreachable') vars.status = error.status;
    return t(KIND_KEY[kind], vars);
}
