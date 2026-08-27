/**
 * Inject the spa-github-pages redirect bootstrap into dist/index.html
 * (https://github.com/rafgraph/spa-github-pages).
 *
 * Why: GitHub Pages is a plain static file server. A fresh load of a deep link
 * (e.g. /DrawBoard/design?id=… after a refresh or a shared link) finds no such
 * file and serves public/404.html, whose script rewrites the URL to a
 * query-only form: /DrawBoard/?/design~and~id=…  That url serves index.html,
 * and THIS script — running before the app bundle (a <script defer> at the end
 * of <body>) — converts the query back into the real path via
 * history.replaceState, so expo-router (base path from experiments.baseUrl)
 * sees /DrawBoard/design?id=… and routes to the design page.
 *
 * `npx expo export` has no hook for adding head scripts to the exported HTML,
 * so this runs after the export:  node scripts/inject_github_pages_bootstrap.cjs [distDir]
 * Idempotent: skips the file if the bootstrap is already present.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'spa-github-pages-redirect-bootstrap';

const SCRIPT = `  <script id="${MARKER}">
    // Single Page Apps for GitHub Pages
    // MIT License
    // https://github.com/rafgraph/spa-github-pages
    // This script checks to see if a redirect is present in the query string,
    // converts it back into the correct url and adds it to the
    // browser's history using window.history.replaceState(...),
    // which won't cause the browser to attempt to load the new url.
    // When the single page app is loaded further down in this file,
    // the correct url will be waiting in the browser's history for the
    // single page app to route accordingly.
    (function(l) {
      if (l.search[1] === '/' ) {
        var decoded = l.search.slice(1).split('&').map(function(s) {
          return s.replace(/~and~/g, '&')
        }).join('?');
        window.history.replaceState(null, null,
            l.pathname.slice(0, -1) + decoded + l.hash
        );
      }
    }(window.location))
  </script>`;

/**
 * Returns { html, changed }. Throws if the head tag is missing.
 */
function injectBootstrap(html) {
    if (html.includes(MARKER)) {
        return { html, changed: false };
    }
    const headOpen = html.match(/<head[^>]*>/i);
    if (!headOpen) {
        throw new Error('No <head> tag found — is this the exported index.html?');
    }
    const at = headOpen.index + headOpen[0].length;
    const out = html.slice(0, at) + '\n' + SCRIPT + '\n' + html.slice(at);
    return { html: out, changed: true };
}

function main() {
    const distDir = process.argv[2] || 'dist';
    const file = path.join(distDir, 'index.html');
    if (!fs.existsSync(file)) {
        console.error(`[inject-bootstrap] ${file} not found — run "npx expo export --platform web" first.`);
        process.exit(1);
    }
    const html = fs.readFileSync(file, 'utf8');
    try {
        const { html: out, changed } = injectBootstrap(html);
        if (changed) {
            fs.writeFileSync(file, out, 'utf8');
            console.log(`[inject-bootstrap] bootstrap injected into ${file}`);
        } else {
            console.log(`[inject-bootstrap] ${file} already has the bootstrap — skipped.`);
        }
    } catch (error) {
        console.error(`[inject-bootstrap] ${error.message}`);
        process.exit(1);
    }
}

module.exports = { injectBootstrap, MARKER };
if (require.main === module) {
    main();
}
