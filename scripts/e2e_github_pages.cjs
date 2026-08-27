/**
 * e2e for the GitHub Pages (PROJECT page, https://<user>.github.io/<repo>/)
 * deploy artifacts. Builds the real static export with
 * `EXPO_BASE_URL=/DrawBoard npx expo export --platform web` (needs port 8081
 * FREE — the in-process Metro dev server binds it and export aborts if busy),
 * injects the spa-github-pages bootstrap into dist/index.html, then serves
 * dist/ through an in-process GitHub-Pages emulator on :8082 (files live
 * under /DrawBoard/, unknown paths answer with dist/404.html and status 404,
 * exactly like the Pages static server) and verifies the whole redirect
 * chain in a real browser:
 *  S0 export + bootstrap injection succeed;
 *  S1 home at /DrawBoard/ renders: every asset URL is base-prefixed and the
 *     example wall is fully populated (proves the base-prefixed example.json
 *     + example-png fetches work against the real export);
 *  S2 deep link /DrawBoard/design?id=… (a 404 on a plain static server)
 *     rides the 404.html rewrite -> index.html -> bootstrap replaceState
 *     chain and lands on the opened design (title = HLD, element rendered);
 *  S3 an unknown path 404s, gets rewritten, and the router restores the URL
 *     without crashing;
 *  S4 the shipped static files are in place (404.html with
 *     pathSegmentsToKeep = 1, .nojekyll).
 * Run: node scripts/e2e_github_pages.cjs   (stop `expo start` first)
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TEMP = path.join(__dirname, '..', 'temp');
const BASE = '/DrawBoard';
const SERVER_PORT = 8082;
const HOST = `http://localhost:${SERVER_PORT}`;
const BASE2 = `${HOST}${BASE}/`;
const EXAMPLES = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'example_collection', 'example.json'), 'utf8'));

const DESIGN_ID = 'design-ghpages-e2e';
const HLD = 'A deep link smoke test scene';
const ELEMENT_DESC = 'a large blue circle centered on the backdrop';
const SEEDED_DESIGN = {
    id: DESIGN_ID,
    prompt: {
        aspect_ratio: '1:1',
        high_level_description: HLD,
        style_description: {
            aesthetics: 'clean',
            lighting: 'soft',
            medium: 'digital art',
            art_style: 'flat illustration',
            color_palette: ['#007AFF', '#FFFFFF'],
        },
        compositional_deconstruction: {
            background: 'a plain light gray studio backdrop',
            elements: [
                { type: 'obj', bbox: [200, 200, 800, 800], desc: ELEMENT_DESC },
            ],
        },
    },
    images: [],
    size: { width: 1024, height: 1024 },
    updatedAt: 1700000000000,
    rawPrompt: 'deep link test',
};

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log('  OK   ' + name); }
    else { fail++; console.log('  FAIL ' + name); }
};
const section = async (name, fn) => {
    console.log('\n== ' + name + ' ==');
    try { await fn(); } catch (e) { fail++; console.log('  ERROR ' + name + ': ' + (e && e.message)); }
};

function portFree(port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(port, '127.0.0.1');
    });
}

function run(cmd, args, env, cwd) {
    return new Promise((resolve, reject) => {
        // On Windows, spawn with shell:true concatenates cmd + args WITHOUT
        // quoting them (Node DEP0190), so a path with spaces — e.g.
        // "C:\Program Files\nodejs\node.exe" — is split at the space and cmd
        // fails with "'C:\Program' is not recognized". Quote each part.
        const useShell = process.platform === 'win32'; // npx is npx.cmd on Windows
        const q = (s) => (s.includes(' ') ? `"${s}"` : s);
        const child = useShell
            ? spawn([q(cmd), ...args.map(q)].join(' '), {
                cwd,
                env: { ...process.env, ...env },
                stdio: 'inherit',
                shell: true,
            })
            : spawn(cmd, args, {
                cwd,
                env: { ...process.env, ...env },
                stdio: 'inherit',
            });
        child.on('exit', (code) => code === 0
            ? resolve()
            : reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`)));
    });
}

// --- In-process GitHub-Pages emulator: dist/ served under /DrawBoard/, any
// missing path answered with dist/404.html and status 404 (Pages behavior). ---
function contentType(file) {
    const ext = path.extname(file).toLowerCase();
    return ({
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain; charset=utf-8',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    })[ext] || 'application/octet-stream';
}

function startEmulator() {
    const server = http.createServer((req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (pathname === BASE) {
                res.writeHead(301, { Location: BASE + '/' });
                res.end();
                return;
            }
            if (!pathname.startsWith(BASE + '/')) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('not under ' + BASE);
                return;
            }
            let file = path.join(DIST, pathname.slice(BASE.length) || '/');
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
                file = path.join(file, 'index.html');
            }
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
                res.writeHead(200, { 'Content-Type': contentType(file) });
                fs.createReadStream(file).pipe(res);
            } else {
                // Pages serves the custom 404 page WITH status 404.
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(String(e));
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(SERVER_PORT, '127.0.0.1', () => resolve(server));
    });
}

(async () => {
    const browser = await chromium.launch();
    let exported = false;
    let server = null;

    // ================= S0: real export with the subpath base + injection =================
    await section('S0 export with EXPO_BASE_URL=/DrawBoard + bootstrap injection', async () => {
        if (process.env.SKIP_EXPORT && fs.existsSync(path.join(DIST, 'index.html'))) {
            console.log('  SKIP export (SKIP_EXPORT=1, reusing existing dist/ — for fast iteration)');
            exported = true;
            return;
        }
        if (!(await portFree(8081))) {
            throw new Error('port 8081 is busy — stop the dev server (expo start) and re-run');
        }
        if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
        await run('npx', ['expo', 'export', '--platform', 'web'], { EXPO_BASE_URL: BASE }, ROOT);
        await run(process.execPath, [path.join(ROOT, 'scripts', 'inject_github_pages_bootstrap.cjs'), 'dist'], {}, ROOT);
        const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
        ok(indexHtml.includes('spa-github-pages-redirect-bootstrap'),
            'bootstrap injected into dist/index.html <head>');
        // web.output: "single" (SPA): one index.html, no per-route SSG files —
        // the deep-link chain always serves index.html, so a pre-rendered home
        // page (output: "static") would hydration-mismatch (React #418) against
        // the client-rendered /design or unknown route.
        ok(fs.existsSync(path.join(DIST, 'index.html')) && !fs.existsSync(path.join(DIST, 'design.html')),
            'export is SPA output (index.html, no per-route SSG files)');
        exported = true;
    });

    // ================= S4 (static, no server): shipped Pages files =================
    await section('S4 dist ships 404.html (pathSegmentsToKeep=1) and .nojekyll', async () => {
        if (!exported) { console.log('  SKIP (export failed)'); return; }
        const f404 = path.join(DIST, '404.html');
        ok(fs.existsSync(f404), 'dist/404.html present');
        const body = fs.existsSync(f404) ? fs.readFileSync(f404, 'utf8') : '';
        ok(/var\s+pathSegmentsToKeep\s*=\s*1;/.test(body),
            '404.html keeps 1 path segment (project pages)');
        ok(fs.existsSync(path.join(DIST, '.nojekyll')), 'dist/.nojekyll present');
        // The injection script is idempotent (the CI publish step may run it
        // after an already-injected index.html is re-exported on top).
        const { injectBootstrap } = require(path.join(ROOT, 'scripts', 'inject_github_pages_bootstrap.cjs'));
        const twice = injectBootstrap(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
        ok(twice.changed === false, 'bootstrap injection is idempotent');
    });

    if (exported) {
        if (!(await portFree(SERVER_PORT))) {
            console.log(`  FAIL emulator port ${SERVER_PORT} is busy`);
            fail++;
            exported = false;
        }
    }

    if (exported) server = await startEmulator();

    // ================= S1: home page on the subpath =================
    await section('S1 home at /DrawBoard/ renders with base-prefixed assets', async () => {
        if (!exported) { console.log('  SKIP (export failed)'); return; }
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await page.goto(BASE2, { waitUntil: 'networkidle' });
        const scriptSrcs = await page.$$eval('script[src]', (els) => els.map((e) => e.src));
        ok(scriptSrcs.length > 0
            && scriptSrcs.every((s) => s.startsWith(HOST + BASE + '/')),
            `all ${scriptSrcs.length} script srcs are under ${BASE}/`);
        // The wall populating proves example.json AND the root-relative
        // example png fetches both carry the base prefix in the real export.
        try {
            await page.waitForFunction((n) =>
                document.querySelectorAll('[data-testid^="wall-tile-"]').length === n,
                EXAMPLES.length, { timeout: 120000 });
        } catch (e) { /* asserted below */ }
        const tiles = await page.locator('[data-testid^="wall-tile-"]').count();
        ok(tiles === EXAMPLES.length, `wall shows all ${EXAMPLES.length} example tiles (base-prefixed fetches worked)`);
        const firstImg = await page.locator('[data-testid^="wall-tile-"] img').first().getAttribute('src').catch(() => '');
        ok(firstImg.startsWith('data:image/'), 'example image resolved from IDB (data URI)');
        ok(pageErrors.length === 0, `no page errors (${pageErrors.length})`);
        await page.screenshot({ path: path.join(TEMP, 'shot_github_pages_home.png') });
        await page.close();
    });

    // ================= S2: deep link through the 404 redirect chain =================
    await section('S2 deep link /DrawBoard/design?id=… → 404.html → index.html → design opens', async () => {
        if (!exported) { console.log('  SKIP (export failed)'); return; }
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        page.on('console', (m) => {
            if (m.type() === 'warning' || m.type() === 'error') console.log('  CONSOLE[' + m.type() + ']', m.text().slice(0, 300));
        });
        // The design store holds an ARRAY of designs (loadDesigns returns []
        // for non-array values), so seed the array form like the dev suites.
        await page.addInitScript((d) => {
            if (!localStorage.getItem('drawboard.designs'))
                localStorage.setItem('drawboard.designs', JSON.stringify([d]));
        }, SEEDED_DESIGN);
        await page.goto(`${HOST}${BASE}/design?id=${DESIGN_ID}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        ok(page.url() === `${HOST}${BASE}/design?id=${DESIGN_ID}`,
            'URL restored to the real deep link after the 404 rewrite');
        const titleSet = await page.evaluate((hld) =>
            Array.from(document.querySelectorAll('input')).some((i) => i.value === hld), HLD);
        ok(titleSet, 'design page opened (title = high level description)');
        ok(await page.getByText(ELEMENT_DESC).count() >= 1, 'element rendered on the canvas');
        if (!titleSet) {
            // Diagnostics: what is actually on the page / in storage?
            const diag = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input'))
                    .map((i) => i.value || i.placeholder || '(empty)');
                return {
                    url: location.href,
                    titleInputs: inputs.slice(0, 8),
                    bodySnippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
                    designs: (localStorage.getItem('drawboard.designs') || '').slice(0, 200),
                    handoff: (localStorage.getItem('drawboard.handoff') || '').slice(0, 120),
                };
            });
            console.log('  DIAG', JSON.stringify(diag, null, 2));
        }
        ok(pageErrors.length === 0, `no page errors (${pageErrors.length}${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''})`);
        await page.screenshot({ path: path.join(TEMP, 'shot_github_pages_deeplink.png') });
        await page.close();
    });

    // ================= S3: unknown path → 404 → rewrite → no crash =================
    await section('S3 unknown path 404s, gets rewritten, router restores the URL', async () => {
        if (!exported) { console.log('  SKIP (export failed)'); return; }
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        const status = await page.goto(`${HOST}${BASE}/no/such/route`, { waitUntil: 'domcontentloaded' });
        ok(status && status.status() === 404, 'raw response is status 404 (custom 404 page)');
        await page.waitForTimeout(2000);
        ok(page.url() === `${HOST}${BASE}/no/such/route`, 'URL restored for the unknown path');
        ok(pageErrors.length === 0, `no page errors (${pageErrors.length}${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''})`);
        await page.screenshot({ path: path.join(TEMP, 'shot_github_pages_notfound.png') });
        await page.close();
    });

    if (server) server.close();
    await browser.close();
    console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
