# Architecture - MangaGrow 漫画成长记录

## 概述

MangaGrow 采用**前后端分离架构**：React 前端 + Node.js/Express 后端 + SQLite 数据库。
前端负责 UI 交互，后端负责 AI 调用代理、数据持久化、图片文件存储。
AI 能力通过 Gemini API 实现，API Key 仅存在服务端，前端不直接调用 Gemini。

**前端**：React 18 + Vite + TypeScript
**后端**：Node.js + Express + TypeScript
**数据库**：SQLite（better-sqlite3，同步 API）
**文件存储**：本地磁盘 `data/images/`
**AI 模型**：gemini-3-flash-preview（文本）、gemini-3-pro-image-preview（图片）
**运行方式**：前端 :3000（Vite dev server）+ 后端 :3001（Express），Vite proxy 转发 `/api/*`

---

## 模块设计

### 模块总览

```
[前端] comic-growth-record/
  App.tsx（调度中心）
  ├── InputPanel（输入采集）
  ├── DisplayPanel（分镜展示）
  ├── CharacterLibrary（人物库管理）
  │
  ├── services/
  │   ├── apiClient.ts           ← 后端 API 客户端（HTTP 调用封装）
  │   ├── storyService.ts        ← 故事生成（薄封装，调用后端 /api/ai/generate-story）
  │   ├── imageService.ts        ← 图片生成（薄封装，调用后端 /api/ai/generate-image）
  │   ├── characterService.ts    ← 角色系统（薄封装，调用后端 /api/characters + /api/ai/*）
  │   └── inputService.ts        ← 输入处理（薄封装，调用后端 /api/ai/analyze-images）
  │
  ├── types.ts（类型定义）
  └── utils/
      └── imageUtils.ts          ← 前端图片工具（上传预览、格式转换）

[后端] server/
  index.ts（Express 入口）
  ├── routes/
  │   ├── ai.ts                  ← AI 代理路由（7 个端点，所有 Gemini 调用）
  │   ├── characters.ts          ← 人物库 CRUD
  │   ├── stories.ts             ← 漫画历史 CRUD
  │   └── images.ts              ← 图片静态服务
  │
  ├── services/
  │   ├── gemini.ts              ← Gemini API 客户端（API Key、重试、安全设置）
  │   ├── storyPipeline.ts       ← 4 步故事管线（大纲→审核→脚本→一致性）
  │   ├── imageGenerator.ts      ← 图片生成（提示词构造、参考图注入）
  │   ├── characterAnalyzer.ts   ← 角色分析（照片分析、头像生成、性别/年龄识别）
  │   ├── inputAnalyzer.ts       ← 输入处理（语音转文字、图片分析）
  │   ├── styleConfig.ts         ← 风格参数配置（4 组提示词）
  │   └── imageStorage.ts        ← 图片文件管理（保存、读取、删除）
  │
  └── db/
      ├── index.ts               ← SQLite 连接（singleton，WAL 模式）
      └── schema.ts              ← 建表语句 & 迁移

[数据] data/（gitignored）
  ├── manga.db                   ← SQLite 数据库文件
  └── images/
      ├── avatars/               ← 人物头像
      └── scenes/                ← 漫画分镜图片
```

**前端模块**（薄客户端，只负责 UI 和 API 调用）：

| 模块名 | 职责 | 主要文件 | 依赖 |
|--------|------|---------|------|
| apiClient | 后端 API 调用封装：fetch 包装、错误处理、类型安全 | `services/apiClient.ts` | 无 |
| storyService | 故事生成薄封装：调用 apiClient 发送请求到后端 | `services/storyService.ts` | apiClient |
| imageService | 图片生成薄封装：调用 apiClient 发送请求到后端 | `services/imageService.ts` | apiClient |
| characterService | 角色系统薄封装：CRUD + AI 功能调用后端 | `services/characterService.ts` | apiClient |
| inputService | 输入处理薄封装：调用 apiClient 发送请求到后端 | `services/inputService.ts` | apiClient |
| imageUtils | 前端图片工具：上传预览、base64 转换 | `utils/imageUtils.ts` | 无 |

**后端模块**（承载所有 AI 逻辑和数据管理）：

| 模块名 | 职责 | 主要文件 | 依赖 |
|--------|------|---------|------|
| gemini | Gemini API 基础设施：客户端、重试、安全设置、模型常量 | `server/services/gemini.ts` | 无 |
| styleConfig | 风格参数配置：4 组详细风格提示词 | `server/services/styleConfig.ts` | 无 |
| storyPipeline | 4 步故事管线（大纲→审核→脚本→一致性检查）| `server/services/storyPipeline.ts` | gemini, styleConfig |
| imageGenerator | 分镜图片生成（提示词构造、参考图注入）| `server/services/imageGenerator.ts` | gemini, styleConfig, imageStorage |
| characterAnalyzer | 角色分析、头像生成、性别/年龄识别 | `server/services/characterAnalyzer.ts` | gemini, imageStorage |
| inputAnalyzer | 语音转文字、图片分析 | `server/services/inputAnalyzer.ts` | gemini |
| imageStorage | 图片文件管理：保存 base64 到磁盘、生成唯一文件名、删除 | `server/services/imageStorage.ts` | 无 |
| db | SQLite 数据库连接和 schema 管理 | `server/db/index.ts`, `server/db/schema.ts` | 无 |

---

### apiClient 模块（前端）

**职责**：前端唯一的后端通信层，封装所有 `/api/*` HTTP 调用。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `fetchApi<T>(path, options?)` | `string`, `RequestInit` | `Promise<T>` | 基础 fetch 封装，自动处理 JSON 解析和错误 |
| `postAi<T>(endpoint, body)` | `string`, `object` | `Promise<T>` | AI 端点调用：`POST /api/ai/{endpoint}` |
| `getCharacters()` | 无 | `Promise<Character[]>` | 获取人物列表 |
| `createCharacter(data)` | `CreateCharacterRequest` | `Promise<Character>` | 创建人物（含照片 base64） |
| `updateCharacter(id, data)` | `string`, `Partial<Character>` | `Promise<Character>` | 更新人物信息 |
| `deleteCharacter(id)` | `string` | `Promise<void>` | 删除人物 |
| `getStories()` | 无 | `Promise<StorySummary[]>` | 获取历史列表 |
| `saveStory(data)` | `SaveStoryRequest` | `Promise<Story>` | 保存漫画故事 |
| `getStory(id)` | `string` | `Promise<Story>` | 获取故事详情 |
| `deleteStory(id)` | `string` | `Promise<void>` | 删除故事 |

**约束**：
- 前端所有后端通信必须通过此模块，不允许在组件或其他 service 中直接 fetch
- 所有响应必须符合标准格式 `{ success: boolean, data?: T, error?: string }`
- 网络错误自动重试 1 次（仅限 5xx 和网络超时）

---

### gemini 模块（后端）

**职责**：后端 Gemini API 调用基础设施，所有后端服务通过此模块调用 Gemini。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `getAiClient()` | 无 | `GoogleGenAI` 实例 | 获取 API 客户端（读取 `process.env.GEMINI_API_KEY`） |
| `withRetry<T>(operation, retries?)` | `() => Promise<T>`, `number` | `Promise<T>` | 指数退避重试，默认 3 次，4xx 不重试（429 除外） |
| `SAFETY_SETTINGS` | - | `SafetySetting[]` | 全局安全设置常量 |
| `TEXT_MODEL` | - | `string` | 文本模型常量 = `'gemini-3-flash-preview'` |
| `IMAGE_MODEL` | - | `string` | 图片模型常量 = `'gemini-3-pro-image-preview'` |

**约束**：
- 所有 Gemini API 调用必须通过 `withRetry` 包装
- 模型名称必须从此模块的常量引用，不允许在其他文件硬编码模型名
- API Key 通过 `process.env.GEMINI_API_KEY` 读取（服务端 `.env` 文件）
- 此模块仅在后端（`server/`）中使用，前端不允许导入

---

### styleConfig 模块（后端）

**职责**：管理 4 种漫画风格的完整提示词参数。迁移自前端，现仅在后端使用。

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

### imageStorage 模块（后端）

**职责**：管理图片文件的磁盘存储和读取。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `saveImage(type, base64Data, mimeType?)` | `'avatars'\|'scenes'`, `string`, `string` | `string` | 保存 base64 图片到磁盘，返回相对路径（如 `avatars/abc123.png`） |
| `getImageFullPath(relativePath)` | `string` | `string` | 返回图片的完整磁盘路径 |
| `deleteImage(relativePath)` | `string` | `void` | 删除指定图片文件 |
| `ensureDirectories()` | 无 | `void` | 确保 `data/images/avatars/` 和 `data/images/scenes/` 目录存在 |

**文件命名规则**：
- 格式：`{uuid}.{ext}`（如 `a1b2c3d4.png`）
- UUID 使用 `crypto.randomUUID()`
- 扩展名从 mimeType 推断（`image/png` → `.png`，`image/jpeg` → `.jpg`）

**约束**：
- 所有图片必须存储在 `data/images/{type}/` 下，不允许存到其他位置
- 文件名必须唯一（UUID），防止覆盖
- 服务启动时必须调用 `ensureDirectories()` 创建目录

---

### db 模块（后端）

**职责**：SQLite 数据库连接和 schema 管理。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `getDb()` | 无 | `Database` | 获取 SQLite 连接（singleton，WAL 模式） |
| `initDb()` | 无 | `void` | 初始化数据库：创建表（如不存在） |

**数据库表**：

```sql
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  avatar_path TEXT,
  description TEXT,
  original_photo_paths TEXT,  -- JSON array
  reference_sheet_path TEXT,
  gender TEXT,
  age_group TEXT,
  specific_age TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  input_summary TEXT,
  style TEXT,
  aspect_ratio TEXT,
  story_outline TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  script TEXT,
  image_path TEXT,
  emotional_beat TEXT,
  created_at INTEGER NOT NULL
);
```

**约束**：
- 数据库连接必须使用 singleton 模式
- 必须启用 WAL 模式（`PRAGMA journal_mode = WAL`）提升并发性能
- 所有表必须包含 `user_id` 字段（当前为 NULL，预留多用户）
- `stories` 删除时自动级联删除关联的 `scenes`（ON DELETE CASCADE）

---

### inputService 模块（前端薄封装 + 后端 inputAnalyzer）

**前端 inputService**（薄封装）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `transcribeAudio(audioBlob)` | `Blob` | `Promise<string>` | 调用 `apiClient.postAi('transcribe-audio', ...)` |
| `analyzeImages(imageUris)` | `string[]` | `Promise<ImageAnalysis[]>` | 调用 `apiClient.postAi('analyze-images', ...)` |

**后端 inputAnalyzer**（完整逻辑，迁移自前端）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `transcribeAudio(audioBase64, mimeType)` | `string`, `string` | `Promise<string>` | 语音转文字，调用 TEXT_MODEL |
| `analyzeImages(imageBase64s)` | `string[]` | `Promise<ImageAnalysis[]>` | 并行分析多张图片 |

**后端内部流程（analyzeImages）**：
1. 所有图片并行处理（Promise.all），每张图独立压缩（maxWidth=800, quality=0.6）+ 分析
2. 调用 TEXT_MODEL（gemini-3-flash-preview）分析
3. 解析 JSON 结果，按原始顺序排序返回
4. 单张分析失败时返回降级描述，不中断整体流程

**约束**：
- 图片分析模型必须统一为 `TEXT_MODEL`（gemini-3-flash-preview）
- 单张图片分析失败不允许中断整体流程，必须返回降级结果
- 图片发送前必须经过压缩（防止 payload 过大导致 500）

---

### characterService 模块（前端薄封装 + 后端 characterAnalyzer）

**前端 characterService**（薄封装，调用后端 API）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `createCharacter(name, photoBase64)` | `string`, `string` | `Promise<Character>` | 调用 `apiClient.createCharacter()`，后端执行完整创建流程 |
| `getCharacters()` | 无 | `Promise<Character[]>` | 调用 `apiClient.getCharacters()` |
| `updateCharacter(id, data)` | `string`, `Partial<Character>` | `Promise<Character>` | 调用 `apiClient.updateCharacter()` |
| `deleteCharacter(id)` | `string` | `Promise<void>` | 调用 `apiClient.deleteCharacter()` |
| `regenerateAvatar(id, gender?, ageGroup?, specificAge?)` | `string`, `string?`, `string?`, `string?` | `Promise<Character>` | 调用 `apiClient.postAi('generate-avatar', ...)` |
| `updateCharacterDescription(character, gender, ageGroup, specificAge?)` | `Character`, `string`, `string`, `string?` | `string` | 纯前端函数：更新角色描述格式（不需要后端） |
| `getCharacterReferences(characters, sceneScript)` | `Character[]`, `string` | `CharacterRef[]` | 纯前端函数：筛选当前分镜涉及的角色 |

**后端 characterAnalyzer**（完整 AI 逻辑）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `analyzeCharacter(name, photoBase64)` | `string`, `string` | `Promise<string>` | 分析照片生成详细视觉描述（150-200 字） |
| `detectGenderAge(photoBase64)` | `string` | `Promise<{gender, ageGroup}>` | 识别性别和年龄段 |
| `generateAvatar(name, photoBase64, description, gender?, ageGroup?, specificAge?)` | ... | `Promise<string>` | 生成 Q 版头像，返回图片文件路径（保存到磁盘） |
| `generateReferenceSheet(name, photoBase64, description)` | ... | `Promise<ReferenceSheet>` | 🔬 生成参考表（POC 后决定） |
| `createCharacterFull(name, photoBase64)` | `string`, `string` | `Promise<CharacterData>` | 组合调用：分析 → 头像 → 性别/年龄 → 参考表 → 存 DB → 返回 |

**角色数据结构升级**：
```typescript
interface Character {
  id: string;
  name: string;
  avatarUrl: string;           // Q版头像（2K，1:1方形）
  description: string;         // 详细视觉描述文字（包含性别、年龄、外貌特征）
  originalPhotoUrls: string[]; // 原始照片
  referenceSheetUrl?: string;  // 角色参考表图片（POC 后决定是否启用）
  gender?: string;             // 性别：'男' | '女' | '未知'
  ageGroup?: string;           // 年龄段：'婴儿(0-1岁)' | '幼儿(1-3岁)' | '儿童(3-6岁)' | '少儿(6-12岁)' | '成人' | '未知'
  specificAge?: string;        // 具体年龄（可选）：'1.5岁' 等
  createdAt: number;
}

interface ReferenceSheet {
  imageUrl: string;            // 参考表图片 base64
  views: string[];             // 包含的角度 ['front', 'full-body']
}
```

**约束**：
- 角色头像分辨率必须使用 2K（2048x2048），比例固定为 1:1 方形
- 生成头像时必须同时传入照片和文字描述（不允许只传文字）
- 角色照片传入 API 前必须压缩
- 性别/年龄识别必须在生成头像后立即执行（1-3秒）
- 用户修改性别/年龄后，重新生成头像时必须将这些参数传入 API
- 用户保存时，必须调用 `updateCharacterDescription()` 将性别/年龄写入 description
- `referenceSheetUrl` 字段为可选，POC-01 验证通过后启用

---

### storyService 模块（前端薄封装 + 后端 storyPipeline）

**前端 storyService**（薄封装）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateStory(input)` | `StoryInput` | `Promise<StoryOutput>` | 调用 `apiClient.postAi('generate-story', input)` |

**后端 storyPipeline**（完整 4 步管线，迁移自前端）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateStory(input)` | `StoryInput` | `Promise<StoryOutput>` | 管线入口，执行完整 4 步流程 |

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

**内部流程（4 步管线）**：

```
Step 1: 故事大纲生成（generateOutline）
  输入 → 用户文字 + 图片分析结果 + 角色档案 + 风格
  输出 → 故事大纲 { scenes: [{ beat, description, emotion }], arc }
  模型 → TEXT_MODEL
  说明 → 直接从原始输入生成大纲（合并了原 Step 1 输入分析，
         大纲生成 prompt 中内置事件提取逻辑，无需独立分析步骤）
  约束 → 必须有起承转合结构，必须有情感弧线

Step 2: 大纲质量审核（reviewOutline）— 质量关卡
  输入 → 故事大纲
  输出 → { passed: boolean, issues: string[], suggestions: string[] }
  模型 → TEXT_MODEL
  审核维度：
    - 每个分镜是否推动叙事？（不允许纯装饰镜头）
    - 前后分镜是否有因果或时间连接？
    - 整组分镜是否有情感起伏？
  不通过 → 降级继续（仅记录 issues，不触发重试）

Step 3: 分镜脚本细化（detailScripts）
  输入 → 大纲 + 角色档案 + 风格描述 + 审核 issues（如有，用于引导优化）
  输出 → 逐个分镜的详细脚本
  约束 → 每个分镜的画面描述必须包含角色完整视觉特征
  说明 → 如果 Step 2 审核有 issues，在脚本细化时参考 issues 做针对性优化
  模型 → TEXT_MODEL

Step 4: 脚本一致性检查（checkConsistency）— 质量校验
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
- 4 步管线必须按顺序执行，不允许跳步
- Step 2（质量关卡）仅审核、不重试，不通过时降级继续（issues 传递给 Step 3 参考）
- Step 4（质量校验）不阻塞流程，只做局部修正
- 分镜数量规则：简单故事 2-4 个，复杂故事先生成前 4 个
- 用户上传 N 张图片时，必须严格生成 N 个分镜（1:1 对应）
- 所有步骤的 JSON 输出必须经过 `JSON.parse` 验证

---

### imageService 模块（前端薄封装 + 后端 imageGenerator）

**前端 imageService**（薄封装）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateSceneImage(params)` | `SceneImageParams` | `Promise<string>` | 调用 `apiClient.postAi('generate-image', params)`，返回图片 URL |

**后端 imageGenerator**（完整逻辑，迁移自前端）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateSceneImage(params)` | `SceneImageParams` | `Promise<string>` | 生成图片 → 保存到磁盘 → 返回相对路径 |

**SceneImageParams 类型**：
```typescript
interface SceneImageParams {
  script: string;                  // 分镜脚本
  style: ComicStyle;               // 漫画风格
  ratio: AspectRatio;              // 图片比例
  characterContext: string;        // 角色视觉特征描述文字
  objectContext: string;           // 关键物品描述
  referenceCharIds: string[];      // 角色 ID 列表（后端从 DB 查找头像文件）
  sceneReferenceImages: string[];  // 场景参考图 base64（用户照片或前一分镜图 URL）
  isUserPhoto: boolean;            // 参考图是否为用户照片
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

**方案选定**：4 步管线 + 1 质量关卡

**方案描述**：
`storyService.generateStory()` 执行 4 步管线。
每步独立调用 TEXT_MODEL，步骤之间传递结构化 JSON 数据。
质量关卡仅审核不重试——不通过时将 issues 传递给下游步骤参考，确保不增加延迟。

**选型理由**：
- 选 4 步管线（v1.0 的 5 步合并为 4 步）：原 Step 1（输入分析→结构化事件）的输出是 Step 2 的中间变量，合并后减少 1 次 API 调用且不损失信息
- 质量关卡不重试：flash 模型大纲质量已足够稳定，重试最坏增加 4 次 API 调用（10+ 秒），收益不足以抵消延迟
- 不选单步优化（一个 prompt 完成全部）：单步 prompt 越长，模型注意力越分散，控制力越弱

**实现约束**：
- 管线内每步必须独立调用 API（不合并为一个超长 prompt）
- Step 1 的 prompt 中必须内置事件提取逻辑（who/what/emotion/keyDetails），不需要独立的分析步骤
- Step 2 审核不通过时，issues 传递给 Step 3 作为优化参考（不回退重试）
- Step 4 发现不一致时，只修正不一致的字段，不重新生成全部脚本
- 所有步骤的提示词必须要求 JSON 输出，并设置 `responseMimeType: "application/json"`

**状态**：✅ 确定

---

### 人物一致性 技术方案

**需求引用**：Product-Spec.md → 人物库管理、人物卡通化、生成时参考人物形象

**方案选定**：角色参考表 + 多参考图注入（需 POC 验证参考表生成部分）

**方案描述**：
1. 创建角色时：
   - 用户上传照片 → AI 分析生成视觉描述 → 生成 Q 版头像（2K，1:1方形）
   - 生成头像后立即识别性别/年龄（1-3秒）
   - 尝试生成参考表（POC 后决定）
2. 用户编辑角色时：
   - 可修改性别（下拉框：男/女/未知）
   - 可修改年龄段（下拉框：婴儿/幼儿/儿童/少儿/成人/未知）
   - 可填写具体年龄（文本框：如"1.5岁"）
   - 修改后可重新生成头像（传入照片 + 性别 + 年龄参数）
3. 年龄一致性保证：
   - 用户保存时，性别/年龄信息写入 `character.description`
   - description 格式示例："女孩，1-2岁幼儿（具体1.5岁），短发..."
   - 后续生成漫画时，AI 读取 description 中的明确年龄信息，避免瞎猜（解决"头像1.5岁，漫画变3-4岁"的问题）
4. 参考表（POC 后决定）：正面 + 全身，中性姿势和背景
5. 生成分镜时：自动将角色头像（+ 参考表如有）作为 inlineData 传入 API
6. 提示词中必须包含角色完整视觉特征描述（不允许只写名字）

**选型理由**：
- 选参考图注入：Gemini 支持 inlineData 传入参考图，视觉锚点比纯文字描述一致性高 30-40%
- 不选纯提示词：一致性仅 40-60%，无法达到产品级质量
- 不选 LORA/SD：需要后端训练服务，第一期纯前端架构不支持

**实现约束**：
- 角色头像必须 2K 分辨率，1:1 方形比例
- 生成头像时必须同时传入照片（inlineData）+ 文字描述
- 重新生成头像时，必须传入用户修改后的性别/年龄参数
- 性别/年龄识别调用 TEXT_MODEL，在生成头像后立即执行
- 用户保存时，必须将性别/年龄信息写入 `description`（调用 `updateCharacterDescription()`）
- description 格式必须包含明确年龄信息："性别，年龄段（具体年龄），外貌特征..."
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
[前端 InputPanel] ──── 语音 ──→ inputService → POST /api/ai/transcribe-audio → 文字
      │                          照片 ──→ inputService → POST /api/ai/analyze-images → ImageAnalysis[]
      │
      ▼
[前端 App.tsx handleGenerate]
      │
      ├─ 1. 调用 inputService（→ 后端 inputAnalyzer → Gemini）
      │
      ├─ 2. 调用 storyService（→ POST /api/ai/generate-story）
      │     [后端 storyPipeline 执行 4 步管线]
      │     ├─ Step1: 故事大纲 → 起承转合结构（含输入分析）
      │     ├─ Step2: 大纲审核 → 通过/降级（不重试）
      │     ├─ Step3: 脚本细化 → 详细分镜脚本（参考审核 issues）
      │     └─ Step4: 一致性检查 → 修正
      │     → 返回 StoryOutput（JSON）
      │
      ├─ 3. 前端设置 Scene[] 初始状态（loading）
      │
      └─ 4. 前端控制条件并行生成分镜图片
            │
            ├─ 有用户照片 → 并行调用 imageService（→ POST /api/ai/generate-image）
            │   每张图使用对应的用户照片 base64 作为场景参考
            │
            └─ 无用户照片 → 串行调用 imageService（→ POST /api/ai/generate-image）
                后一张传入前一张的图片 URL 作为连续性参考
            │
            [后端 imageGenerator 每次调用]：
            ├─ 从 DB 查找角色头像文件
            ├─ 注入风格参数（styleConfig）
            ├─ 注入角色参考图（从磁盘读取头像文件）
            ├─ 调用 Gemini 生成图片
            ├─ 保存图片到 data/images/scenes/
            └─ 返回图片 URL（/api/images/scenes/xxx.png）
            │
            前端更新 Scene 状态：imageUrl = 返回的 URL
```

### 角色创建数据流

```
用户输入名字 + 上传照片
      │
      ▼
[前端 CharacterLibrary] create 视图
      │
      ▼
characterService.createCharacter(name, photoBase64)
      → POST /api/characters { name, photoBase64 }
      │
      ▼
[后端 routes/characters.ts → characterAnalyzer]
      ├─ 1. analyzeCharacter() → 视觉描述文字
      ├─ 2. generateAvatar() → Q版头像 → 保存到 data/images/avatars/xxx.png
      ├─ 3. detectGenderAge() → 识别性别/年龄（1-3秒）
      ├─ 4. generateReferenceSheet() → 参考表（POC 后）
      ├─ 5. 原始照片保存到 data/images/avatars/orig_xxx.jpg
      └─ 6. 写入 SQLite characters 表 → 返回 Character（含 avatarUrl, gender, ageGroup）
      │
      ▼
前端收到响应 → 更新 characters 状态 → 自动渲染小卡片
      │
      ▼
用户点击小卡片 → [CharacterLibrary] detail 视图
      ├─ 显示大图（src=/api/images/avatars/xxx.png）+ 性别/年龄字段
      ├─ 用户可修改性别/年龄/具体年龄
      ├─ 点击刷新按钮 → POST /api/ai/generate-avatar → 后端重新生成 → 返回新 URL
      └─ 点击保存 → PUT /api/characters/:id → 后端更新 DB
```

---

## 质量标准

### 故事生成 质量标准

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 故事完整性 | 必须有起承转合，不允许戛然而止 | Step 2 自动审核 | 降级继续，issues 传递给 Step 3 参考 |
| 分镜效率 | 每个分镜必须推动叙事，0 废镜头 | Step 2 审核"是否推动叙事" | issues 传递给 Step 3，脚本细化时优化 |
| 情感弧线 | 至少有 1 个情感高点 | Step 2 审核"是否有情感起伏" | issues 传递给 Step 3，脚本细化时优化 |
| 角色一致性 | 同一角色在所有分镜中描述一致 | Step 4 一致性检查 | 局部修正不一致字段 |
| 场景连贯性 | 前后分镜场景逻辑连贯 | Step 4 一致性检查 | 局部修正 |
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
| 描述完整性 | 视觉描述必须 150-200 字，涵盖性别/年龄/发型/服装/面部/体型 | 代码检查字数 | 使用降级描述 |
| 年龄一致性 | description 必须包含明确年龄信息（如"1-2岁幼儿"或"1.5岁"） | 代码检查 description 格式 | 用户保存时强制写入 |
| 性别识别准确度 | 识别结果与照片相符（人工抽查） | 人工审查 | 用户可手动修改 |
| 年龄段识别准确度 | 识别结果误差不超过1个年龄段 | 人工审查 | 用户可手动修改 |
| 头像质量 | 2K 分辨率，1:1方形，人物居中，白色背景 | 人工审查 | 用户可重新生成 |
| 照片参考 | 生成头像时必须同时传入照片和文字描述 | 代码保证（强制参数） | 不会发生 |

---

## 约束清单（红线）

以下规则在代码实现时必须遵守，不允许违反：

| 编号 | 约束规则 | 适用范围 | 原因 |
|------|---------|---------|------|
| C01 | 后端环境变量在 `.env` 文件中定义（如 `GEMINI_API_KEY`），通过 `process.env` 读取；前端不再需要 API Key 环境变量 | server/*.ts, .env | API Key 安全 |
| C02 | 前端组件（.tsx）不允许直接调用后端 API，必须通过 `services/` 层；前端 services 不允许直接 import `@google/genai` | components/*.tsx, services/*.ts | 关注点分离 |
| C03 | 后端所有 Gemini API 调用必须通过 `withRetry` 包装（至少 3 次重试）；前端 apiClient 对 5xx 错误简单重试 1 次 | server/services/*.ts, apiClient.ts | API 稳定性 |
| C04 | 模型名称必须引用 `server/services/gemini.ts` 中的常量，不允许硬编码 | server/services/*.ts | 统一管理 |
| C05 | 分镜图片分辨率固定 1K，角色头像分辨率固定 2K | server/imageGenerator, server/characterAnalyzer | 效率与质量平衡 |
| C06 | 生成角色头像时必须同时传入照片（inlineData）和文字描述 | server/characterAnalyzer | 质量保证 |
| C07 | 图片生成的风格提示词必须从 `server/services/styleConfig.getStylePrompt()` 获取 | server/imageGenerator | 风格一致性 |
| C08 | 同一组分镜必须使用相同的 ComicStyle 和 AspectRatio | 前端 App.tsx, 后端 imageGenerator | 视觉一致性 |
| C09 | 故事管线 4 步必须按顺序执行，不允许跳步 | server/storyPipeline | 质量保证 |
| C10 | 质量关卡仅审核、不重试，不通过时降级继续（issues 传递给下游步骤参考） | server/storyPipeline | 性能优先 |
| C11 | 后端所有 Gemini API 响应的 JSON 必须经过 `JSON.parse()` 验证 | server/services/*.ts | 防格式错误 |
| C12 | 角色照片传入 Gemini API 前必须压缩（maxWidth=800, quality=0.6） | server/characterAnalyzer, server/imageGenerator | 防 payload 过大 |
| C13 | 系统提示词在后端服务中直接使用，必须与 Product-Spec.md 一致 | server/services/*.ts | 文档同步 |
| C14 | 有参考图方案失败时必须降级为纯文字方案，不允许直接报错 | server/imageGenerator | 用户体验 |
| C15 | Architecture.md 变更时必须同步更新 `architecture-diagram.html` | architecture-diagram.html | 文档可视化同步 |
| C16 | 性别/年龄识别必须在生成头像后立即执行，不允许跳过 | server/characterAnalyzer | 年龄一致性保证 |
| C17 | 角色头像比例固定为 1:1 方形（aspectRatio: "1:1"） | server/characterAnalyzer | 统一头像格式 |
| C18 | 用户保存角色时，必须将性别/年龄信息写入 `character.description` | 前端 CharacterLibrary.tsx | 年龄一致性保证 |
| C19 | description 格式必须包含明确年龄信息："性别，年龄段（具体年龄），外貌..." | server/characterAnalyzer, 前端 characterService | 后续漫画生成时 AI 有明确年龄约束 |
| C20 | 前端不允许存储或读取 API Key，所有 AI 调用必须通过后端 `/api/ai/*` 端点 | 前端所有文件 | 安全 |
| C21 | 图片文件必须存储在 `data/images/{type}/` 下（type: avatars/scenes），不允许存到其他位置 | server/imageStorage | 统一管理 |
| C22 | 数据库所有表必须包含 `user_id` 字段（当前可为 NULL），为多用户预留 | server/db/schema.ts | 扩展性 |
| C23 | 前端图片展示必须使用后端 URL（`/api/images/...`），不允许使用 base64 Data URL 长期存储 | 前端所有文件 | 内存和性能 |
| C24 | 后端 API 必须返回标准 JSON 格式 `{ success: boolean, data?: any, error?: string }` | server/routes/*.ts | API 一致性 |
| C25 | 图片保存到磁盘时必须使用唯一文件名（UUID），防止覆盖 | server/imageStorage | 数据安全 |
| C26 | 前端 `services/*.ts` 不允许直接 import `@google/genai`，所有 AI 功能通过 `apiClient` 调用后端 | 前端 services/*.ts | 架构边界 |

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
| v1.1 | 2026-02-10 | 性能优化 | 1) inputService 图片分析改为并行; 2) storyService 5步管线合并为4步（合并输入分析+大纲生成）; 3) 质量关卡改为仅审核不重试; 4) 图片生成改为条件并行（有照片并行/无照片串行）; 5) 约束 C09 更新为4步, C10 更新为不重试 | storyService, inputService, App.tsx 数据流, C09, C10 |
| v1.2 | 2026-02-10 | Product-Spec v1.2 — 人物库优化（性别/年龄识别） | 1) characterService 新增 `detectGenderAge()` 和 `updateCharacterDescription()` 函数; 2) `generateAvatar()` 增加性别/年龄可选参数; 3) Character 数据结构新增 `gender`, `ageGroup`, `specificAge` 字段; 4) 角色创建流程增加性别/年龄识别步骤; 5) 人物一致性方案增加年龄一致性保证（性别/年龄写入 description）; 6) 新增约束 C16-C19; 7) 新增年龄一致性质量标准 | characterService, Character 类型, 角色创建数据流, 人物一致性方案, C16-C19, 角色系统质量标准 |
| v1.3 | 2026-02-13 | Product-Spec v1.3 — 轻量后端（API 代理 + SQLite + 文件存储） | 1) 架构从纯前端 SPA 升级为前后端分离; 2) 新增 8 个后端模块（gemini/styleConfig/storyPipeline/imageGenerator/characterAnalyzer/inputAnalyzer/imageStorage/db）; 3) 前端 6 个服务模块简化为薄封装（调用后端 API）; 4) 删除前端 aiClient.ts 和 storageUtils.ts; 5) styleConfig 迁移到后端; 6) 新增 SQLite 数据库（characters/stories/scenes 表，预留 user_id）; 7) 图片存储从 base64 内存改为磁盘文件 + URL; 8) API Key 从前端 VITE_ 变量改为服务端 .env; 9) 约束 C01/C02/C03/C04/C07/C12/C13 更新适用范围; 10) 新增约束 C20-C26; 11) 所有数据流增加后端层 | 全部模块、所有数据流、约束 C01-C26 |
