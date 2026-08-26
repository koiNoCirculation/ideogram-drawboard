// All user-facing UI strings, by locale. Data-driven content (prompt text,
// element desc/text, generated captions, ratio labels, font names, provider
// names) is NOT translated — only the interface chrome.

export type Locale = 'en-US' | 'zh-CN';
export const LOCALES: Locale[] = ['en-US', 'zh-CN'];
export const DEFAULT_LOCALE: Locale = 'en-US';

// localStorage key for the persisted UI language.
export const LOCALE_STORAGE_KEY = 'drawboard.locale';

// Flag emoji shown for each locale in the switcher.
export const LOCALE_FLAGS: Record<Locale, string> = {
    'en-US': '🇺🇸',
    'zh-CN': '🇨🇳',
};

// Endonym shown for each locale in the switcher dropdown — every language is
// written in its own name (standard language-switcher convention), so this is
// UI chrome that does NOT vary with the active locale.
export const LOCALE_NAMES: Record<Locale, string> = {
    'en-US': 'English',
    'zh-CN': '中文',
};

const enUS = {
    // Home page
    recentDesigns: 'Recent Designs',
    noDesigns: 'No saved designs yet',
    enterDescription: 'Enter the description of your dreamed image',
    widthLabel: 'Width (W)',
    heightLabel: 'Height (H)',
    customRatio: 'custom',
    startDesign: 'Start Design',
    processing: 'Processing...',
    errorTitle: 'Error',
    promptRequired: 'Please enter a prompt.',
    missingSettingsAlert: 'Missing settings: {items}. Open Settings (gear icon) to configure them.',
    refineFailedAlert: 'Failed to generate prompt. Please try again.',
    refineRetrying: 'The LLM returned invalid JSON — retrying ({n} of {max})…',
    refineAllFailed: 'The LLM returned invalid JSON on every attempt.',
    systemPromptLoadFailed: 'Could not load system prompt. Please ensure assets are correctly bundled.',
    // Metadata bar
    aesthetics: 'Aesthetics',
    lighting: 'Lighting',
    photo: 'Photo',
    medium: 'Medium',
    artStyle: 'Art Style',
    palette: 'Palette',
    background: 'Background',
    // Design page / canvas
    untitled: 'Untitled Design',
    canvasArea: 'Canvas Area',
    showGrid: 'Show grid',
    showElements: 'Show elements',
    toolHintText: 'Drag on the canvas to create a text element · Esc to cancel',
    toolHintObj: 'Drag on the canvas to create an object element · Esc to cancel',
    generated: 'Generated',
    save: 'Save',
    generate: 'Generate',
    downloadImage: 'Download Image',
    showPrompt: 'Show Prompt',
    originalPrompt: 'Original Prompt',
    enhancedPrompt: 'Structured Prompt',
    saved: 'Saved ✓',
    // Context menu / edit dialog
    copy: 'Copy',
    paste: 'Paste',
    editDescription: 'Edit description',
    editText: 'Edit text',
    delete: 'Delete',
    fontSize: 'Font size (px)',
    font: 'Font',
    fontDefault: 'Default',
    cancel: 'Cancel',
    // Color palette popover
    editColor: 'Edit color',
    addColor: 'Add color',
    setColor: 'Set color',
    remove: 'Remove',
    // Settings dialog
    settingsTitle: 'Settings',
    saveSettings: 'Save Settings',
    llmSection: 'Large language model',
    llmProvider: 'LLM provider',
    llmEndpoint: 'LLM endpoint',
    llmKey: 'LLM secret key',
    llmName: 'LLM name',
    imageSection: 'Image generation',
    imageProvider: 'Image generation provider',
    imageEndpoint: 'Image generation endpoint',
    imageKey: 'Image generation secret key',
    // Errors (generate / download)
    genMissingSettings: 'Cannot generate — missing settings: {items}. Open Settings (gear icon) to configure them.',
    genEmptyElement: 'Element {n} is empty — right-click it on the canvas to edit its {field}.',
    fieldText: 'text',
    fieldDescription: 'description',
    generationFailed: 'Generation failed',
    noImageYet: 'No image has been generated yet — generate one first, then download.',
    downloadFailed: 'Download failed',
    requestFailedStatus: 'Request failed with status {status}',
    noImageUrl: 'No image URL in response',
    rewriteNoJson: 'The bbox-rewrite model did not return a JSON caption.',
    rewriteMissingElements: 'The rewritten caption is missing compositional_deconstruction.elements.',
    rewritePromptLoadFailed: 'Could not load the bbox-rewrite system prompt. Please ensure assets are correctly bundled.',
};

const zhCN: Record<keyof typeof enUS, string> = {
    // 首页
    recentDesigns: '最近的设计',
    noDesigns: '还没有保存的设计',
    enterDescription: '描述你想要的图片',
    widthLabel: '宽度',
    heightLabel: '高度',
    customRatio: '自定义',
    startDesign: '开始设计',
    processing: '处理中...',
    errorTitle: '错误',
    promptRequired: '请输入描述。',
    missingSettingsAlert: '缺少设置项：{items}。请点击右上角设置图标进行配置。',
    refineFailedAlert: '生成提示词失败，请重试。',
    refineRetrying: 'LLM 返回了无效的 JSON — 正在重试（{n}/{max}）…',
    refineAllFailed: 'LLM 多次尝试均返回无效 JSON。',
    systemPromptLoadFailed: '无法加载系统提示词，请确认资源已正确打包。',
    // 元数据栏
    aesthetics: '美学关键字',
    lighting: '光照关键字',
    photo: '照片关键字',
    medium: '载体关键字',
    artStyle: '艺术风格关键字',
    palette: '调色盘',
    background: '背景',
    // 设计页 / 画布
    untitled: '未命名设计',
    canvasArea: '画布区域',
    showGrid: '网格显示',
    showElements: '元素显示',
    toolHintText: '在画布上拖动以创建文字元素 · 按 Esc 取消',
    toolHintObj: '在画布上拖动以创建对象元素 · 按 Esc 取消',
    generated: '已生成',
    save: '保存设计',
    generate: '生成图片',
    downloadImage: '下载图片',
    showPrompt: '显示 Prompt',
    originalPrompt: '原始 Prompt',
    enhancedPrompt: '结构化 Prompt',
    saved: '已保存 ✓',
    // 右键菜单 / 编辑对话框
    copy: '复制',
    paste: '粘贴',
    editDescription: '编辑描述',
    editText: '编辑文字',
    delete: '删除',
    fontSize: '字体大小 (px)',
    font: '字体',
    fontDefault: '默认',
    cancel: '取消',
    // 调色盘弹出框
    editColor: '编辑颜色',
    addColor: '添加颜色',
    setColor: '设置颜色',
    remove: '移除',
    // 设置对话框
    settingsTitle: '设置',
    saveSettings: '保存设置',
    llmSection: '大语言模型',
    llmProvider: 'LLM 提供商',
    llmEndpoint: 'LLM 端点',
    llmKey: 'LLM 密钥',
    llmName: 'LLM 模型名',
    imageSection: '图片生成',
    imageProvider: '图片生成提供商',
    imageEndpoint: '图片生成端点',
    imageKey: '图片生成密钥',
    // 错误（生成 / 下载）
    genMissingSettings: '无法生成 — 缺少设置项：{items}。请点击设置图标进行配置。',
    genEmptyElement: '元素 {n} 为空 — 请在画布上右键点击它，以编辑其{field}。',
    fieldText: '文字',
    fieldDescription: '描述',
    generationFailed: '生成失败',
    noImageYet: '还没有生成任何图片 — 请先生成图片，然后再下载。',
    downloadFailed: '下载失败',
    requestFailedStatus: '请求失败，状态码 {status}',
    noImageUrl: '响应中没有图片 URL',
    rewriteNoJson: '改写模型未返回 JSON 描述。',
    rewriteMissingElements: '改写结果缺少 compositional_deconstruction.elements。',
    rewritePromptLoadFailed: '无法加载改写系统提示词，请确认资源已正确打包。',
};

export type TranslationKey = keyof typeof enUS;

export const translations: Record<Locale, Record<TranslationKey, string>> = {
    'en-US': enUS,
    'zh-CN': zhCN,
};
