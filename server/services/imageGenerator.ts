import { GenerateContentResponse } from '@google/genai';
import { getAiClient, withRetry, SAFETY_SETTINGS, IMAGE_MODEL } from './gemini.js';
import { getStylePrompt } from './styleConfig.js';

// === Types ===

export type CharacterStyleMode = 'full' | 'head-only';

export interface CharacterImageRef {
  name: string;
  avatarData: string;
  avatarMimeType: string;
  referenceSheetData?: string;
  referenceSheetMimeType?: string;
  originalPhotoData?: string;
  originalPhotoMimeType?: string;
}

export interface SceneGenerationParams {
  script: string;
  style: string;
  ratio: string;
  characterContext: string;
  objectContext: string;
  referenceChars: CharacterImageRef[];
  sceneReferenceImages: Array<{ data: string; mimeType: string }>;
  characterSnapshots?: Array<{ data: string; mimeType: string }>; // v1.9: 角色快照
  characterStyleMode?: CharacterStyleMode; // v1.9: 服装策略
  isUserPhoto?: boolean;
}

export interface GeneratedImage {
  data: string;
  mimeType: string;
}

// === Scene Image Generation ===

export async function generateSceneImage(params: SceneGenerationParams): Promise<GeneratedImage> {
  const ai = getAiClient();
  const stylePrompt = getStylePrompt(params.style as any);

  // Build character reference names for prompt emphasis
  const refCharNames = params.referenceChars.map(c => c.name);
  const hasCharRefs = refCharNames.length > 0;

  // DEBUG: 打印 characterContext 内容
  console.log('[ImageGenerator] characterContext:', params.characterContext);

  // v1.9: 根据 characterStyleMode 生成服装规则
  const styleMode = params.characterStyleMode || 'head-only'; // 默认使用 head-only（服装跟随描述）
  const clothingRule = styleMode === 'full'
    ? '服装/发型/面部：严格参考Q版头像，不因描述而改变。'
    : '发型/面部：严格参考Q版头像。服装：优先使用画面描述中的服装，无描述时用Q版参考。';

  // 当有角色图片参考时，强调图片优先级
  const imagePriorityNote = hasCharRefs
    ? `\n\n⚠️ 【最高优先级】上方已提供 "${refCharNames.join('、')}" 的Q版头像参考图。该角色的发型、发色、面部特征、体型比例必须严格参考图片绘制，不受任何文字描述影响。文字描述中的外貌细节仅作为辅助参考。`
    : '';

  // v1.9: 紧凑提示词格式（约600字，原1500字）
  const basePromptText = `[ROLE]
严格按参考图绘制角色：发型/发色/面部必须完全一致。
${clothingRule}
物品外观在不同分镜中保持相同。
${imagePriorityNote}

[CHARACTERS]
${params.characterContext || '无特定人物定义。'}

[SCENE]
${params.script}

[OBJECTS]
${params.objectContext || '无特定关键物品。'}

[STYLE]
${stylePrompt}

[QUALITY]
单格漫画，无水印/文字/多指，温馨可爱风格。High quality illustration, detailed.`;

  const executeGeneration = async (hasVisuals: boolean): Promise<GeneratedImage> => {
    const parts: any[] = [];

    const imageConfig = {
      aspectRatio: params.ratio as any,
      imageSize: '1K'
    };

    if (hasVisuals) {
      // Strategy: pair each reference image with its label text immediately after,
      // so the model can directly associate each image with its character/purpose.

      // 1. Scene References (user photo or previous scene for continuity)
      if (params.sceneReferenceImages.length > 0) {
        const sceneImg = params.sceneReferenceImages[0];
        parts.push({ inlineData: { mimeType: sceneImg.mimeType, data: sceneImg.data } });

        if (!params.isUserPhoto) {
          parts.push({ text: `[风格参考帧] 参考画风（线条/色调/质感），角色外观以Q版头像为准。` });
        } else {
          parts.push({ text: `[用户参考照片] 参考构图/视角/姿态，转绘为漫画风格。` });
        }
      }

      // 2. Character References — Q-version avatar only (original photo removed: realistic proportions conflict with chibi style)
      for (const char of params.referenceChars) {
        // Avatar — sole character reference (chibi style + character identity)
        parts.push({ inlineData: { mimeType: char.avatarMimeType, data: char.avatarData } });
        parts.push({ text: `[人物 "${char.name}" Q版形象] 严格参考发型发色、面部特征、体型比例。` });

        // Reference sheet (if available) — paired with label
        if (char.referenceSheetData && char.referenceSheetMimeType) {
          parts.push({ inlineData: { mimeType: char.referenceSheetMimeType, data: char.referenceSheetData } });
          parts.push({ text: `[人物 "${char.name}" 多角度参考表]` });
        }
      }

      // 3. v1.9: Character Snapshots — 已生成分镜中该角色的最佳参考（增强角色一致性）
      if (params.characterSnapshots && params.characterSnapshots.length > 0) {
        // 只取第一张快照，避免过多参考图
        const snapshot = params.characterSnapshots[0];
        parts.push({ inlineData: { mimeType: snapshot.mimeType, data: snapshot.data } });
        parts.push({ text: `[角色一致性参考] 保持与该角色在之前分镜中的外观一致。` });
      }

      // 4. Main prompt text (character definitions + scene description + style + quality)
      parts.push({ text: basePromptText });
    } else {
      parts.push({ text: basePromptText });
    }

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts },
      config: {
        safetySettings: SAFETY_SETTINGS,
        imageConfig
      }
    }));

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return { data: part.inlineData.data!, mimeType: part.inlineData.mimeType! };
      }
    }

    const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    if (textPart) throw new Error(`AI Refusal: ${textPart}`);
    throw new Error('No image generated');
  };

  const hasAnyRefs = params.referenceChars.length > 0 || params.sceneReferenceImages.length > 0;

  try {
    if (hasAnyRefs) {
      const charNames = params.referenceChars.map(c => c.name).join(', ');
      console.log(`[ImageGenerator] Generating with visual refs (Scene: ${params.sceneReferenceImages.length}, Chars: ${params.referenceChars.length} [${charNames}], Mode: ${styleMode})`);
      return await executeGeneration(true);
    } else {
      console.log('[ImageGenerator] Generating text-only');
      return await executeGeneration(false);
    }
  } catch (e: any) {
    // C14: fallback to text-only on ref failure
    if (hasAnyRefs) {
      console.warn('[ImageGenerator] Visual ref generation failed, falling back to text-only:', e);
      return await executeGeneration(false);
    }
    throw new Error(`Image generation failed: ${e.message}`);
  }
}
