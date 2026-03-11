import { GenerateContentResponse } from '@google/genai';
import { getAiClient, withRetry, SAFETY_SETTINGS, IMAGE_MODEL } from './gemini.js';
import { getStylePrompt } from './styleConfig.js';

// === Types ===

export interface CharacterImageRef {
  name: string;
  description: string; // 人物库视觉描述，与头像图片配对使用
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

  const refCharNames = params.referenceChars.map(c => c.name);
  const hasCharRefs = refCharNames.length > 0;

  // 从 characterContext 中提取非库角色的描述（没有头像的角色）
  const refCharNameSet = new Set(refCharNames.map(n => n.toLowerCase()));
  const nonRefCharContext = hasCharRefs
    ? params.characterContext
        .split('\n\n')
        .filter(block => {
          const nameMatch = block.match(/\[人物:\s*([^\]]+)\]/);
          return !nameMatch || !refCharNameSet.has(nameMatch[1].toLowerCase());
        })
        .join('\n\n')
    : params.characterContext;

  const executeGeneration = async (hasVisuals: boolean): Promise<GeneratedImage> => {
    const parts: any[] = [];

    const imageConfig = {
      aspectRatio: params.ratio as any,
      imageSize: '1K'
    };

    if (hasVisuals) {
      // === 极简策略：图片优先，文字极短，让模型看图画图 ===
      // 原则：每张参考图配 1 句话，不超过 30 字。文本越少，模型越忠于图片。

      // 1. 角色参考图 — 图片紧贴短指令
      for (const char of params.referenceChars) {
        parts.push({ inlineData: { mimeType: char.avatarMimeType, data: char.avatarData } });
        parts.push({ text: `这是「${char.name}」，画面中的「${char.name}」必须与此图外貌完全一致。` });

        if (char.referenceSheetData && char.referenceSheetMimeType) {
          parts.push({ inlineData: { mimeType: char.referenceSheetMimeType, data: char.referenceSheetData } });
          parts.push({ text: `「${char.name}」多角度参考。` });
        }
      }

      // 2. 场景连贯性参考（前一分镜 or 用户照片）
      if (params.characterSnapshots && params.characterSnapshots.length > 0) {
        parts.push({ inlineData: { mimeType: params.characterSnapshots[0].mimeType, data: params.characterSnapshots[0].data } });
        parts.push({ text: `前一分镜画面，保持画风一致。角色外貌以上方各自的参考图为准。` });
      } else if (params.sceneReferenceImages.length > 0) {
        const sceneImg = params.sceneReferenceImages[0];
        parts.push({ inlineData: { mimeType: sceneImg.mimeType, data: sceneImg.data } });
        parts.push({ text: params.isUserPhoto
          ? `用户照片，参考构图和姿态。角色外貌以上方参考图为准。`
          : `前一分镜画面，参考画风。角色外貌以上方参考图为准。` });
      }

      // 3. 场景指令 — 精简到最核心信息
      const charNames = params.referenceChars.map(c => `「${c.name}」`).join('、');
      let prompt = `根据上方参考图中${charNames}的外貌，绘制以下场景。角色的发型、发色、五官必须与各自参考图完全一致。\n\n`;
      prompt += `场景：${params.script}\n`;
      prompt += `风格：${stylePrompt}\n`;
      if (nonRefCharContext) prompt += `其他角色：${nonRefCharContext}\n`;
      if (params.objectContext) prompt += `关键物品：${params.objectContext}\n`;
      prompt += `要求：单格漫画，无水印无文字，温馨可爱治愈风格。`;

      parts.push({ text: prompt });
    } else {
      // Text-only: 把 characterContext 完整放入
      const textOnlyPrompt = `[RULE]
你是漫画绘师，请根据角色描述和场景描述生成漫画画面。

[CHARACTERS]
${params.characterContext || '无特定人物定义。'}

[SCENE]
${params.script}

[OBJECTS]
${params.objectContext || '无特定关键物品。'}

[STYLE]
${stylePrompt}

[OUTPUT]
单格漫画，无水印/文字/多指，温馨可爱治愈风格。High quality illustration, detailed.`;
      parts.push({ text: textOnlyPrompt });
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
    throw new Error(`Image generation failed: ${e.message}`, { cause: e });
  }
}
