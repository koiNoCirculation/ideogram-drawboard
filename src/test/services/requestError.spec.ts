import { expect, test } from '@jest/globals';
import { TranslationKey } from '../../i18n/translations';
import { AssetLoadError, HttpError, classifyRequestError, requestErrorMessage } from '../../app/services/requestError';

// Stub translator: records (key, vars) so the spec can assert which
// translation the classifier picked without pulling in the real table.
function stubT(calls: Array<[TranslationKey, Record<string, string | number>?]>): (key: TranslationKey, vars?: Record<string, string | number>) => string {
    return (key, vars) => {
        calls.push([key, vars]);
        const label: Record<string, string> = {
            netServiceLlm: 'LLM svc',
            netServiceImage: 'image svc',
            netServiceDownload: 'image file',
        };
        let text = label[key] ?? key;
        if (vars) {
            for (const [name, value] of Object.entries(vars)) {
                text = text.split(`{${name}}`).join(String(value));
            }
        }
        return text;
    };
}

test('HttpError: carries the status and stays an Error', () => {
    const error = new HttpError('LLM API Error (500): boom', 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('LLM API Error (500): boom');
    expect(error.status).toBe(500);
    expect(error.name).toBe('HttpError');
});

test('classifyRequestError: network-level TypeErrors are unreachable', () => {
    // Chrome
    expect(classifyRequestError(new TypeError('Failed to fetch'))).toBe('unreachable');
    // engine-agnostic: some engines throw TypeError with an empty message
    expect(classifyRequestError(new TypeError(''))).toBe('unreachable');
});

test('classifyRequestError: network message variants (Firefox/Safari) are unreachable', () => {
    expect(classifyRequestError(new Error('NetworkError when attempting to fetch resource'))).toBe('unreachable');
    expect(classifyRequestError(new Error('Load failed'))).toBe('unreachable');
});

test('classifyRequestError: HttpError status buckets', () => {
    expect(classifyRequestError(new HttpError('x', 401))).toBe('auth');
    expect(classifyRequestError(new HttpError('x', 403))).toBe('auth');
    expect(classifyRequestError(new HttpError('x', 404))).toBe('notFound');
    expect(classifyRequestError(new HttpError('x', 400))).toBe('rejected');
    expect(classifyRequestError(new HttpError('x', 422))).toBe('rejected');
    expect(classifyRequestError(new HttpError('x', 500))).toBe('server');
    expect(classifyRequestError(new HttpError('x', 503))).toBe('server');
    expect(classifyRequestError(new HttpError('x', 304))).toBe('unexpected');
});

test('classifyRequestError: SyntaxError (bad JSON body) is unexpected', () => {
    expect(classifyRequestError(new SyntaxError('Unexpected token < in JSON'))).toBe('unexpected');
});

test('classifyRequestError: non-request errors classify to null', () => {
    expect(classifyRequestError(new AssetLoadError('Failed to load system prompt'))).toBeNull();
    expect(classifyRequestError(new Error('Missing settings: LLM name'))).toBeNull();
    expect(classifyRequestError(new Error('Element 3 is empty'))).toBeNull();
    expect(classifyRequestError('a string')).toBeNull();
    expect(classifyRequestError(null)).toBeNull();
});

test('requestErrorMessage: llm + unreachable -> netUnreachable with the service label', () => {
    const calls: Array<[TranslationKey, Record<string, string | number>?]> = [];
    const message = requestErrorMessage(new TypeError('Failed to fetch'), 'llm', stubT(calls));
    expect(calls[0][0]).toBe('netServiceLlm'); // service label looked up first
    expect(calls[1][0]).toBe('netUnreachable');
    expect(calls[1][1]).toEqual({ service: 'LLM svc' });
    expect(message).toBe('netUnreachable'); // key passthrough from the stub
    expect(message).not.toContain('Failed to fetch');
});

test('requestErrorMessage: image + 401 -> netAuth with status', () => {
    const calls: Array<[TranslationKey, Record<string, string | number>?]> = [];
    requestErrorMessage(new HttpError('Failed to download image: 401', 401), 'image', stubT(calls));
    expect(calls[0][0]).toBe('netServiceImage');
    expect(calls[1][0]).toBe('netAuth');
    expect(calls[1][1]).toEqual({ service: 'image svc', status: 401 });
});

test('requestErrorMessage: download + 500 -> netServer with status', () => {
    const calls: Array<[TranslationKey, Record<string, string | number>?]> = [];
    requestErrorMessage(new HttpError('Failed to download image: 500', 500), 'download', stubT(calls));
    expect(calls[0][0]).toBe('netServiceDownload');
    expect(calls[1][0]).toBe('netServer');
    expect(calls[1][1]).toEqual({ service: 'image file', status: 500 });
});

test('requestErrorMessage: unclassified error falls back to netUnexpected', () => {
    const calls: Array<[TranslationKey, Record<string, string | number>?]> = [];
    requestErrorMessage(new Error('something else'), 'llm', stubT(calls));
    expect(calls[0][0]).toBe('netServiceLlm');
    expect(calls[1][0]).toBe('netUnexpected');
    expect(calls[1][1]).toEqual({ service: 'LLM svc' });
});

test('requestErrorMessage: never leaks raw browser strings', () => {
    const t = stubT([]);
    for (const error of [
        new TypeError('Failed to fetch'),
        new Error('NetworkError when attempting to fetch resource'),
        new HttpError('LLM API Error (500): <html>internal</html>', 500),
    ]) {
        const message = requestErrorMessage(error, 'image', t);
        expect(message).not.toContain('Failed to fetch');
        expect(message).not.toContain('NetworkError');
        expect(message).not.toContain('LLM API Error');
    }
});
