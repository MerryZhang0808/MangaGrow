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

  // Prompt built in 6-layer priority order (Architecture.md)
  const basePromptText = `
    任务：绘制一格连贯的漫画分镜。

    [1. 严格一致性规则 - CRITICAL]
    ⚠️ 以下规则是**强制性的**，违反会导致生成失败：
    - 人物的发型、发色、发长必须与定义**完全一致**，禁止改变
    - 服装必须使用定义中**明确指定的颜色和款式**，禁止自由发挥
    - 面部特征（眼睛、眉毛、脸型）必须与定义一致
    - 如有眼镜、发卡等配饰，必须始终存在
    - 物品外观在不同分镜中必须保持相同
    ⚠️ 优先级：一致性 > 美观度 > 创意性

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
    No text, no watermark, no distortion, no extra fingers.
  `;

  const executeGeneration = async (hasVisuals: boolean): Promise<GeneratedImage> => {
    const parts: any[] = [];

    const imageConfig = {
      aspectRatio: params.ratio as any,
      imageSize: '1K'
    };

    if (hasVisuals) {
      let visualPrompt = '\n[视觉参考信息]\n';
      let imageIndex = 1;

      // 1. Scene References (user photo or previous scene for continuity)
      if (params.sceneReferenceImages.length > 0) {
        const sceneImg = params.sceneReferenceImages[0];
        parts.push({ inlineData: { mimeType: sceneImg.mimeType, data: sceneImg.data } });

        if (!params.isUserPhoto) {
          visualPrompt += `参考图 ${imageIndex} 是**上一个分镜生成的画面**。\n`;
          visualPrompt += `⚠️ **连续性要求**：人物的发型、服装、面部特征必须与参考图完全一致。\n`;
          visualPrompt += `只改变：人物的动作、姿态、表情和场景背景。\n\n`;
        } else {
          visualPrompt += `参考图 ${imageIndex} 是用户上传的**参考照片**。\n`;
          visualPrompt += `请严格参考该图的构图、视角、背景环境、人物姿态，转绘为漫画风格。\n`;
        }
        imageIndex++;
      }

      // 2. Character References (avatar + reference sheet if available)
      const maxChars = params.sceneReferenceImages.length > 0 ? 2 : 3;
      const activeRefs = params.referenceChars.slice(0, maxChars);

      for (const char of activeRefs) {
        // Avatar
        parts.push({ inlineData: { mimeType: char.avatarMimeType, data: char.avatarData } });
        visualPrompt += `参考图 ${imageIndex} 是人物 "${char.name}" 的形象设定。请绘制该人物的面部、发型和服装特征。\n`;
        imageIndex++;

        // Reference sheet (if available)
        if (char.referenceSheetData && char.referenceSheetMimeType) {
          parts.push({ inlineData: { mimeType: char.referenceSheetMimeType, data: char.referenceSheetData } });
          visualPrompt += `参考图 ${imageIndex} 是人物 "${char.name}" 的多角度参考表。\n`;
          imageIndex++;
        }
      }

      parts.push({ text: visualPrompt + basePromptText });
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
      console.log(`[ImageGenerator] Generating with visual refs (Scene: ${params.sceneReferenceImages.length}, Chars: ${params.referenceChars.length})`);
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
