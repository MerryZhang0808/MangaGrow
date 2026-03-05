// Comic style enum (duplicated from frontend types for backend independence)
export enum ComicStyle {
  CARTOON = '温馨卡通',
  WATERCOLOR = '柔和水彩',
  FLAT = '简约扁平',
  DOODLE = '手绘涂鸦',
}

// C07: Complete English style prompt keywords (hardcoded, no runtime modification)
const STYLE_PROMPTS: Record<ComicStyle, string> = {
  [ComicStyle.CARTOON]: 'chibi style, Q-version characters, big head small body proportions, 2-head-tall ratio, cute rounded facial features, large expressive eyes, soft lighting, warm pastel color palette, thick clean outlines, cozy warm atmosphere',
  [ComicStyle.WATERCOLOR]: 'watercolor technique, soft edges, muted tones, flowing colors, gentle gradients, hand-painted feel, dreamy atmosphere, light wash effect',
  [ComicStyle.FLAT]: 'flat design, clean lines, bold solid colors, minimal shadows, geometric shapes, modern illustration, simple background, vector art style',
  [ComicStyle.DOODLE]: 'hand-drawn sketch, pencil texture, loose lines, playful doodle style, casual strokes, notebook paper feel, spontaneous and fun',
};

// Chinese style descriptions for script generation guidance
const STYLE_DESCRIPTIONS: Record<ComicStyle, string> = {
  [ComicStyle.CARTOON]: '温馨卡通风格：粗线条、明亮色彩、Q版人物、温暖氛围',
  [ComicStyle.WATERCOLOR]: '柔和水彩风格：柔和色调、手绘质感、水彩笔触、温柔氛围',
  [ComicStyle.FLAT]: '简约扁平风格：扁平化设计、清爽配色、简洁线条、现代感',
  [ComicStyle.DOODLE]: '手绘涂鸦风格：随性线条、童真感、手绘笔触、自然活泼',
};

export function getStylePrompt(style: ComicStyle): string {
  return STYLE_PROMPTS[style] || STYLE_PROMPTS[ComicStyle.CARTOON];
}

export function getStyleDescription(style: ComicStyle): string {
  return STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS[ComicStyle.CARTOON];
}
