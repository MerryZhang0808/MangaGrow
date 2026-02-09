import { GoogleGenAI, Type, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ComicStyle, AspectRatio, Character } from "../types";
import { SYSTEM_PROMPT } from "../constants";

// Helper to get fresh instance with key
const getAiClient = () => {
  return new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
};

// Common safety settings to prevent over-blocking on innocent content
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Helper to parse Data URI and sanitize MIME type
const parseDataUri = (dataUri: string) => {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mimeType: matches[1].split(';')[0], // Remove params like ;charset=utf-8
      data: matches[2]
    };
  }
  // Fallback if raw base64 passed (legacy support)
  return {
    mimeType: 'image/jpeg',
    data: dataUri
  };
};

// Helper to compress image to reduce payload size and prevent 500 errors
const compressImage = async (dataUri: string, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    // If not in browser (e.g. server side), return original
    if (typeof window === 'undefined') {
      return resolve(dataUri);
    }
    
    const img = new Image();
    img.src = dataUri;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if too large
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUri);
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        // Convert to JPEG with reduced quality
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (e) {
        console.warn("Image compression failed, using original", e);
        resolve(dataUri);
      }
    };
    img.onerror = () => {
      console.warn("Image load failed during compression, using original");
      resolve(dataUri);
    };
  });
};

// Retry wrapper for API calls
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      const errMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      console.warn(`API call failed (attempt ${i + 1}/${retries}):`, errMsg);
      
      // If it's a 4xx error (client error), generally don't retry unless it's 429 (Too Many Requests)
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw e;
      }
      
      // Wait before retrying (exponential backoff + jitter)
      const baseDelay = 1000 * Math.pow(2, i);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError;
}

// 1. Transcribe Audio
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const ai = getAiClient();
  const reader = new FileReader();
  
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64Audio = (reader.result as string).split(',')[1];
        // Clean mime type (remove codecs=...)
        const cleanMimeType = audioBlob.type.split(';')[0];
        
        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType || 'audio/webm',
                  data: base64Audio
                }
              },
              {
                text: "将这段语音转录为文字。这是一位家长在描述孩子的成长瞬间。请准确转录所有内容，保留口语化风格。"
              }
            ]
          },
          config: {
             safetySettings: SAFETY_SETTINGS
          }
        }));
        resolve(response.text || "");
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};

// 2. Analyze Images
export const analyzeImages = async (imageUris: string[]): Promise<string> => {
  if (imageUris.length === 0) return "[]";

  const results: any[] = [];

  // Process images sequentially
  for (let i = 0; i < imageUris.length; i++) {
    const originalUri = imageUris[i];
    
    // Add delay between requests
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      // Compress image before sending to avoid payload limits/500 errors
      const compressedUri = await compressImage(originalUri);
      const { mimeType, data } = parseDataUri(compressedUri);
      
      const ai = getAiClient();
      
      // Use 'gemini-flash-latest' (1.5 Flash) for image analysis as it's often more stable for this task than 3-preview
      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-flash-latest', 
        contents: {
          parts: [
            { inlineData: { mimeType, data } },
            { 
              text: `分析这张图片。
              提取：场景、人物动作、关键物品、情绪氛围。
              
              输出 JSON 格式: { "description": "一段详细的画面描述..." }` 
            }
          ]
        },
        config: { 
          responseMimeType: "application/json",
          safetySettings: SAFETY_SETTINGS
        }
      }), 4);

      const text = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || "{}";
      try {
        const parsed = JSON.parse(text);
        results.push({
          index: i,
          description: parsed.description || `图${i + 1}: 分析完成。`
        });
      } catch (e) {
        results.push({
          index: i,
          description: text // Fallback to raw text
        });
      }
    } catch (e: any) {
      const errMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      console.warn(`Failed to analyze image ${i} (will use fallback):`, errMsg);
      // Provide a fallback that guides the AI to generate something reasonable instead of failing
      results.push({
        index: i,
        description: `图${i + 1}: [图片分析不可用] 请根据上下文和人物性格创作画面。`
      });
    }
  }

  return JSON.stringify(results);
};

// 3. Generate Scripts
export const generateScripts = async (
  text: string, 
  imageAnalysis: string, 
  characters: Character[], 
  style: ComicStyle,
  imageCount: number = 0 // New param
): Promise<any> => {
  const ai = getAiClient();
  
  // Prepare character info string
  const charInfo = characters.map(c => `[Character Name: ${c.name}] Description: ${c.description}`).join('\n');

  // Logic for image-based generation vs text-only
  const imageConstraintPrompt = imageCount > 0 
    ? `
    [重要规则：图片对应]
    用户上传了 ${imageCount} 张照片。
    你必须**严格生成 ${imageCount} 个分镜**。
    分镜 1 必须对应图片分析结果中的 Index 0 (第一张图)。
    分镜 2 必须对应图片分析结果中的 Index 1 (第二张图)。
    以此类推。
    
    你的任务是将这 ${imageCount} 个画面串联成一个连贯的、有逻辑的成长故事。
    `
    : `
    [常规生成]
    根据描述创作一个2-4格的漫画故事。
    `;

  const prompt = `
    根据以下信息生成漫画分镜脚本。
    
    [输入信息]
    用户描述：${text || "（无文字描述）"}
    图片数量：${imageCount}
    图片分析结果（JSON）：${imageAnalysis || "[]"}
    人物库参考：${charInfo || "（无预设人物）"}
    漫画风格：${style}
    
    ${imageConstraintPrompt}
    
    [任务要求]
    1. 你是一个专业的漫画编剧。
    2. 每个分镜的描述要具体，包含画面中的人物、动作、表情和环境。
    3. **服装忽略**：不要描写服装颜色，除非用户文字强调了换装。
    4. **人物一致性**：如果出现人物库中的名字，请在 characterDefinitions 中使用完全相同的名字。
    5. **临时人物**：如果是新人物，必须生成包含颜色的详细外貌定义。
    
    [输出格式]
    请直接返回 JSON 数据：
    {
      "totalScenes": ${imageCount > 0 ? imageCount : "自动判断(2-4)"},
      "keyObjects": [ ... ],
      "characterDefinitions": [ ... ],
      "currentBatch": [
        { "sceneNumber": 1, "description": "..." },
        { "sceneNumber": 2, "description": "..." }
      ],
      "hasMore": false
    }
  `;

  // Use gemini-3-flash-preview for script generation
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  if (!response.text) {
     throw new Error("AI generated empty response");
  }

  try {
    const cleanJson = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    if (!parsed.currentBatch || !Array.isArray(parsed.currentBatch) || parsed.currentBatch.length === 0) {
       console.warn("AI returned valid JSON but empty batch:", parsed);
       throw new Error("Story generation yielded no scenes");
    }
    return parsed;
  } catch (e: any) {
    console.error("Script JSON parse error. Raw text:", response.text);
    throw new Error("AI response format invalid: " + e.message);
  }
};

// 4. Generate Image (Robust with Fallback)
export const generateImage = async (
  script: string, 
  style: ComicStyle, 
  ratio: AspectRatio,
  characterContext: string = "",
  objectContext: string = "",
  referenceChars: Character[] = [],
  sceneReferenceImages: string[] = [] // Expects single image in array for specific scene mapping
): Promise<string> => {
  const ai = getAiClient();
  
  // Base text prompt
  const basePromptText = `
    任务：绘制一格连贯的漫画分镜。
    风格：${style}
    
    [画面描述]
    ${script}
    
    [人物定义]
    ${characterContext || "无特定人物定义。"}
    
    [关键物品定义]
    ${objectContext || "无特定关键物品。"}
    
    [严格一致性规则 - CRITICAL]
    ⚠️ 以下规则是**强制性的**，违反会导致生成失败：

    1. **发型绝对固定**：
       - 人物的发型、发色、发长必须与定义**完全一致**
       - 禁止改变发型样式、刘海、发饰
       - 如果定义中是短发，绝不能画成长发

    2. **服装颜色锁定**：
       - 必须使用定义中**明确指定的颜色**
       - 例如：蓝色就是蓝色，不能变成紫色或深蓝
       - 禁止自由发挥或调整色调

    3. **服装款式固定**：
       - 必须与定义中的服装类型一致（T恤、连衣裙、外套等）
       - 禁止更换服装类型
       - 细节（领口、袖子、图案）必须保持一致

    4. **面部特征一致**：
       - 眼睛形状、大小、颜色必须一致
       - 眉毛、鼻子、嘴巴的风格必须一致
       - 如有眼镜、发卡等配饰，必须始终存在

    5. **物品一致性**：
       - 如果物品定义中指定了颜色、形状，必须严格遵守
       - 同一物品在不同分镜中必须保持相同外观

    ⚠️ 优先级：一致性 > 美观度 > 创意性

    氛围：温馨、可爱、治愈。高质量插画。
  `;

  // Helper to execute generation
  const executeGeneration = async (hasVisuals: boolean) => {
    const parts: any[] = [];

    // Config for Gemini 3 Pro Image
    const imageConfig = {
      aspectRatio: ratio as any,
      imageSize: '1K' // 使用 1K 以平衡质量与生成速度
    };

    if (hasVisuals) {
      let visualPrompt = "\n[视觉参考信息]\n";
      let imageIndex = 1;

      // 1. Add Scene References (Usually just ONE specific photo for this scene)
      if (sceneReferenceImages.length > 0) {
        // Compress reference image too
        const sceneImg = await compressImage(sceneReferenceImages[0]);
        const { mimeType, data } = parseDataUri(sceneImg);
        parts.push({
          inlineData: { mimeType, data }
        });

        // ⭐ Detect if this is a previously generated image (base64 data URI) or user photo
        const isPreviousScene = sceneReferenceImages[0].startsWith('data:image');

        if (isPreviousScene) {
          // This is a continuity reference from the previous scene
          visualPrompt += `参考图 ${imageIndex} (Reference Image ${imageIndex}) 是**上一个分镜生成的画面**。\n`;
          visualPrompt += `⚠️ **连续性要求**：\n`;
          visualPrompt += `- 人物的【发型、发色、刘海】必须与参考图**完全一致**\n`;
          visualPrompt += `- 人物的【服装颜色、服装类型、服装细节】必须与参考图**完全一致**\n`;
          visualPrompt += `- 人物的【面部特征】（眼睛、眉毛、脸型）必须与参考图**完全一致**\n`;
          visualPrompt += `- 如果参考图中有特定物品（玩具、食物等），且当前脚本也提到该物品，物品外观必须保持一致\n`;
          visualPrompt += `- 只改变：人物的【动作、姿态、表情】和【场景背景】\n`;
          visualPrompt += `- 风格保持：${style} 风格\n\n`;
        } else {
          // This is a user-uploaded photo
          visualPrompt += `参考图 ${imageIndex} (Reference Image ${imageIndex}) 是用户上传的**参考照片**。\n`;
          visualPrompt += `请**严格参考**该图的【构图、视角、背景环境、人物姿态】，但将其**转绘**为 ${style} 风格。\n`;
        }

        imageIndex++;
      }

      // 2. Add Character References
      const maxChars = sceneReferenceImages.length > 0 ? 2 : 3;
      const activeRefs = referenceChars.slice(0, maxChars);
      
      for (const char of activeRefs) {
         // Compress char avatar
         const charImg = await compressImage(char.avatarUrl);
         const { mimeType, data } = parseDataUri(charImg);
        parts.push({
          inlineData: { mimeType, data }
        });
        visualPrompt += `参考图 ${imageIndex} (Reference Image ${imageIndex}) 是人物 "${char.name}" 的形象设定。\n请绘制该人物的面部、发型和服装特征。\n`;
        imageIndex++;
      }
      
      parts.push({ 
        text: visualPrompt + basePromptText 
      });
    } else {
      parts.push({ text: basePromptText });
    }

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-image-preview', 
      contents: { parts: parts },
      config: {
        safetySettings: SAFETY_SETTINGS,
        imageConfig: imageConfig
      }
    }));

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    if (textPart) throw new Error(`AI Refusal: ${textPart}`);
    throw new Error("No image generated");
  };

  const hasAnyRefs = referenceChars.length > 0 || sceneReferenceImages.length > 0;

  try {
    if (hasAnyRefs) {
      console.log(`Attempting image generation with visual references (Scene: ${sceneReferenceImages.length}, Chars: ${referenceChars.length})...`);
      return await executeGeneration(true);
    } else {
      console.log("Attempting text-only image generation...");
      return await executeGeneration(false);
    }
  } catch (e: any) {
    if (hasAnyRefs) {
       console.warn("Visual reference generation failed, falling back to text-only:", e);
       return await executeGeneration(false);
    }
    throw new Error(`Image generation failed: ${e.message}`);
  }
};

// 5. Generate Character Avatar & Description
export const generateCharacter = async (
  name: string, 
  dataUri: string
): Promise<{ avatarUrl: string, description: string }> => {
  const ai = getAiClient();
  
  // Compress input
  const compressedUri = await compressImage(dataUri);
  const { mimeType, data } = parseDataUri(compressedUri);

  // Step 1: Analyze and Generate Description
  let description = `一个可爱的卡通版 ${name}`;
  try {
    const analysisResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          { text: `分析这个人物，为漫画角色创建一个**超详细**的视觉描述。名字：${name}。

          ⚠️ 重要：这个描述将用于保证多个画面中的人物一致性，必须**极其详细**。

          必须包含以下**所有细节**：

          1. **头发（必须非常具体）**：
             - 发型名称（短发/长发/中长发/马尾/双马尾/披肩发等）
             - 确切的发色（不要只说"棕色"，要说"浅棕色"、"深棕色"或"栗色"）
             - 刘海样式（齐刘海/斜刘海/中分/无刘海）
             - 发饰（如有发卡、发带、蝴蝶结，必须说明颜色和位置）

          2. **默认服装（这是固定的，不能改变）**：
             - 上衣类型：（T恤/衬衫/连衣裙/毛衣等）
             - 上衣颜色：**精确颜色名称**（如"天蓝色"、"粉红色"、"柠檬黄"）
             - 上衣特征：（圆领/V领/有图案/纯色/条纹等）
             - 下装类型：（牛仔裤/短裙/长裤等）
             - 下装颜色：**精确颜色名称**
             - 特殊说明：这是该人物的**标准服装**，在所有场景中默认穿着

          3. **面部特征**：
             - 眼睛：大小（大眼睛/小眼睛）、形状（圆眼/杏仁眼）、颜色
             - 眉毛：粗细、形状
             - 脸型：圆脸/瓜子脸/方脸
             - 特殊标记：痣、酒窝、雀斑等

          4. **配饰（如有）**：
             - 眼镜：形状、颜色
             - 首饰：项链、手环等
             - 其他：帽子、背包等

          5. **体型特征**：
             - 年龄段：婴儿（0-1岁）/幼儿（2-3岁）/儿童（4-6岁）/少儿（7-12岁）
             - 身高：矮小/中等/高
             - 体型：瘦弱/标准/圆润

          输出格式（JSON）：
          {
            "description": "一段150-200字的完整描述，包含以上所有要点，用于确保一致性"
          }

          示例格式：
          "${name}，女孩，4岁幼儿。【发型】齐肩短发，浅棕色，齐刘海，左侧别着红色小发卡。【默认服装-固定】上衣为天蓝色短袖T恤，圆领，胸前有白色小兔子图案；下装为深蓝色牛仔短裤。【面部】大眼睛，黑色瞳孔，粗眉毛，圆脸，左脸颊有一个小酒窝。【体型】标准身材，身高偏矮。【特征】笑起来露出两颗小虎牙。"` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        safetySettings: SAFETY_SETTINGS
      }
    }));
    
    const cleanJson = analysisResponse.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || "{}";
    const json = JSON.parse(cleanJson);
    if (json.description) description = json.description;
  } catch (e) {
    console.error("Character analysis failed", e);
  }

  // Step 2: Generate Avatar Image (with photo reference)
  const imageResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data } }, // 传入原始照片作为参考
        { text: `⚠️ 重要：请严格参考这张照片中的人物特征，生成一个高质量的Q版卡通头像。

【人物描述】
${description}

【生成要求 - 必须严格遵守】

1. **面部特征还原（最高优先级）**：
   - 严格复刻照片中的：眼睛形状、眼睛颜色、眉毛形状、鼻子、嘴巴
   - 脸型必须与照片一致（圆脸/长脸/瓜子脸）
   - 肤色必须与照片一致

2. **发型发色还原（最高优先级）**：
   - 发型、发长、发色必须与照片完全一致
   - 刘海样式必须一致
   - 如有发饰，必须保留

3. **Q版卡通化处理**：
   - 头身比：2:1 或 3:1（大头身）
   - 眼睛适当放大，增加可爱感
   - 五官简化但保持特征识别度
   - 整体圆润、萌系

4. **画面要求**：
   - 高质量细腻的插画风格
   - 柔和的暖色调
   - 友好自然的微笑表情
   - 纯白色背景（#FFFFFF）
   - 人物居中，留有适当边距

5. **服装**：
   - 使用人物描述中指定的服装
   - 颜色鲜艳明快

⚠️ 核心原则：保持照片人物的识别度 > 可爱度 > 风格化` }
      ]
    },
    config: {
      safetySettings: SAFETY_SETTINGS,
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "2K" // 提升到 2K 以获得更好的细节
      }
    }
  }));

  let avatarUrl = "";
  for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      avatarUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  if (!avatarUrl) {
    throw new Error("Failed to generate avatar image");
  }

  return { avatarUrl, description };
};
