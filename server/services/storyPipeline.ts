import { GenerateContentResponse } from '@google/genai';
import { StoryInput, StoryOutput, SceneScript, KeyObject, CharacterDef } from '../types.js';
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL } from './gemini.js';
import { getStyleDescription } from './styleConfig.js';

const STORY_SYSTEM_PROMPT = `你是一位儿童成长漫画故事创作助手。
你的任务是将家长描述的孩子成长瞬间转化为温馨的漫画分镜脚本。
要求：
- 故事结构必须有起承转合
- 每个分镜必须推动叙事，不允许纯装饰镜头
- 人物描述必须包含具体外貌细节（发型、服装、表情）
- 始终保持温馨、可爱、治愈的基调
- 严格按要求的 JSON 格式输出`;

// === Internal Types ===

interface StoryOutline {
  scenes: Array<{ beat: string; description: string; emotion: string }>;
  arc: string;
}

interface ReviewResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

interface ConsistencyResult {
  passed: boolean;
  inconsistencies: string[];
  fixes: Array<{ sceneNumber: number; field: string; corrected: string }>;
}

function parseJsonResponse(text: string | undefined): any {
  if (!text) throw new Error('AI generated empty response');
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

// Wrapper: call AI and parse JSON, retry up to maxRetries on empty/invalid response
async function callAiWithJsonRetry(
  ai: any,
  model: string,
  contents: any,
  config: any,
  label: string,
  maxRetries = 4
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model, contents, config
    }));
    try {
      return parseJsonResponse(response.text);
    } catch (e: any) {
      // Diagnostic: log full response structure when text is empty
      if (!response.text) {
        const candidates = (response as any).candidates;
        const finishReason = candidates?.[0]?.finishReason;
        const parts = candidates?.[0]?.content?.parts;
        console.warn(`[StoryPipeline] ${label} empty response diagnostic — finishReason: ${finishReason}, parts: ${JSON.stringify(parts?.map((p: any) => ({ hasText: !!p.text, textLen: p.text?.length })))}, promptFeedback: ${JSON.stringify((response as any).promptFeedback)}`);
      }
      console.warn(`[StoryPipeline] ${label} attempt ${attempt + 1}/${maxRetries + 1}: ${e.message}`);
      if (attempt === maxRetries) throw e;
      // Exponential backoff: 2s, 4s, 8s, 16s
      const delay = 2000 * Math.pow(2, attempt);
      console.log(`[StoryPipeline] ${label} retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// === Step 1: Story Outline Generation ===
async function generateOutline(input: StoryInput): Promise<StoryOutline> {
  console.log('[StoryPipeline] Step 1: Story Outline Generation');
  const ai = getAiClient();

  const imageDescriptions = (input.imageAnalysis || []).map(
    a => `图${a.index + 1}: ${a.description}`
  ).join('\n');

  const charInfo = (input.characters || []).map(
    c => `[${c.name}] ${c.description}`
  ).join('\n');

  const styleDesc = getStyleDescription(input.style as any);

  const sceneCountRule = input.imageCount > 0
    ? `必须严格生成 ${input.imageCount} 个分镜（与用户上传的图片 1:1 对应）。`
    : `根据故事内容决定分镜数量：简单事件生成 2-4 个分镜，内容丰富的故事最多 4 个分镜，确保叙事完整、节奏合理。`;

  // v1.6: 人物规则两档 — 按用户文本是否提及来分档
  const allChars = input.characters || [];
  const inputTextLower = (input.text || '').toLowerCase();
  const mentionedChars = allChars.filter(c => inputTextLower.includes(c.name.toLowerCase()));
  const unmentionedChars = allChars.filter(c => !inputTextLower.includes(c.name.toLowerCase()));

  let characterNameRule = '';
  if (mentionedChars.length > 0) {
    const mentionedList = mentionedChars.map(c => c.name).join('、');
    characterNameRule += `\n⚠️ **人物强制规则（最高优先级）**：
1. 以下角色在用户描述中被提及，必须出现在故事中：${mentionedList}
2. 这些人物出现时必须使用**精确名字**，不允许用泛指（男孩、孩子、爸爸等）替代。\n`;
  }
  if (unmentionedChars.length > 0) {
    const unmentionedList = unmentionedChars.map(c => c.name).join('、');
    characterNameRule += `\n[人物参考]：以下角色在用户描述中未被提及，可根据故事需要决定是否出现，仅作视觉参考：${unmentionedList}\n`;
  }

  const prompt = `根据以下用户输入，分析核心事件并生成漫画故事大纲。

[用户文字描述]
${input.text || '（无文字描述）'}

[图片分析结果]
${imageDescriptions || '（无图片）'}

[人物档案]
${charInfo || '无'}

[风格]
${styleDesc}
${characterNameRule}
[任务]
1. 先从输入中提取：涉及哪些人物、核心事件是什么、主要情感基调、关键细节
2. 根据上方人物规则：被提及的角色必须出现在故事中；未被提及的角色可自行决定是否出现
3. 基于提取的信息，生成漫画故事大纲

[规则]
${sceneCountRule}
- 必须有起承转合结构
- 必须有情感弧线（至少一个情感高点）
- 每个分镜必须推动叙事（不允许纯装饰镜头）
- 前后分镜必须有因果或时间连接

输出 JSON：
{
  "scenes": [
    { "beat": "起", "description": "分镜描述", "emotion": "情感" }
  ],
  "arc": "情感弧线描述"
}`;

  return callAiWithJsonRetry(ai, TEXT_MODEL, prompt, {
    systemInstruction: STORY_SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    safetySettings: SAFETY_SETTINGS
  }, 'Step1-Outline');
}

// === Step 2: Outline Quality Review (no retry, degrade) ===
async function reviewOutline(outline: StoryOutline): Promise<ReviewResult> {
  console.log('[StoryPipeline] Step 2: Outline Quality Review');
  const ai = getAiClient();

  const sceneSummary = (outline.scenes || []).map(
    (s, i) => `分镜${i + 1} [${s.beat}]: ${s.description} (情感: ${s.emotion})`
  ).join('\n');

  const prompt = `作为漫画编剧总监，审核以下故事大纲质量。

[故事大纲]
${sceneSummary}

[情感弧线]
${outline.arc}

[审核维度]
1. 叙事推动力：每个分镜是否推动故事发展？
2. 因果连接：前后分镜是否有逻辑连接？
3. 情感弧线：是否有情感起伏？至少一个情感高点？
4. 故事完整性：是否有起承转合？

输出 JSON：
{
  "passed": true/false,
  "issues": ["问题1"],
  "suggestions": ["修改建议1"]
}`;

  return callAiWithJsonRetry(ai, TEXT_MODEL, prompt, {
    responseMimeType: 'application/json',
    safetySettings: SAFETY_SETTINGS
  }, 'Step2-Review');
}

// === Step 3: Script Detailing ===
async function detailScripts(
  outline: StoryOutline,
  input: StoryInput,
  reviewIssues?: string[]
): Promise<{ scripts: SceneScript[]; keyObjects: KeyObject[]; characterDefinitions: CharacterDef[] }> {
  console.log('[StoryPipeline] Step 3: Script Detailing');
  const ai = getAiClient();

  const charInfo = (input.characters || []).map(
    c => `[人物: ${c.name}]\n外貌特征: ${c.description}`
  ).join('\n\n');

  const styleDesc = getStyleDescription(input.style as any);

  const outlineSummary = (outline.scenes || []).map(
    (s, i) => `分镜${i + 1} [${s.beat}]: ${s.description} (情感: ${s.emotion})`
  ).join('\n');

  const issuesBlock = reviewIssues && reviewIssues.length > 0
    ? `\n[大纲审核发现的问题 - 请在细化脚本时针对性优化]\n${reviewIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}\n`
    : '';

  // v1.6: 人物规则两档 — 与 generateOutline 保持一致
  const allCharsDetail = input.characters || [];
  const inputTextLowerDetail = (input.text || '').toLowerCase();
  const mentionedCharsDetail = allCharsDetail.filter(c => inputTextLowerDetail.includes(c.name.toLowerCase()));
  const unmentionedCharsDetail = allCharsDetail.filter(c => !inputTextLowerDetail.includes(c.name.toLowerCase()));

  let characterNameRule = '';
  if (mentionedCharsDetail.length > 0) {
    const mentionedList = mentionedCharsDetail.map(c => c.name).join('、');
    characterNameRule += `\n⚠️ **人物强制规则（最高优先级）**：
1. 以下角色在用户描述中被提及，必须出现在故事的分镜中：${mentionedList}
2. description 中出现的人物必须使用**精确名字**并包含完整视觉特征。\n`;
  }
  if (unmentionedCharsDetail.length > 0) {
    const unmentionedList = unmentionedCharsDetail.map(c => c.name).join('、');
    characterNameRule += `\n[人物参考]：以下角色在用户描述中未被提及，可根据故事需要决定是否出现，仅作视觉参考：${unmentionedList}\n`;
  }

  const prompt = `根据故事大纲，细化每个分镜的详细脚本。

[故事大纲]
${outlineSummary}

[人物档案]
${charInfo || '无预设人物'}

[漫画风格]
${styleDesc}
${issuesBlock}${characterNameRule}
[细化要求]
1. 每个分镜的 description 必须是 50-100 字的详细画面描述，用于漫画绘制，必须包含：人物动作、表情、场景环境、氛围、外貌细节
2. 每个分镜的 caption 是 30-50 字的温馨故事叙述，展示在漫画图下方供读者阅读；必须紧密贴合用户描述的实际情节，用自然生动的语言把这一格发生的事情讲清楚，像在给小朋友讲故事，有画面感、有情感、有细节
3. 标注每个分镜的情感节拍（emotionalBeat）

输出 JSON：
{
  "scripts": [
    { "sceneNumber": 1, "description": "详细画面描述（50-100字，用于漫画绘制）...", "caption": "故事叙述（30-50字，贴合用户情节，有画面感和情感）...", "emotionalBeat": "情感节拍" }
  ],
  "keyObjects": [
    { "name": "物品名", "description": "物品描述" }
  ],
  "characterDefinitions": [
    { "name": "角色名", "description": "角色完整视觉描述" }
  ]
}`;

  return callAiWithJsonRetry(ai, TEXT_MODEL, prompt, {
    systemInstruction: STORY_SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    safetySettings: SAFETY_SETTINGS
  }, 'Step3-Detail');
}

// === Step 4: Consistency Check ===
async function checkConsistency(
  scripts: SceneScript[],
  characterDefinitions: CharacterDef[]
): Promise<{ scripts: SceneScript[]; passed: boolean }> {
  console.log('[StoryPipeline] Step 4: Consistency Check');
  const ai = getAiClient();

  const scriptSummary = (scripts || []).map(
    s => `分镜${s.sceneNumber}: ${s.description}`
  ).join('\n\n');

  const charSummary = (characterDefinitions || []).map(
    c => `[${c.name}] ${c.description}`
  ).join('\n');

  const prompt = `检查以下分镜脚本的一致性。

[分镜脚本]
${scriptSummary}

[角色定义]
${charSummary}

[检查维度]
1. 角色描述一致性
2. 场景连贯性
3. 时间线合理性
4. 物品一致性

输出 JSON：
{
  "passed": true/false,
  "inconsistencies": ["不一致项1"],
  "fixes": [
    { "sceneNumber": 1, "field": "description", "corrected": "修正后的描述" }
  ]
}`;

  const result: ConsistencyResult = await callAiWithJsonRetry(ai, TEXT_MODEL, prompt, {
    responseMimeType: 'application/json',
    safetySettings: SAFETY_SETTINGS
  }, 'Step4-Consistency');

  if (!result.passed && result.fixes && result.fixes.length > 0) {
    console.log(`[StoryPipeline] Consistency fixes applied: ${result.fixes.length}`);
    const fixedScripts = scripts.map(s => {
      const fix = result.fixes.find(f => f.sceneNumber === s.sceneNumber);
      if (fix && fix.field === 'description') {
        return { ...s, description: fix.corrected };
      }
      return s;
    });
    return { scripts: fixedScripts, passed: true };
  }

  return { scripts, passed: result.passed };
}

// === Title Generation (v1.6: internal function, parallel with Step 4) ===
// C31: failure must not block main flow — fallback to first 10 chars of input text
// C37: called via Promise.all alongside checkConsistency in generateStory
async function generateTitleInternal(
  text: string,
  imageAnalysis?: Array<{ index: number; description: string }>
): Promise<string> {
  console.log('[StoryPipeline] Generating title (parallel with Step4)...');
  const ai = getAiClient();

  const imageDesc = imageAnalysis && imageAnalysis.length > 0
    ? `\n[图片内容]\n${imageAnalysis.map(a => `图${a.index + 1}: ${a.description}`).join('\n')}`
    : '';

  const prompt = `根据以下故事内容，生成一个简短的故事标题。

[故事内容]
${text || '（无文字描述）'}${imageDesc}

要求：
- 标题长度 4-10 个字
- 名词短语，优先使用「{人名}+{核心事件}」格式，例如：「小明的第一步」「乐乐学骑车」「妹妹的生日派对」
- 禁止以形容词堆叠开头（不要"美好的..."、"快乐的..."）
- 禁止情绪词汇开头（不要"感动..."、"温暖..."）
- 与故事主题强相关，读即知事
- 只输出标题文字，不要引号、标点或其他内容`;

  try {
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'text/plain',
        safetySettings: SAFETY_SETTINGS
      }
    }));

    const title = (response.text || '').trim();
    if (title && title.length >= 2 && title.length <= 15) {
      console.log(`[StoryPipeline] Title generated: ${title}`);
      return title;
    }
    throw new Error('Title length out of range');
  } catch (e: any) {
    // C31: fallback — first 10 chars of input text
    console.warn('[StoryPipeline] Title generation failed, using fallback:', e.message);
    const fallback = (text || '未命名故事').slice(0, 10) + ((text || '').length > 10 ? '...' : '');
    return fallback;
  }
}

// === Main Entry ===
export async function generateStory(input: StoryInput): Promise<StoryOutput> {
  console.log('[StoryPipeline] Starting 4-step pipeline...');

  // Step 1
  const outline = await generateOutline(input);
  console.log(`[StoryPipeline] Step 1 complete: ${(outline.scenes || []).length} scenes`);

  // Step 2 (no retry, degrade on failure)
  const review = await reviewOutline(outline);
  let reviewIssues: string[] | undefined;
  if (review.passed) {
    console.log('[StoryPipeline] Step 2: PASSED');
  } else {
    console.warn('[StoryPipeline] Step 2: Issues found, forwarding to Step 3');
    reviewIssues = [...(review.issues || []), ...(review.suggestions || [])];
  }

  // Step 3
  const detailed = await detailScripts(outline, input, reviewIssues);
  if (!detailed.scripts || detailed.scripts.length === 0) {
    throw new Error('Script detailing yielded no scenes');
  }

  // Step 4 + Title Generation — parallel (C37)
  const [{ scripts: finalScripts }, title] = await Promise.all([
    checkConsistency(detailed.scripts || [], detailed.characterDefinitions || []),
    generateTitleInternal(input.text, input.imageAnalysis)
  ]);

  console.log(`[StoryPipeline] Pipeline complete. ${(finalScripts || []).length} scenes. Title: "${title}"`);

  return {
    totalScenes: finalScripts.length,
    currentBatch: finalScripts,
    hasMore: false,
    keyObjects: detailed.keyObjects || [],
    characterDefinitions: detailed.characterDefinitions || [],
    storyOutline: outline.arc,
    title
  };
}
