import { GenerateContentResponse } from '@google/genai';
import { StoryInput, StoryOutput, SceneScript, KeyObject, CharacterDef } from '../types.js';
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL } from './gemini.js';
import { getStyleDescription } from './styleConfig.js';

const STORY_SYSTEM_PROMPT = `你是一位儿童成长漫画故事创作助手。
你的任务是将家长描述的孩子成长瞬间转化为温馨的漫画分镜脚本。
要求：
- 故事结构必须有起承转合
- 每个分镜必须推动叙事，不允许纯装饰镜头
- 人物描述必须包含完整视觉特征（发型、服装、面部）
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
    : `根据故事内容的丰富程度自由决定分镜数量（4-8个），确保叙事完整、节奏合理，不要为了压缩而省略重要情节。`;

  const characterNameList = (input.characters || []).map(c => c.name).join('、');
  const characterNameRule = (input.characters || []).length > 0
    ? `\n⚠️ **人物强制规则（最高优先级）**：
1. 人物库中的所有角色（${characterNameList}）必须全部出现在故事中，不允许遗漏任何一个。
2. 每个分镜描述中出现的人物必须使用**精确名字**，不允许用"男孩"、"女孩"、"孩子"、"爸爸"、"妈妈"等泛指替代。
3. 即使用户描述中只提到部分人物，也必须合理安排其他人物库角色参与故事。\n`
    : '';

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
2. 确认人物库中的所有角色都已被安排到故事中
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

  const characterNameList = (input.characters || []).map(c => c.name).join('、');
  const characterNameRule = (input.characters || []).length > 0
    ? `\n⚠️ **人物强制规则（最高优先级）**：
1. 人物库中的所有角色（${characterNameList}）必须全部出现在故事的分镜中，不允许遗漏。
2. description 中出现的人物必须使用**精确名字**并包含完整视觉特征。
3. 每个角色至少出现在 1 个分镜中。\n`
    : '';

  const prompt = `根据故事大纲，细化每个分镜的详细脚本。

[故事大纲]
${outlineSummary}

[人物档案]
${charInfo || '无预设人物'}

[漫画风格]
${styleDesc}
${issuesBlock}${characterNameRule}
[细化要求]
1. 每个分镜的 description 必须是 50-100 字的详细画面描述
2. 必须包含：人物动作、表情、场景环境、氛围
3. 如果涉及人物库中的角色，描述中必须包含完整视觉特征
4. 标注每个分镜的情感节拍（emotionalBeat）

输出 JSON：
{
  "scripts": [
    { "sceneNumber": 1, "description": "详细画面描述...", "emotionalBeat": "情感节拍" }
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

// === Title Generation (independent, outside 4-step pipeline) ===
export async function generateTitle(
  text: string,
  imageAnalysis?: Array<{ index: number; description: string }>
): Promise<string> {
  console.log('[StoryPipeline] Generating title...');
  const ai = getAiClient();

  const imageDescriptions = (imageAnalysis || []).map(
    a => `图${a.index + 1}: ${a.description}`
  ).join('\n');

  const prompt = `根据以下故事内容，生成一个简短温馨的标题。

[故事内容]
${text || '（无文字描述）'}

[图片描述]
${imageDescriptions || '（无图片）'}

要求：
- 标题长度 5-15 个字
- 温馨、可爱的风格
- 能概括故事核心内容
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
    if (title && title.length >= 2 && title.length <= 30) {
      console.log(`[StoryPipeline] Title generated: ${title}`);
      return title;
    }
    // Title too short/long, fallback
    throw new Error('Title length out of range');
  } catch (e: any) {
    // C31: title failure fallback to input_summary first 15 chars
    console.warn('[StoryPipeline] Title generation failed, using fallback:', e.message);
    const fallback = (text || '未命名故事').slice(0, 15) + ((text || '').length > 15 ? '...' : '');
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

  // Step 4
  const { scripts: finalScripts } = await checkConsistency(
    detailed.scripts || [],
    detailed.characterDefinitions || []
  );

  console.log(`[StoryPipeline] Pipeline complete. ${(finalScripts || []).length} scenes.`);

  return {
    totalScenes: finalScripts.length,
    currentBatch: finalScripts,
    hasMore: false,
    keyObjects: detailed.keyObjects || [],
    characterDefinitions: detailed.characterDefinitions || [],
    storyOutline: outline.arc
  };
}
