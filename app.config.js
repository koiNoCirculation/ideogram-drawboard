/**
 * Dynamic Expo config layer on top of app.json.
 *
 * Sets `experiments.baseUrl` from the EXPO_BASE_URL environment variable so the
 * app can be exported for a subpath deployment (GitHub Pages project site,
 * e.g. https://user.github.io/DrawBoard/):
 *
 *   EXPO_BASE_URL=/DrawBoard npx expo export --platform web
 *
 * Without the variable (local `npm run web` development) the base path stays
 * empty and everything behaves exactly as before: the router only strips the
 * base in production bundles, and the dev server serves public/ files from the
 * root. See DESIGN.md「GitHub Pages 部署」for the full mechanism.
 */
module.exports = ({ config }) => ({
    expo: {
        ...config,
        experiments: {
            ...config.experiments,
            baseUrl: process.env.EXPO_BASE_URL || '',
        },
    },
});
