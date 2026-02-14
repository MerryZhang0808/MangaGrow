import { GenerateContentResponse } from '@google/genai';
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL, IMAGE_MODEL } from './gemini.js';

// === Types ===

export interface CharacterAnalysisResult {
  description: string;
  avatarData: string;
  avatarMimeType: string;
  gender: string;
  ageGroup: string;
}

// === Step 1: Analyze photo → detailed visual description ===

export async function analyzeCharacter(
  name: string,
  imageData: string,
  mimeType: string
): Promise<string> {
  console.log(`[CharacterAnalyzer] Step 1: Analyze character "${name}"`);
  const ai = getAiClient();

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageData } },
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
      responseMimeType: 'application/json',
      safetySettings: SAFETY_SETTINGS
    }
  }));

  const cleanJson = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}';
  const json = JSON.parse(cleanJson);
  return json.description || `一个可爱的卡通版 ${name}`;
}

// === Step 1.5: Detect gender and age from photo ===

export async function detectGenderAge(
  imageData: string,
  mimeType: string
): Promise<{ gender: string; ageGroup: string }> {
  console.log('[CharacterAnalyzer] Step 1.5: Detect gender/age');
  const ai = getAiClient();

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: `分析这张照片中的人物，识别以下信息：

1. 性别：男 / 女 / 未知（如果无法判断则返回"未知"）
2. 年龄段：婴儿(0-1岁) / 幼儿(1-3岁) / 儿童(3-6岁) / 少儿(6-12岁) / 成人 / 未知

输出 JSON 格式：
{
  "gender": "男" | "女" | "未知",
  "ageGroup": "婴儿(0-1岁)" | "幼儿(1-3岁)" | "儿童(3-6岁)" | "少儿(6-12岁)" | "成人" | "未知"
}` }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      safetySettings: SAFETY_SETTINGS
    }
  }));

  const cleanJson = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}';
  const json = JSON.parse(cleanJson);
  return {
    gender: json.gender || '未知',
    ageGroup: json.ageGroup || '未知'
  };
}

// === Step 2: Generate Q-version avatar (2K, 1:1, with photo reference) ===

export async function generateAvatar(
  name: string,
  imageData: string,
  mimeType: string,
  description: string,
  gender?: string,
  ageGroup?: string,
  specificAge?: string
): Promise<{ data: string; mimeType: string }> {
  console.log(`[CharacterAnalyzer] Step 2: Generate avatar for "${name}"`);
  const ai = getAiClient();

  let genderAgeInfo = '';
  if (gender || ageGroup || specificAge) {
    genderAgeInfo = '\n【人物属性】\n';
    if (gender) genderAgeInfo += `性别：${gender}\n`;
    if (ageGroup) genderAgeInfo += `年龄段：${ageGroup}\n`;
    if (specificAge) genderAgeInfo += `具体年龄：${specificAge}\n`;
  }

  const imageResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: `⚠️ 重要：请严格参考这张照片中的人物特征，生成一个高质量的Q版卡通头像。

【人物描述】
${description}${genderAgeInfo}

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
        aspectRatio: '1:1',  // C17: Avatar aspect ratio fixed to 1:1
        imageSize: '2K'
      }
    }
  }));

  for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return { data: part.inlineData.data!, mimeType: part.inlineData.mimeType! };
    }
  }

  throw new Error('Failed to generate avatar image');
}

// === Step 3: Update description with confirmed gender/age info ===

export function updateCharacterDescription(
  currentDescription: string,
  gender: string,
  ageGroup: string,
  specificAge?: string
): string {
  // C19: description format must include clear age info
  const genderText = gender || '未知性别';
  const ageText = ageGroup || '未知年龄段';
  const specificAgeText = specificAge ? `（具体${specificAge}）` : '';

  // Remove common prefixes like "女孩，", "男孩，", "幼儿，", etc.
  let features = currentDescription;
  features = features.replace(/^[男女]孩?[，,]\s*/, '');
  features = features.replace(/^(婴儿|幼儿|儿童|少儿|成人)[，,]\s*/, '');
  features = features.replace(/^[^\u4e00-\u9fa5]*岁[）)][，,]\s*/, '');

  return `${genderText}，${ageText}${specificAgeText}，${features}`;
}

// === Combined Entry: create full character (analyze → avatar → detect) ===

export async function createCharacterFull(
  name: string,
  imageData: string,
  mimeType: string
): Promise<CharacterAnalysisResult> {
  // Step 1: Analyze and get description
  let description: string;
  try {
    description = await analyzeCharacter(name, imageData, mimeType);
  } catch (e) {
    console.error('[CharacterAnalyzer] Analysis failed, using fallback', e);
    description = `一个可爱的卡通版 ${name}`;
  }

  // Step 2: Generate avatar (2K, 1:1)
  const avatar = await generateAvatar(name, imageData, mimeType, description);

  // Step 3: Detect gender and age (C16: must execute right after avatar gen)
  let gender = '未知';
  let ageGroup = '未知';
  try {
    const detected = await detectGenderAge(imageData, mimeType);
    gender = detected.gender;
    ageGroup = detected.ageGroup;
    console.log(`[CharacterAnalyzer] Detected gender: ${gender}, ageGroup: ${ageGroup}`);
  } catch (e) {
    console.error('[CharacterAnalyzer] Gender/age detection failed, using defaults', e);
  }

  return {
    description,
    avatarData: avatar.data,
    avatarMimeType: avatar.mimeType,
    gender,
    ageGroup
  };
}
