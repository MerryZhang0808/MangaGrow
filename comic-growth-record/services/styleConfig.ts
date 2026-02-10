import { ComicStyle } from "../types";

// Complete English style prompt keywords for each comic style
// These are hardcoded and must not be modified at runtime (Architecture.md C07)
const STYLE_PROMPTS: Record<ComicStyle, string> = {
  [ComicStyle.CARTOON]: 'soft lighting, warm color palette, rounded features, gentle expressions, pastel background, children\'s book illustration style, cozy atmosphere',
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

// Get complete English style prompt keywords for image generation
export const getStylePrompt = (style: ComicStyle): string => {
  return STYLE_PROMPTS[style];
};

// Get Chinese style description for script generation context
export const getStyleDescription = (style: ComicStyle): string => {
  return STYLE_DESCRIPTIONS[style];
};
