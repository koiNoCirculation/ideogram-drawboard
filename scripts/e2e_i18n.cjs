/**
 * i18n e2e for DrawBoard (run against `expo start --web` on :8081, with
 * NODE_PATH pointing at a playwright install). Verifies:
 *  - default locale is en-US (flag 🇺🇸, all chrome English on both pages);
 *  - the switcher sits LEFT of the settings gear;
 *  - switching to zh-CN re-renders every page's chrome in Chinese
 *    (labels, buttons, menus, toggles);
 *  - the choice persists across reload (localStorage drawboard.locale);
 *  - switching back to en-US restores the English strings.
 * Data-driven content (element desc/text, captions) is never translated.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const TEMP = path.join(__dirname, '..', 'temp');
const DESIGN_ID = 'i18n-design';

// A prompt carrying recognizable DATA (must survive both locales unchanged).
const BASE_PROMPT = {
    aspect_ratio: '4:3',
    high_level_description: 'A test scene with a dog and a label.',
    style_description: {
        aesthetics: 'clean, minimal',
        lighting: 'even',
        medium: 'photograph',
        photo: '85mm',
        art_style: 'flat, vector',
        color_palette: ['#1a1a2e', '#F5A623'],
    },
    compositional_deconstruction: {
        background: 'A plain studio backdrop.',
        elements: [
            { type: 'obj', bbox: [100, 100, 400, 500], desc: 'A golden retriever sitting in the center.' },
            { type: 'text', bbox: [500, 100, 600, 900], text: 'HELLO', desc: 'A label reading HELLO on the right.' },
        ],
    },
};

// NOTE: the init script runs in the page's JS context, where module-level
// vars of this file don't exist, and addInitScript takes a SINGLE arg — so
// the payload is passed as one object.
async function openDesign(page) {
    await page.addInitScript((payload) => {
        let map = {};
        try { map = JSON.parse(localStorage.getItem('drawboard.handoff') || '{}'); } catch (e) {}
        if (!map[payload.id]) map[payload.id] = { promptData: JSON.stringify(payload.prompt), size: { width: 1024, height: 768 } };
        localStorage.setItem('drawboard.handoff', JSON.stringify(map));
    }, { id: DESIGN_ID, prompt: BASE_PROMPT });
    await page.goto(`${BASE}/design?id=${DESIGN_ID}`, { waitUntil: 'networkidle' });
}

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

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // ================= S1: home — default en-US =================
    await section('S1 home: default locale is en-US', async () => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const flag = page.locator('[data-testid="lang-switcher"]');
        // Flags are SVG images (emoji glyphs don't render in every font stack),
        // so assert on the per-locale flag image testID.
        ok(await page.locator('[data-testid="lang-flag-en-US"]').count() === 1, 'switcher shows the US flag by default');
        ok(await page.getByText('Recent Designs').count() === 1, 'sidebar nav English (home wall title is Collections)');
        ok(await page.getByText('Collections', { exact: true }).count() === 1, 'wall title English (home mode)');
        ok(await page.getByText('Home', { exact: true }).count() === 1, 'home nav English');
        // The empty placeholder lives in the Recent Designs section (the wall).
        await page.locator('[data-testid="nav-recent-designs"]').click();
        await page.waitForTimeout(300);
        ok(await page.getByText('No saved designs yet').count() === 1, 'empty placeholder English (recent mode)');
        ok(await page.getByText('Recent Designs').count() === 2, 'wall title English (recent mode)');
        await page.locator('[data-testid="nav-home"]').click();
        await page.waitForTimeout(300);
        ok(await page.getByText('Enter the description of your dreamed image').count() === 1, 'section title English');
        ok(await page.getByText('Width (W)').count() === 1, 'W label English');
        ok(await page.getByText('Height (H)').count() === 1, 'H label English');
        ok(await page.getByText('custom', { exact: true }).count() === 1, 'custom ratio English');
        ok(await page.locator('input[data-testid="prompt-input"]').getAttribute('placeholder') === 'Generate new or upload & edit...',
            'prompt placeholder English');
        ok((await page.locator('[data-testid="start-design-button"]').getAttribute('aria-label')) === 'Start Design',
            'start button label English (aria-label)');

        // The switcher is inserted LEFT of the settings gear.
        const fb = await flag.boundingBox();
        const gb = await page.locator('[data-testid="settings-gear"]').boundingBox();
        ok(fb && gb && fb.x + fb.width <= gb.x + 2, `switcher sits left of the gear (gap ${gb.x - (fb.x + fb.width)})`);

        // Settings dialog save button uses its own label (not the design's "Save").
        await page.locator('[data-testid="settings-gear"]').click();
        await page.waitForTimeout(200);
        ok(await page.locator('[data-testid="settings-save"]').innerText() === 'Save Settings', 'settings Save button English');
        await page.getByText('Cancel', { exact: true }).click();
        await page.waitForTimeout(150);

        // Dropdown lists both locales.
        await flag.click();
        await page.waitForTimeout(200);
        ok(await page.locator('[data-testid="lang-option-en-US"]').count() === 1
            && await page.locator('[data-testid="lang-option-zh-CN"]').count() === 1,
            'dropdown offers en-US and zh-CN');
        ok(await page.locator('[data-testid="lang-option-en-US"]').innerText() === 'English'
            && await page.locator('[data-testid="lang-option-zh-CN"]').innerText() === '中文',
            'options labeled with endonyms (English / 中文)');
        await page.mouse.click(10, 400); // close via backdrop
        await page.waitForTimeout(150);
    });

    // ================= S2: design — default en-US =================
    await section('S2 design: default locale is en-US', async () => {
        await openDesign(page);
        await page.waitForTimeout(700);
        for (const label of ['Aesthetics', 'Lighting', 'Art Style', 'Photo', 'Medium', 'Palette', 'Background']) {
            ok(await page.getByText(label, { exact: true }).count() === 1, `metadata label "${label}" English`);
        }
        ok(await page.getByText('Show grid', { exact: true }).count() === 1, 'grid toggle English');
        ok(await page.getByText('Show elements', { exact: true }).count() === 1, 'elements toggle English');
        ok(await page.locator('[data-testid="save-button"]').innerText() === 'Save', 'Save button English');
        ok(await page.locator('[data-testid="generate-button"]').innerText() === 'Generate', 'Generate button English');
        ok(await page.locator('[data-testid="download-image-button"]').innerText() === 'Download Image', 'Download button English');
        ok(await page.locator('input[placeholder="Untitled Design"]').count() === 1, 'title placeholder English');
        // Data-driven content is untouched.
        ok(await page.getByText('A golden retriever sitting in the center.').count() >= 1, 'element desc NOT translated');

        // Element right-click menu in English.
        const box = page.locator('div[style*="left:"][style*="top:"][style*="width:"][style*="height:"]:visible:not([data-testid="design-canvas"])').first();
        const bb = await box.boundingBox();
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('Copy', { exact: true }).count() === 1
            && await page.getByText('Paste', { exact: true }).count() === 1
            && await page.getByText('Edit description', { exact: true }).count() === 1
            && await page.getByText('Delete', { exact: true }).count() === 1,
            'context menu English');
        await page.mouse.click(10, 400);
        await page.waitForTimeout(150);
    });

    // ================= S3: switch to zh-CN on the design page =================
    await section('S3 design: switch to zh-CN', async () => {
        await page.locator('[data-testid="lang-switcher"]').click();
        await page.waitForTimeout(200);
        await page.locator('[data-testid="lang-option-zh-CN"]').click();
        await page.waitForTimeout(400);

        ok(await page.locator('[data-testid="lang-flag-zh-CN"]').count() === 1, 'switcher now shows the CN flag');
        for (const label of ['美学关键字', '光照关键字', '艺术风格关键字', '照片关键字', '载体关键字', '调色盘', '背景']) {
            ok(await page.getByText(label, { exact: true }).count() === 1, `metadata label "${label}" Chinese`);
        }
        ok(await page.getByText('网格显示', { exact: true }).count() === 1, 'grid toggle Chinese');
        ok(await page.getByText('元素显示', { exact: true }).count() === 1, 'elements toggle Chinese');
        ok(await page.locator('[data-testid="save-button"]').innerText() === '保存设计', 'Save button Chinese');
        ok(await page.locator('[data-testid="generate-button"]').innerText() === '生成图片', 'Generate button Chinese');
        ok(await page.locator('[data-testid="download-image-button"]').innerText() === '下载图片', 'Download button Chinese');
        // The four bottom buttons stay equal-width even though the zh labels
        // differ in length (保存设计 / 生成图片 / 下载图片 / 显示 Prompt).
        const btnIds = ['save-button', 'generate-button', 'download-image-button', 'show-prompt-button'];
        const btnW = [];
        for (const id of btnIds) btnW.push((await page.locator(`[data-testid="${id}"]`).boundingBox()).width);
        ok(btnW.every((w) => Math.abs(w - btnW[0]) < 1),
            `four buttons equal width in zh (${btnW.map((w) => w.toFixed(1)).join(' / ')})`);
        // Data-driven content is still untouched.
        ok(await page.getByText('A golden retriever sitting in the center.').count() >= 1, 'element desc still NOT translated');
        ok(await page.getByText('HELLO').count() >= 1, 'element text still NOT translated');

        // Element right-click menu in Chinese.
        const box = page.locator('div[style*="left:"][style*="top:"][style*="width:"][style*="height:"]:visible:not([data-testid="design-canvas"])').first();
        const bb = await box.boundingBox();
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
        await page.waitForTimeout(200);
        ok(await page.getByText('复制', { exact: true }).count() === 1
            && await page.getByText('粘贴', { exact: true }).count() === 1
            && await page.getByText('编辑描述', { exact: true }).count() === 1
            && await page.getByText('删除', { exact: true }).count() === 1,
            'context menu Chinese');
        await page.mouse.click(10, 400);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(TEMP, 'shot_i18n_zh_design.png') });
    });

    // ================= S4: persistence + home in zh-CN =================
    await section('S4 zh-CN persists across reload; home page Chinese', async () => {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        ok(await page.locator('[data-testid="lang-flag-zh-CN"]').count() === 1, 'locale survives reload (flag)');
        ok(await page.getByText('美学关键字', { exact: true }).count() === 1, 'locale survives reload (label)');
        ok(await page.evaluate(() => localStorage.getItem('drawboard.locale')) === 'zh-CN',
            'drawboard.locale = zh-CN in localStorage');

        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        ok(await page.getByText('最近的设计').count() === 1, 'sidebar nav Chinese (home wall title is 合集)');
        ok(await page.getByText('合集', { exact: true }).count() === 1, 'wall title Chinese (home mode)');
        ok(await page.getByText('首页', { exact: true }).count() === 1, 'home nav Chinese');
        // The empty placeholder lives in the Recent Designs section (the wall).
        await page.locator('[data-testid="nav-recent-designs"]').click();
        await page.waitForTimeout(300);
        ok(await page.getByText('还没有保存的设计').count() === 1, 'empty placeholder Chinese (recent mode)');
        await page.locator('[data-testid="nav-home"]').click();
        await page.waitForTimeout(300);
        ok(await page.getByText('描述你想要的图片').count() === 1, 'section title Chinese');
        ok(await page.getByText('宽度', { exact: true }).count() === 1, 'W label Chinese');
        ok(await page.getByText('高度', { exact: true }).count() === 1, 'H label Chinese');
        ok(await page.getByText('自定义', { exact: true }).count() === 1, 'custom ratio Chinese');
        ok(await page.locator('input[data-testid="prompt-input"]').getAttribute('placeholder') === '生成新图片，或上传并编辑…',
            'prompt placeholder Chinese');
        ok((await page.locator('[data-testid="start-design-button"]').getAttribute('aria-label')) === '开始设计',
            'start button label Chinese (aria-label)');

        // Settings dialog save button is 保存设置 (not the design's 保存设计).
        await page.locator('[data-testid="settings-gear"]').click();
        await page.waitForTimeout(200);
        ok(await page.locator('[data-testid="settings-save"]').innerText() === '保存设置', 'settings Save button Chinese (保存设置)');
        await page.getByText('取消', { exact: true }).click();
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(TEMP, 'shot_i18n_zh_home.png') });
    });

    // ================= S5: switch back to en-US =================
    await section('S5 home: switch back to en-US', async () => {
        await page.locator('[data-testid="lang-switcher"]').click();
        await page.waitForTimeout(200);
        await page.locator('[data-testid="lang-option-en-US"]').click();
        await page.waitForTimeout(400);
        ok(await page.locator('[data-testid="lang-flag-en-US"]').count() === 1, 'switcher back to the US flag');
        ok(await page.getByText('Recent Designs').count() === 1, 'sidebar nav back to English');
        ok((await page.locator('[data-testid="start-design-button"]').getAttribute('aria-label')) === 'Start Design',
            'start button back to English');
        ok(await page.evaluate(() => localStorage.getItem('drawboard.locale')) === 'en-US',
            'drawboard.locale = en-US in localStorage');
    });

    console.log(`\n${pass}/${pass + fail} checks passed`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('I18N E2E ERROR:', e); process.exit(1); });
