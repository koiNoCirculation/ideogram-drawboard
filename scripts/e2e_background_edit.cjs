/**
 * E2E: the design page's background description is editable.
 *  - the background block under the metadata bar shows the current text;
 *    clicking it opens an "Edit background" dialog prefilled with it;
 *  - Save writes the trimmed text back into the prompt (label updates) and
 *    records one undo step (Undo reverts the label);
 *  - the saved design persists the edited background to localStorage;
 *  - an empty draft disables Save; Cancel/backdrop close without changes.
 *
 * A design with a background is seeded into the design store and opened via
 * /design?id=. Run against `expo start --web` on :8081. Screenshots -> ./temp.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const SEED_ID = 'design-bg-e2e';
const BG_ORIGINAL = 'A plain grey studio backdrop with soft shadows.';
const BG_EDITED = 'A sunset desert with a lone cactus.';

const seedDesign = {
    id: SEED_ID,
    prompt: {
        aspect_ratio: '4:3',
        high_level_description: 'Bg edit test scene',
        style_description: {
            aesthetics: 'clean', lighting: 'even', medium: 'photograph',
            photo: '35mm', color_palette: ['#111111'],
        },
        compositional_deconstruction: {
            background: BG_ORIGINAL,
            elements: [{ type: 'obj', bbox: [100, 100, 400, 500], desc: 'A red cube in the center.' }],
        },
    },
    images: [],
    size: { width: 1024, height: 768 },
    updatedAt: 1,
    rawPrompt: 'a red cube',
};

async function newPage(browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.addInitScript((d) => {
        if (!localStorage.getItem('drawboard.designs'))
            localStorage.setItem('drawboard.designs', JSON.stringify([d]));
    }, seedDesign);
    await page.goto(BASE + '/design?id=' + SEED_ID, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="edit-background"]', { timeout: 10000 });
    return { page, errors };
}

const dialog = (page) => page.locator('[data-testid="edit-background-dialog"]');

(async () => {
    const browser = await chromium.launch();
    let pass = 0, fail = 0;
    const ok = (cond, name) => {
        if (cond) { pass++; console.log('  OK   ' + name); }
        else { fail++; console.log('  FAIL ' + name); }
    };
    const section = async (name, fn) => {
        console.log('\n== ' + name + ' ==');
        try { await fn(); } catch (e) { fail++; console.log('  ERROR ' + name + ': ' + (e && e.message)); }
    };

    // ================= S1: click opens the prefilled dialog ===============
    await section('S1 click background opens the edit dialog', async () => {
        const { page, errors } = await newPage(browser);
        ok((await page.getByText(BG_ORIGINAL).count()) >= 1, 'background label shows the current text');
        ok((await page.locator('[data-testid="edit-background"]').count()) === 1, 'background block is the clickable entry');

        await page.locator('[data-testid="edit-background"]').click();
        await page.waitForSelector('[data-testid="edit-background-dialog"]', { timeout: 5000 });
        ok((await dialog(page).count()) === 1, 'edit dialog opens');
        ok((await page.getByText('Edit background').count()) === 1, 'dialog title is "Edit background"');
        ok((await page.locator('[data-testid="background-input"]').inputValue()) === BG_ORIGINAL,
            'dialog input is prefilled with the current background');
        await page.screenshot({ path: path.join(TEMP, 'shot_background_edit_dialog.png') });

        // Backdrop click closes it without changes.
        await page.mouse.click(5, 5);
        await page.waitForTimeout(300);
        ok((await dialog(page).count()) === 0, 'backdrop click closes the dialog');
        ok((await page.getByText(BG_ORIGINAL).count()) >= 1, 'label unchanged after close');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ============ S2: save writes back + persists on Save design ==========
    await section('S2 save updates the label and persists via Save', async () => {
        const { page, errors } = await newPage(browser);
        await page.locator('[data-testid="edit-background"]').click();
        await page.waitForSelector('[data-testid="edit-background-dialog"]', { timeout: 5000 });
        await page.locator('[data-testid="background-input"]').fill(BG_EDITED);
        await page.locator('[data-testid="background-save"]').click();
        await page.waitForTimeout(300);
        ok((await dialog(page).count()) === 0, 'dialog closes after save');
        ok((await page.getByText(BG_EDITED).count()) >= 1, 'label shows the edited background');
        ok((await page.getByText(BG_ORIGINAL).count()) === 0, 'old background text gone');

        // Save the design: the edited background lands in localStorage.
        await page.locator('[data-testid="save-button"]').click();
        await page.waitForTimeout(500);
        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('drawboard.designs') || '[]')
                .find((d) => d.id === 'design-bg-e2e'));
        ok(stored?.prompt?.compositional_deconstruction?.background === BG_EDITED,
            'Save design persists the edited background');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ================= S3: undo reverts the edit ===========================
    await section('S3 undo reverts a background edit', async () => {
        const { page, errors } = await newPage(browser);
        await page.locator('[data-testid="edit-background"]').click();
        await page.waitForSelector('[data-testid="edit-background-dialog"]', { timeout: 5000 });
        await page.locator('[data-testid="background-input"]').fill(BG_EDITED);
        await page.locator('[data-testid="background-save"]').click();
        await page.waitForTimeout(300);
        ok((await page.getByText(BG_EDITED).count()) >= 1, 'label shows the edit before undo');

        const undo = page.locator('[data-testid="undo-button"]');
        ok((await undo.evaluate((el) => el.getAttribute('aria-disabled') !== 'true')), 'undo enabled after the edit');
        await undo.click();
        await page.waitForTimeout(300);
        ok((await page.getByText(BG_ORIGINAL).count()) >= 1, 'undo reverts the label to the original background');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ============ S4: empty draft disables Save, Cancel keeps old ==========
    await section('S4 empty draft disables Save; Cancel keeps the original', async () => {
        const { page, errors } = await newPage(browser);
        await page.locator('[data-testid="edit-background"]').click();
        await page.waitForSelector('[data-testid="edit-background-dialog"]', { timeout: 5000 });
        await page.locator('[data-testid="background-input"]').fill('   ');
        const saveBtn = page.locator('[data-testid="background-save"]');
        ok(await saveBtn.evaluate((el) =>
            el.getAttribute('aria-disabled') === 'true' || getComputedStyle(el).pointerEvents === 'none'),
            'Save disabled for a whitespace-only draft');
        await saveBtn.click({ force: true }).catch(() => {});
        ok((await dialog(page).count()) === 1, 'clicking a disabled Save keeps the dialog open');

        await page.locator('[data-testid="background-cancel"]').click();
        await page.waitForTimeout(300);
        ok((await dialog(page).count()) === 0, 'Cancel closes the dialog');
        ok((await page.getByText(BG_ORIGINAL).count()) >= 1, 'label unchanged after cancel');
        ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
        await page.close();
    });

    // ---------- summary ----------
    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('BACKGROUND-EDIT E2E ERROR:', e); process.exit(1); });
