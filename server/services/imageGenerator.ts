import { GenerateContentResponse } from '@google/genai';
import { getAiClient, withRetry, SAFETY_SETTINGS, IMAGE_MODEL } from './gemini.js';
import { getStylePrompt } from './styleConfig.js';

// === Types ===

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

  // Prompt built in 6-layer priority order (Architecture.md)
  const basePromptText = `
    任务：绘制一格连贯的漫画分镜。

    [1. 严格一致性规则 - CRITICAL]
    ⚠️ 以下规则是**强制性的**，违反会导致生成失败：
    ${hasCharRefs ? `⚠️⚠️⚠️ 最高优先级：上方提供的角色形象设定图是**唯一权威参考**。
    当画面描述中的文字与参考图冲突时，**必须以参考图为准**。
    必须严格参考设定图的人物（${refCharNames.join('、')}）：面部轮廓、发型发色、服装颜色款式、配饰。
    ` : ''}
    - 人物的发型、发色、发长必须与参考图**完全一致**，禁止改变
    - 服装必须使用参考图中**实际穿着的颜色和款式**，禁止自由发挥
    - 面部特征（眼睛、眉毛、脸型）必须与参考图一致
    - 如有眼镜、发卡等配饰，必须始终存在
    - 物品外观在不同分镜中必须保持相同
    ⚠️ 优先级：参考图一致性 > 文字描述 > 美观度 > 创意性

    [2. 人物定义]
    ${params.characterContext || '无特定人物定义。'}

    [3. 画面描述]
    ${params.script}

    [4. 关键物品定义]
    ${params.objectContext || '无特定关键物品。'}

    [5. 风格参数]
    ${stylePrompt}

    [6. 质量要求]
    High quality illustration, detailed, professional artwork.
    氛围：温馨、可爱、治愈。
    Only generate a single coherent image. No multi-panel, no split screen, no comic strip layout.
    No text, no watermark, no distortion, no extra fingers.
  `;

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
          parts.push({ text: `[风格参考帧] 参考此帧的整体画风、线条风格、色调和漫画质感，保持视觉风格一致。如果本分镜出现不同角色，以各角色的专属参考图为准，不要照搬此帧的角色外观到新角色身上。` });
        } else {
          parts.push({ text: `[用户参考照片] 请严格参考此图的构图、视角、背景环境、人物姿态，转绘为漫画风格。` });
        }
      }

      // 2. Character References — Q-version avatar only (original photo removed: realistic proportions conflict with chibi style)
      for (const char of params.referenceChars) {
        // Avatar — sole character reference (chibi style + character identity)
        parts.push({ inlineData: { mimeType: char.avatarMimeType, data: char.avatarData } });
        parts.push({ text: `[人物 "${char.name}" 的Q版形象] ⚠️ 严格参考此图中 ${char.name} 的：发型发色、服装颜色款式、体型比例（大头小身Q版）、面部特征。这是该角色的唯一权威参考。` });

        // Reference sheet (if available) — paired with label
        if (char.referenceSheetData && char.referenceSheetMimeType) {
          parts.push({ inlineData: { mimeType: char.referenceSheetMimeType, data: char.referenceSheetData } });
          parts.push({ text: `[人物 "${char.name}" 的多角度参考表] 用于确认该人物不同角度下的外观。` });
        }
      }

      // 3. Main prompt text (character definitions + scene description + style + quality)
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
      console.log(`[ImageGenerator] Generating with visual refs (Scene: ${params.sceneReferenceImages.length}, Chars: ${params.referenceChars.length} [${charNames}])`);
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
