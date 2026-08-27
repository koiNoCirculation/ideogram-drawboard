/**
 * Absolute URL for a file served from the public/ directory (copied to the
 * export root, e.g. public/system_prompt.txt → /system_prompt.txt).
 *
 * On a subpath deployment (GitHub Pages project site) the app is exported with
 * experiments.baseUrl (see app.config.js), and babel-preset-expo inlines
 * process.env.EXPO_BASE_URL into the bundle at build time — the same value
 * expo-router uses to strip the base from urls. Local development exports
 * without a base, so the prefix is empty and the url is root-absolute.
 * Without the prefix, fetches would hit the site root and 404 on
 * user.github.io/<repo>/ deployments.
 */
export function getPublicAssetUrl(assetPath: string): string {
    const base = process.env.EXPO_BASE_URL ?? '';
    return `${base}${assetPath}`;
}
