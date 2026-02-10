# Architecture - MangaGrow 漫画成长记录

## 概述

MangaGrow 采用 React + Vite + TypeScript 前端架构，所有 AI 能力通过 Gemini API 实现。
核心架构升级方向：将现有的「单步 AI 调用」改为「多步管线 + 质量关卡」，
将「单一服务文件」拆分为「专职服务模块」，通过角色参考表和风格参数锁定提升生成质量。

技术栈：React 18 + Vite + TypeScript + Gemini API（@google/genai SDK）
模型选型：gemini-3-flash-preview（文本）、gemini-3-pro-image-preview（图片）
运行方式：纯前端 SPA，无后端，数据存 LocalStorage

---

## 模块设计

### 模块总览

```
App.tsx（调度中心）
  ├── InputPanel（输入采集）
  ├── DisplayPanel（分镜展示）
  ├── CharacterLibrary（人物库管理）
  │
  ├── services/
  │   ├── inputService.ts        ← 输入处理（语音转文字、图片分析）
  │   ├── storyService.ts        ← 故事管线（5步管线 + 质量关卡）
  │   ├── imageService.ts        ← 图片生成（分镜图、角色头像）
  │   ├── characterService.ts    ← 角色系统（参考表生成、档案管理）
  │   ├── styleConfig.ts         ← 风格参数配置（4组参数锁定）
  │   └── aiClient.ts            ← AI 调用基础层（客户端、重试、安全设置）
  │
  ├── types.ts（类型定义）
  ├── constants.ts（系统提示词）
  └── utils/
      ├── imageUtils.ts          ← 图片压缩、格式转换
      └── storageUtils.ts        ← LocalStorage 读写
```

| 模块名 | 职责 | 主要文件 | 依赖 |
|--------|------|---------|------|
| aiClient | AI 调用基础设施：客户端实例、重试机制、安全设置 | `services/aiClient.ts` | 无 |
| styleConfig | 风格参数配置：4 组详细风格提示词 | `services/styleConfig.ts` | 无 |
| inputService | 语音转文字、图片分析 | `services/inputService.ts` | aiClient |
| characterService | 角色分析、头像生成、参考表生成、档案管理 | `services/characterService.ts` | aiClient, imageUtils |
| storyService | 5 步故事管线（输入分析→大纲→审核→脚本→一致性检查）| `services/storyService.ts` | aiClient, characterService |
| imageService | 分镜图片生成（提示词构造、参考图注入、生成调用）| `services/imageService.ts` | aiClient, styleConfig, characterService |
| imageUtils | 图片压缩、DataURI 解析 | `utils/imageUtils.ts` | 无 |
| storageUtils | LocalStorage 读写封装 | `utils/storageUtils.ts` | 无 |

---

### aiClient 模块

**职责**：提供 Gemini API 调用的基础设施，所有服务通过此模块调用 API。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `getAiClient()` | 无 | `GoogleGenAI` 实例 | 获取 API 客户端（读取 VITE_GEMINI_API_KEY） |
| `withRetry<T>(operation, retries?)` | `() => Promise<T>`, `number` | `Promise<T>` | 指数退避重试，默认 3 次，4xx 不重试（429 除外） |
| `SAFETY_SETTINGS` | - | `SafetySetting[]` | 全局安全设置常量 |
| `TEXT_MODEL` | - | `string` | 文本模型常量 = `'gemini-3-flash-preview'` |
| `IMAGE_MODEL` | - | `string` | 图片模型常量 = `'gemini-3-pro-image-preview'` |

**约束**：
- 所有 API 调用必须通过 `withRetry` 包装
- 模型名称必须从此模块的常量引用，不允许在其他文件硬编码模型名
- API Key 通过 `import.meta.env.VITE_GEMINI_API_KEY` 读取，不允许使用 `process.env`

---

### styleConfig 模块

**职责**：管理 4 种漫画风格的完整提示词参数。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `getStylePrompt(style)` | `ComicStyle` | `string` | 获取指定风格的完整英文提示词 |
| `getStyleDescription(style)` | `ComicStyle` | `string` | 获取指定风格的中文描述（用于脚本生成） |

**风格参数（硬编码，不允许运行时修改）**：

| 风格 | 英文提示词关键词 |
|------|-----------------|
| 温馨卡通 | `soft lighting, warm color palette, rounded features, gentle expressions, pastel background, children's book illustration style, cozy atmosphere` |
| 柔和水彩 | `watercolor technique, soft edges, muted tones, flowing colors, gentle gradients, hand-painted feel, dreamy atmosphere, light wash effect` |
| 简约扁平 | `flat design, clean lines, bold solid colors, minimal shadows, geometric shapes, modern illustration, simple background, vector art style` |
| 手绘涂鸦 | `hand-drawn sketch, pencil texture, loose lines, playful doodle style, casual strokes, notebook paper feel, spontaneous and fun` |

**约束**：
- 同一组分镜必须使用完全相同的风格参数
- 生成图片的提示词必须包含完整的风格关键词，不允许只传风格名称
- 风格参数不允许在分镜间修改

---

### inputService 模块

**职责**：处理用户输入（语音转文字、图片分析）。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `transcribeAudio(audioBlob)` | `Blob` | `Promise<string>` | 语音转文字 |
| `analyzeImages(imageUris)` | `string[]` | `Promise<ImageAnalysis[]>` | 分析多张图片，返回结构化结果 |

**内部流程（analyzeImages）**：
1. 逐张压缩图片（maxWidth=800, quality=0.6）
2. 调用 gemini-3-flash-preview 分析（当前代码使用 gemini-flash-latest，需统一）
3. 解析 JSON 结果
4. 单张分析失败时返回降级描述，不中断整体流程

**约束**：
- 图片分析模型必须统一为 `TEXT_MODEL`（gemini-3-flash-preview）
- 单张图片分析失败不允许中断整体流程，必须返回降级结果
- 图片发送前必须经过压缩（防止 payload 过大导致 500）

---

### characterService 模块

**职责**：角色系统管理——分析照片、生成头像、管理角色档案。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `analyzeCharacter(name, photoDataUri)` | `string`, `string` | `Promise<string>` | 分析照片生成详细视觉描述（150-200 字） |
| `generateAvatar(name, photoDataUri, description)` | `string`, `string`, `string` | `Promise<string>` | 生成 Q 版卡通头像，返回 base64 DataURI |
| `generateReferenceSheet(name, photoDataUri, description)` | `string`, `string`, `string` | `Promise<ReferenceSheet>` | 🔬 生成角色参考表（正面+全身），需 POC 验证 |
| `createCharacter(name, photoDataUri)` | `string`, `string` | `Promise<Character>` | 组合调用：分析 → 生成头像 → 生成参考表 → 返回完整角色 |
| `getCharacterReferences(characters, sceneScript)` | `Character[]`, `string` | `CharacterRef[]` | 从角色列表中筛选当前分镜涉及的角色，返回参考图和描述 |

**角色数据结构升级**：
```typescript
interface Character {
  id: string;
  name: string;
  avatarUrl: string;           // Q版头像（2K）
  description: string;         // 详细视觉描述文字
  originalPhotoUrls: string[]; // 原始照片
  referenceSheetUrl?: string;  // 角色参考表图片（POC 后决定是否启用）
  createdAt: number;
}

interface ReferenceSheet {
  imageUrl: string;            // 参考表图片 base64
  views: string[];             // 包含的角度 ['front', 'full-body']
}
```

**约束**：
- 角色头像分辨率必须使用 2K（2048x2048）
- 生成头像时必须同时传入照片和文字描述（不允许只传文字）
- 角色照片传入 API 前必须压缩
- `referenceSheetUrl` 字段为可选，POC-01 验证通过后启用

---

### storyService 模块（核心升级）

**职责**：5 步故事生成管线 + 2 个质量关卡。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateStory(input)` | `StoryInput` | `Promise<StoryOutput>` | 管线入口，执行完整 5 步流程 |

**StoryInput 类型**：
```typescript
interface StoryInput {
  text: string;                    // 用户文字描述
  imageAnalysis: ImageAnalysis[];  // 图片分析结果
  characters: Character[];         // 人物库角色
  style: ComicStyle;               // 漫画风格
  imageCount: number;              // 用户上传图片数量
}
```

**StoryOutput 类型**：
```typescript
interface StoryOutput {
  totalScenes: number;
  currentBatch: SceneScript[];
  hasMore: boolean;
  keyObjects: KeyObject[];
  characterDefinitions: CharacterDef[];
  storyOutline: string;            // 保留大纲用于后续续写
}

interface SceneScript {
  sceneNumber: number;
  description: string;             // 画面描述（包含角色完整视觉特征）
  emotionalBeat: string;           // 情感节拍标注
}
```

**内部流程（5 步管线）**：

```
Step 1: 输入分析（analyzeInput）
  输入 → 用户文字 + 图片分析结果
  输出 → 结构化事件 { who, what, emotion, keyDetails }
  模型 → TEXT_MODEL
  耗时 → ~1-2秒

Step 2: 故事大纲生成（generateOutline）
  输入 → 结构化事件 + 角色档案 + 风格
  输出 → 故事大纲 { scenes: [{ beat, description, emotion }], arc }
  模型 → TEXT_MODEL
  约束 → 必须有起承转合结构，必须有情感弧线

Step 3: 大纲质量审核（reviewOutline）— 质量关卡 1
  输入 → 故事大纲
  输出 → { passed: boolean, issues: string[], suggestions: string[] }
  模型 → TEXT_MODEL
  审核维度：
    - 每个分镜是否推动叙事？（不允许纯装饰镜头）
    - 前后分镜是否有因果或时间连接？
    - 整组分镜是否有情感起伏？
  不通过 → 带修改建议回到 Step 2（最多重试 2 次）
  2 次仍不通过 → 使用最后一版大纲继续（降级，不阻塞）

Step 4: 分镜脚本细化（detailScripts）
  输入 → 审核通过的大纲 + 角色档案 + 风格描述
  输出 → 逐个分镜的详细脚本
  约束 → 每个分镜的画面描述必须包含角色完整视觉特征
  模型 → TEXT_MODEL

Step 5: 脚本一致性检查（checkConsistency）— 质量关卡 2
  输入 → 全部分镜脚本
  输出 → { passed: boolean, inconsistencies: string[] }
  检查维度：
    - 角色描述是否前后一致？
    - 场景描述是否连贯？
    - 时间线是否合理？
  不通过 → 标记不一致项，局部修正后返回
  模型 → TEXT_MODEL
```

**约束**：
- 5 步管线必须按顺序执行，不允许跳步
- Step 3（质量关卡 1）最多重试 2 次，超过后降级继续
- Step 5（质量关卡 2）不阻塞流程，只做局部修正
- 分镜数量规则：简单故事 2-4 个，复杂故事先生成前 4 个
- 用户上传 N 张图片时，必须严格生成 N 个分镜（1:1 对应）
- 所有步骤的 JSON 输出必须经过 `JSON.parse` 验证

---

### imageService 模块

**职责**：根据脚本生成漫画分镜图片。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateSceneImage(params)` | `SceneImageParams` | `Promise<string>` | 生成单个分镜图片，返回 base64 DataURI |

**SceneImageParams 类型**：
```typescript
interface SceneImageParams {
  script: string;                  // 分镜脚本
  style: ComicStyle;               // 漫画风格
  ratio: AspectRatio;              // 图片比例
  characterContext: string;        // 角色视觉特征描述文字
  objectContext: string;           // 关键物品描述
  referenceChars: Character[];     // 角色参考图（头像/参考表）
  sceneReferenceImages: string[];  // 场景参考图（用户照片或前一分镜图）
}
```

**内部流程**：
1. 调用 `styleConfig.getStylePrompt(style)` 获取完整风格提示词
2. 构造提示词（按优先级：一致性规则 > 角色特征 > 画面描述 > 风格参数 > 质量要求）
3. 注入参考图（场景参考 + 角色参考，总数不超过 Gemini 的 14 张限制）
4. 调用 IMAGE_MODEL 生成图片
5. 从响应中提取图片 base64
6. 有参考图时生成失败 → 降级为纯文字提示词重试

**提示词结构（优先级从高到低）**：
```
1. 一致性规则（角色外观固定、服装颜色锁定等）
2. 角色视觉特征（详细外观描述）
3. 画面描述（场景、动作、表情）
4. 风格参数（完整的风格关键词集）
5. 质量要求（high quality, detailed, professional）
6. 负面约束（no text, no watermark, no distortion）
```

**约束**：
- 分镜图片分辨率使用 1K（1024x1024），平衡质量与生成效率
- 角色头像生成使用 2K（2048x2048），由 characterService 负责
- 每个角色最多传 2 张参考图（头像 + 参考表）
- 参考图总数不超过 6 张（3 角色 × 2 张），留余量给场景参考
- 风格提示词必须从 styleConfig 获取，不允许硬编码
- 有参考图方案失败时必须降级为纯文字方案，不允许直接报错

---

## 技术方案

### 故事管线 技术方案

**需求引用**：Product-Spec.md → 分镜脚本生成、智能分镜拆分

**方案选定**：5 步管线 + 2 质量关卡

**方案描述**：
将现有的单次 `generateScripts()` 调用替换为 `storyService.generateStory()` 5 步管线。
每步独立调用 TEXT_MODEL，步骤之间传递结构化 JSON 数据。
质量关卡不阻塞流程——审核不通过时重试 2 次后降级继续，确保用户不会卡死。

**选型理由**：
- 选 5 步管线：每步专注一个任务，输出质量更稳定；质量关卡能过滤废镜头和逻辑断裂
- 不选单步优化（在一个 prompt 里优化）：单步 prompt 越长，模型注意力越分散，控制力越弱

**实现约束**：
- 管线内每步必须独立调用 API（不合并为一个超长 prompt）
- Step 3 审核不通过时，修改建议必须传回 Step 2 作为 context（不是重新开始）
- Step 5 发现不一致时，只修正不一致的字段，不重新生成全部脚本
- 所有步骤的提示词必须要求 JSON 输出，并设置 `responseMimeType: "application/json"`

**状态**：✅ 确定

---

### 人物一致性 技术方案

**需求引用**：Product-Spec.md → 人物库管理、人物卡通化、生成时参考人物形象

**方案选定**：角色参考表 + 多参考图注入（需 POC 验证参考表生成部分）

**方案描述**：
1. 创建角色时：用户上传照片 → AI 分析生成视觉描述 → 生成 Q 版头像（2K）→ 尝试生成参考表
2. 参考表（POC 后决定）：正面 + 全身，中性姿势和背景
3. 生成分镜时：自动将角色头像（+ 参考表如有）作为 inlineData 传入 API
4. 提示词中必须包含角色完整视觉特征描述（不允许只写名字）

**选型理由**：
- 选参考图注入：Gemini 支持 inlineData 传入参考图，视觉锚点比纯文字描述一致性高 30-40%
- 不选纯提示词：一致性仅 40-60%，无法达到产品级质量
- 不选 LORA/SD：需要后端训练服务，第一期纯前端架构不支持

**实现约束**：
- 角色头像必须 2K 分辨率
- 生成头像时必须同时传入照片（inlineData）+ 文字描述
- 角色照片传入前必须压缩（maxWidth=800, quality=0.6）
- Gemini API 最多 14 张参考图：每个角色最多 2 张，场景参考 1 张，预留余量
- `referenceSheetUrl` 字段可选，POC-01 不通过则不启用

**关键代码模式**：
```typescript
// 生成分镜时注入角色参考图
const parts: Part[] = [];
for (const char of relevantChars) {
  // 头像参考
  parts.push({ inlineData: { mimeType, data: char.avatarUrl } });
  // 参考表（如有）
  if (char.referenceSheetUrl) {
    parts.push({ inlineData: { mimeType, data: char.referenceSheetUrl } });
  }
}
parts.push({ text: fullPrompt });
```

**状态**：🔬 参考表生成需 POC 验证（POC-01），头像 + 描述注入部分已确定

---

### 风格一致性 技术方案

**需求引用**：Product-Spec.md → 4 种漫画风格

**方案选定**：风格参数锁定 + 全局注入

**方案描述**：
用户选择风格后，从 `styleConfig` 获取对应的完整英文提示词关键词集，
每次调用图片生成 API 时自动拼接到提示词中。风格参数在同一组分镜间不可变。

**选型理由**：
- 选参数锁定：4 组参数预定义，稳定可控，不依赖模型理解风格名称
- 不选风格参考图：额外占用 inlineData 槽位，与角色参考图争抢配额

**实现约束**：
- 风格参数在 `styleConfig.ts` 中硬编码，不允许运行时修改
- 图片生成提示词必须调用 `getStylePrompt()` 获取风格参数，不允许自行拼接
- 同一组分镜的所有图片必须使用相同的 `ComicStyle` 值

**状态**：✅ 确定

---

### 图片生成质量 技术方案

**需求引用**：Product-Spec.md → 漫画图片生成

**方案选定**：结构化提示词 + 分辨率策略 + 降级机制

**方案描述**：
- 分镜图片使用 1K 分辨率（平衡效率），角色头像使用 2K 分辨率（需要细节）
- 提示词按 6 层优先级结构组织
- 有参考图方案失败时自动降级为纯文字方案

**选型理由**：
- 分镜 1K：每组 2-4 张图，用户等待时间敏感，1K 生成速度快且质量可接受
- 头像 2K：只生成 1 张，等待时间可接受，需要高细节保证后续引用质量
- 不选全部 2K：4 张 2K 图生成时间过长，影响用户体验

**实现约束**：
- `imageService` 中 `imageSize` 固定为 `'1K'`
- `characterService` 中头像 `imageSize` 固定为 `'2K'`
- 提示词必须按 6 层优先级结构组织（见 imageService 模块设计）
- 降级逻辑：有参考图 → 失败 → 纯文字重试 → 失败 → 向用户报错

**状态**：✅ 确定

---

## 数据流

### 主流程数据流（用户点击「生成漫画」）

```
用户输入文字/语音/照片
      │
      ▼
[InputPanel] ──── 语音 ──→ inputService.transcribeAudio() → 文字
      │                     照片 ──→ inputService.analyzeImages() → ImageAnalysis[]
      │
      ▼
[App.tsx handleGenerate]
      │
      ├─ 1. 调用 inputService 处理输入
      │
      ├─ 2. 调用 storyService.generateStory()
      │     ├─ Step1: 输入分析 → 结构化事件
      │     ├─ Step2: 故事大纲 → 起承转合结构
      │     ├─ Step3: 大纲审核 → 通过/重试
      │     ├─ Step4: 脚本细化 → 详细分镜脚本
      │     └─ Step5: 一致性检查 → 修正
      │     → 返回 StoryOutput
      │
      ├─ 3. 设置 Scene[] 初始状态（loading）
      │
      └─ 4. 逐个分镜调用 imageService.generateSceneImage()
            ├─ 注入风格参数（styleConfig）
            ├─ 注入角色参考（characterService.getCharacterReferences()）
            ├─ 注入场景参考（用户照片或前一分镜图）
            └─ 生成图片 → 更新 Scene 状态
```

### 角色创建数据流

```
用户输入名字 + 上传照片
      │
      ▼
[CharacterLibrary]
      │
      ▼
characterService.createCharacter(name, photoDataUri)
      ├─ 1. analyzeCharacter() → 视觉描述文字
      ├─ 2. generateAvatar() → Q版头像（2K）
      ├─ 3. generateReferenceSheet() → 参考表（POC 后）
      └─ 返回 Character 对象
      │
      ▼
保存到 LocalStorage
```

---

## 质量标准

### 故事生成 质量标准

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 故事完整性 | 必须有起承转合，不允许戛然而止 | Step 3 自动审核 | 重试 2 次后降级 |
| 分镜效率 | 每个分镜必须推动叙事，0 废镜头 | Step 3 审核"是否推动叙事" | 重试时要求删除废镜头 |
| 情感弧线 | 至少有 1 个情感高点 | Step 3 审核"是否有情感起伏" | 重试时强调情感弧线 |
| 角色一致性 | 同一角色在所有分镜中描述一致 | Step 5 一致性检查 | 局部修正不一致字段 |
| 场景连贯性 | 前后分镜场景逻辑连贯 | Step 5 一致性检查 | 局部修正 |
| JSON 格式 | 所有步骤输出必须是合法 JSON | `JSON.parse()` 验证 | 重试 |

### 图片生成 质量标准

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 风格一致性 | 同一组分镜风格参数完全相同 | 代码保证（styleConfig 全局注入） | 不会发生 |
| 角色识别度 | 有参考图时角色特征应可辨认 | 人工审查 | 用户可点击"重绘" |
| 图片完整性 | 必须返回图片 base64 | 代码检查 inlineData | 降级为纯文字重试 |
| 分辨率 | 分镜 1K，头像 2K | 代码固定 imageSize | 不会发生 |

### 角色系统 质量标准

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 描述完整性 | 视觉描述必须 150-200 字，涵盖发型/服装/面部/体型 | 代码检查字数 | 使用降级描述 |
| 头像质量 | 2K 分辨率，人物居中，白色背景 | 人工审查 | 用户可重新生成 |
| 照片参考 | 生成头像时必须同时传入照片和文字描述 | 代码保证（强制参数） | 不会发生 |

---

## 约束清单（红线）

以下规则在代码实现时必须遵守，不允许违反：

| 编号 | 约束规则 | 适用范围 | 原因 |
|------|---------|---------|------|
| C01 | 环境变量必须用 `VITE_` 前缀，代码中用 `import.meta.env.VITE_xxx` | 所有文件 | Vite 要求 |
| C02 | 不允许在组件（.tsx）中直接调用 Gemini API，必须通过 services/ 层 | components/*.tsx | 关注点分离 |
| C03 | 所有 AI 调用必须通过 `withRetry` 包装（至少 3 次重试） | services/*.ts | API 稳定性 |
| C04 | 模型名称必须引用 `aiClient.ts` 中的常量，不允许硬编码 | services/*.ts | 统一管理，方便切换 |
| C05 | 分镜图片分辨率固定 1K，角色头像分辨率固定 2K | imageService, characterService | 效率与质量平衡 |
| C06 | 生成角色头像时必须同时传入照片（inlineData）和文字描述 | characterService | 质量保证 |
| C07 | 图片生成的风格提示词必须从 `styleConfig.getStylePrompt()` 获取 | imageService | 风格一致性 |
| C08 | 同一组分镜必须使用相同的 ComicStyle 和 AspectRatio | App.tsx, imageService | 视觉一致性 |
| C09 | 故事管线 5 步必须按顺序执行，不允许跳步 | storyService | 质量保证 |
| C10 | 质量关卡最多重试 2 次，超过后降级继续，不允许无限循环 | storyService | 防死循环 |
| C11 | 所有 API 响应的 JSON 必须经过 `JSON.parse()` 验证 | services/*.ts | 防格式错误 |
| C12 | 角色照片传入 API 前必须压缩（maxWidth=800, quality=0.6） | characterService, imageService | 防 payload 过大 |
| C13 | `constants.ts` 中的系统提示词必须与 Product-Spec.md 一致 | constants.ts | 文档同步 |
| C14 | 有参考图方案失败时必须降级为纯文字方案，不允许直接报错 | imageService | 用户体验 |
| C15 | Architecture.md 变更时必须同步更新 `architecture-diagram.html` | architecture-diagram.html | 文档可视化同步 |

---

## POC 清单（待验证方案）

| 编号 | 验证目标 | 验证方法 | 预期结果 | 状态 |
|------|---------|---------|---------|------|
| POC-01 | Gemini API 能否根据用户照片稳定生成多角度角色参考表（正面+全身） | 用 3 张不同照片测试，检查生成的参考表角色特征一致性和角度正确性 | 3 次中至少 2 次生成可用的参考表 | 待验证 |

**POC-01 不通过时的降级方案**：
不生成参考表，仅使用头像 + 详细文字描述作为角色参考（即现有方案的增强版）。
`Character.referenceSheetUrl` 字段留空，`imageService` 在注入参考图时跳过。

---

## 版本记录

| 版本 | 日期 | 触发来源 | 变更内容 | 影响范围 |
|------|------|---------|---------|---------|
| v1.0 | 2026-02-09 | Product-Spec v1.0 | 初始架构设计 | 全部模块 |
