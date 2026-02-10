import { GenerateContentResponse } from "@google/genai";
import { StoryInput, StoryOutput, SceneScript, KeyObject, CharacterDef } from "../types";
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL } from "./aiClient";
import { getStyleDescription } from "./styleConfig";

const STORY_SYSTEM_PROMPT = `你是一位儿童成长漫画故事创作助手。
你的任务是将家长描述的孩子成长瞬间转化为温馨的漫画分镜脚本。
要求：
- 故事结构必须有起承转合
- 每个分镜必须推动叙事，不允许纯装饰镜头
- 人物描述必须包含完整视觉特征（发型、服装、面部）
- 始终保持温馨、可爱、治愈的基调
- 严格按要求的 JSON 格式输出`;

// === Internal Types ===

interface StructuredEvent {
  who: string[];
  what: string;
  emotion: string;
  keyDetails: string;
  imageDescriptions: string[];
}

interface StoryOutline {
  scenes: Array<{
    beat: string;        // 起/承/转/合
    description: string;
    emotion: string;
  }>;
  arc: string;           // 情感弧线描述
}

interface ReviewResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

interface ConsistencyResult {
  passed: boolean;
  inconsistencies: string[];
  fixes: Array<{
    sceneNumber: number;
    field: string;
    corrected: string;
  }>;
}

// === Helper: parse JSON response safely ===
function parseJsonResponse(text: string | undefined): any {
  if (!text) throw new Error("AI generated empty response");
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

// === Step 1: Input Analysis ===
async function analyzeInput(input: StoryInput): Promise<StructuredEvent> {
  console.log("[StoryPipeline] Step 1: Input Analysis");
  const ai = getAiClient();

  const imageDescriptions = input.imageAnalysis.map(
    (a) => `图${a.index + 1}: ${a.description}`
  ).join('\n');

  const charInfo = input.characters.map(
    c => `${c.name}: ${c.description}`
  ).join('\n');

  const prompt = `分析以下用户输入，提取结构化事件信息。

[用户文字描述]
${input.text || "（无文字描述）"}

[图片分析结果]
${imageDescriptions || "（无图片）"}

[已知人物]
${charInfo || "（无已知人物）"}

请提取：
1. who: 涉及的人物名字列表
2. what: 核心事件描述（一句话）
3. emotion: 主要情感基调
4. keyDetails: 用户提到的关键细节（物品、场所、时间等）
5. imageDescriptions: 每张图片的简要描述列表

输出 JSON：
{
  "who": ["人物1", "人物2"],
  "what": "核心事件",
  "emotion": "情感基调",
  "keyDetails": "关键细节",
  "imageDescriptions": ["图1描述", "图2描述"]
}`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      systemInstruction: STORY_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return parseJsonResponse(response.text);
}

// === Step 2: Story Outline Generation ===
async function generateOutline(
  event: StructuredEvent,
  input: StoryInput,
  previousSuggestions?: string
): Promise<StoryOutline> {
  console.log("[StoryPipeline] Step 2: Story Outline Generation");
  const ai = getAiClient();

  const charInfo = input.characters.map(
    c => `[${c.name}] ${c.description}`
  ).join('\n');

  const styleDesc = getStyleDescription(input.style);

  const sceneCountRule = input.imageCount > 0
    ? `必须严格生成 ${input.imageCount} 个分镜（与用户上传的图片 1:1 对应）。`
    : `生成 2-4 个分镜。`;

  const suggestionBlock = previousSuggestions
    ? `\n[上一次审核的修改建议 - 请务必按此修改]\n${previousSuggestions}\n`
    : '';

  const prompt = `根据以下结构化事件，生成漫画故事大纲。

[事件信息]
人物：${event.who.join('、')}
事件：${event.what}
情感：${event.emotion}
细节：${event.keyDetails}
图片描述：${event.imageDescriptions.join(' | ')}

[人物档案]
${charInfo || "无"}

[风格]
${styleDesc}

[规则]
${sceneCountRule}
- 必须有起承转合结构
- 必须有情感弧线（至少一个情感高点）
- 每个分镜必须推动叙事（不允许纯装饰镜头）
- 前后分镜必须有因果或时间连接
${suggestionBlock}
输出 JSON：
{
  "scenes": [
    { "beat": "起", "description": "分镜描述", "emotion": "情感" },
    { "beat": "承", "description": "分镜描述", "emotion": "情感" },
    { "beat": "转", "description": "分镜描述", "emotion": "情感" },
    { "beat": "合", "description": "分镜描述", "emotion": "情感" }
  ],
  "arc": "情感弧线描述"
}`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      systemInstruction: STORY_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return parseJsonResponse(response.text);
}

// === Step 3: Outline Quality Review (Gate 1) ===
async function reviewOutline(outline: StoryOutline): Promise<ReviewResult> {
  console.log("[StoryPipeline] Step 3: Outline Quality Review (Gate 1)");
  const ai = getAiClient();

  const sceneSummary = outline.scenes.map(
    (s, i) => `分镜${i + 1} [${s.beat}]: ${s.description} (情感: ${s.emotion})`
  ).join('\n');

  const prompt = `作为漫画编剧总监，审核以下故事大纲质量。

[故事大纲]
${sceneSummary}

[情感弧线]
${outline.arc}

[审核维度 - 每个都必须检查]
1. 叙事推动力：每个分镜是否推动故事发展？是否有纯装饰性废镜头？
2. 因果连接：前后分镜之间是否有因果或时间上的逻辑连接？
3. 情感弧线：整组分镜是否有情感起伏？是否有至少一个情感高点？
4. 故事完整性：是否有起承转合？是否戛然而止？

输出 JSON：
{
  "passed": true/false,
  "issues": ["问题1", "问题2"],
  "suggestions": ["修改建议1", "修改建议2"]
}

如果没有问题，issues 和 suggestions 为空数组，passed 为 true。
只有存在明显质量问题时才标记为 false。`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return parseJsonResponse(response.text);
}

// === Step 4: Script Detailing ===
async function detailScripts(
  outline: StoryOutline,
  input: StoryInput
): Promise<{ scripts: SceneScript[]; keyObjects: KeyObject[]; characterDefinitions: CharacterDef[] }> {
  console.log("[StoryPipeline] Step 4: Script Detailing");
  const ai = getAiClient();

  const charInfo = input.characters.map(
    c => `[人物: ${c.name}]\n外貌特征: ${c.description}`
  ).join('\n\n');

  const styleDesc = getStyleDescription(input.style);

  const outlineSummary = outline.scenes.map(
    (s, i) => `分镜${i + 1} [${s.beat}]: ${s.description} (情感: ${s.emotion})`
  ).join('\n');

  const prompt = `根据审核通过的故事大纲，细化每个分镜的详细脚本。

[故事大纲]
${outlineSummary}

[人物档案]
${charInfo || "无预设人物"}

[漫画风格]
${styleDesc}

[细化要求]
1. 每个分镜的 description 必须是 50-100 字的详细画面描述
2. 必须包含：人物动作、表情、场景环境、氛围
3. 如果涉及人物库中的角色，描述中必须包含该角色的完整视觉特征（发型、服装、面部特征）
4. 新出现的临时人物必须生成包含颜色的详细外貌定义
5. 标注每个分镜的情感节拍（emotionalBeat）

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

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      systemInstruction: STORY_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return parseJsonResponse(response.text);
}

// === Step 5: Consistency Check (Gate 2) ===
async function checkConsistency(
  scripts: SceneScript[],
  characterDefinitions: CharacterDef[]
): Promise<{ scripts: SceneScript[]; passed: boolean }> {
  console.log("[StoryPipeline] Step 5: Consistency Check (Gate 2)");
  const ai = getAiClient();

  const scriptSummary = scripts.map(
    s => `分镜${s.sceneNumber}: ${s.description}`
  ).join('\n\n');

  const charSummary = characterDefinitions.map(
    c => `[${c.name}] ${c.description}`
  ).join('\n');

  const prompt = `检查以下分镜脚本的一致性。

[分镜脚本]
${scriptSummary}

[角色定义]
${charSummary}

[检查维度]
1. 角色描述一致性：同一角色在不同分镜中的外貌描述是否一致？
2. 场景连贯性：前后分镜的场景是否逻辑连贯？
3. 时间线合理性：事件的时间顺序是否合理？
4. 物品一致性：同一物品在不同分镜中是否描述一致？

输出 JSON：
{
  "passed": true/false,
  "inconsistencies": ["不一致项1", "不一致项2"],
  "fixes": [
    { "sceneNumber": 1, "field": "description", "corrected": "修正后的描述" }
  ]
}

如果没有不一致，inconsistencies 和 fixes 为空数组，passed 为 true。
只修正确实不一致的部分，不要重写整个描述。`;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS
    }
  }));

  const result: ConsistencyResult = parseJsonResponse(response.text);

  // Apply fixes if any
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

// === Main Entry: generateStory ===
export async function generateStory(input: StoryInput): Promise<StoryOutput> {
  console.log("[StoryPipeline] Starting 5-step pipeline...");

  // Step 1: Input Analysis
  const event = await analyzeInput(input);
  console.log("[StoryPipeline] Step 1 complete:", event.what);

  // Step 2 + Step 3: Outline Generation with Quality Gate (max 2 retries)
  let outline: StoryOutline | null = null;
  let suggestions: string | undefined;
  const MAX_OUTLINE_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_OUTLINE_RETRIES; attempt++) {
    outline = await generateOutline(event, input, suggestions);

    const review = await reviewOutline(outline);

    if (review.passed) {
      console.log("[StoryPipeline] Step 3: Outline PASSED review");
      break;
    }

    if (attempt < MAX_OUTLINE_RETRIES) {
      console.log(`[StoryPipeline] Step 3: Outline FAILED review (attempt ${attempt + 1}/${MAX_OUTLINE_RETRIES}), retrying with suggestions...`);
      suggestions = review.suggestions.join('\n');
    } else {
      console.warn("[StoryPipeline] Step 3: Max retries reached, proceeding with last outline (degraded)");
    }
  }

  if (!outline) {
    throw new Error("Story outline generation failed");
  }

  // Step 4: Script Detailing
  const detailed = await detailScripts(outline, input);

  if (!detailed.scripts || detailed.scripts.length === 0) {
    throw new Error("Script detailing yielded no scenes");
  }

  // Step 5: Consistency Check
  const { scripts: finalScripts } = await checkConsistency(
    detailed.scripts,
    detailed.characterDefinitions || []
  );

  console.log(`[StoryPipeline] Pipeline complete. ${finalScripts.length} scenes generated.`);

  return {
    totalScenes: finalScripts.length,
    currentBatch: finalScripts,
    hasMore: false,
    keyObjects: detailed.keyObjects || [],
    characterDefinitions: detailed.characterDefinitions || [],
    storyOutline: outline.arc
  };
}
