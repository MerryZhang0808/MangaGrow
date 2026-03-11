# Architecture - MangaGrow 漫画成长记录

## 概述

MangaGrow 采用**前后端分离架构**：React 前端 + Node.js/Express 后端 + SQLite 数据库。
前端负责 UI 交互，后端负责 AI 调用代理、数据持久化、图片文件存储。
AI 能力通过 Gemini API 实现，API Key 仅存在服务端，前端不直接调用 Gemini。

**前端**：React 18 + Vite + TypeScript
**后端**：Node.js + Express + TypeScript
**数据库**：SQLite（better-sqlite3，同步 API）
**文件存储**：本地磁盘 `data/images/`
**AI 模型**：gemini-2.5-flash（文本）、nano-banana-pro-preview（图片）
**运行方式**：前端 :3000（Vite dev server）+ 后端 :3001（Express），Vite proxy 转发 `/api/*`

---

## 模块设计

### 模块总览

```
[前端] comic-growth-record/
  App.tsx（调度中心）
  ├── InputPanel（输入采集）
  ├── DisplayPanel（分镜展示 + 导出）
  ├── CharacterLibrary（人物库管理）
  ├── HistoryPanel（历史记录主页面，双栏布局）  ← v1.4 新增，v1.8 重构
  ├── GrowthAlbum（成长相册主页面）   ← v1.7 新增
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
      ├── imageUtils.ts          ← 前端图片工具（上传预览、格式转换）
      ├── posterGenerator.ts     ← 网格海报生成（Canvas API）  ← v1.4 新增
      └── pdfGenerator.ts        ← PDF 成长故事书生成（Canvas + jsPDF）  ← v1.7 新增

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
  │   ├── videoAnalyzer.ts       ← 视频分析（内容理解 + 关键帧提取）  ← v2.0 新增
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
      ├── posters/               ← 故事海报图片  ← v1.8 新增
      └── inputs/                ← 用户原始上传照片  ← v1.8 新增
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
| posterGenerator | 网格海报生成：Canvas 拼图、自适应排版、PNG 导出 | `utils/posterGenerator.ts` | 无 |
| pdfGenerator | PDF 成长故事书生成：Canvas 分页渲染 + jsPDF 拼合 | `utils/pdfGenerator.ts` | 无 |
| HistoryPanel | 历史记录主页面（双栏）：左栏列表、右栏只读详情（海报+原始输入+照片）、删除 | `components/HistoryPanel.tsx` | apiClient |
| GrowthAlbum | 成长相册主页面：时间轴浏览、年/月分组、只读详情、PDF 生成触发 | `components/GrowthAlbum.tsx` | apiClient, pdfGenerator |

**后端模块**（承载所有 AI 逻辑和数据管理）：

| 模块名 | 职责 | 主要文件 | 依赖 |
|--------|------|---------|------|
| gemini | Gemini API 基础设施：客户端、重试、安全设置、模型常量 | `server/services/gemini.ts` | 无 |
| styleConfig | 风格参数配置：4 组详细风格提示词 | `server/services/styleConfig.ts` | 无 |
| storyPipeline | 4 步故事管线（大纲→审核→脚本→一致性检查）| `server/services/storyPipeline.ts` | gemini, styleConfig |
| imageGenerator | 分镜图片生成（提示词构造、参考图注入）| `server/services/imageGenerator.ts` | gemini, styleConfig, imageStorage |
| characterAnalyzer | 角色分析、头像生成、性别/年龄识别 | `server/services/characterAnalyzer.ts` | gemini, imageStorage |
| inputAnalyzer | 语音转文字、图片分析 | `server/services/inputAnalyzer.ts` | gemini |
| videoAnalyzer | 视频内容理解 + 关键帧提取（Gemini Video Understanding） | `server/services/videoAnalyzer.ts` | gemini |
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
| `getStories()` | 无 | `Promise<StorySummary[]>` | 获取历史列表（含标题、日期、posterUrl、inputText） |
| `saveStory(data)` | `SaveStoryRequest` | `Promise<Story>` | 手动保存漫画故事（用户点击"保存故事"后调用，含 poster_base64、input_photos） |
| `getStory(id)` | `string` | `Promise<StoryDetail>` | 获取故事详情（含 posterUrl、inputText、inputPhotos） |
| `deleteStory(id)` | `string` | `Promise<void>` | 删除故事（同步删除 poster + input 磁盘文件） |
| `generateYearlySummary(stories)` | `SummaryStoryItem[]` | `Promise<string>` | 调用 `postAi('generate-summary', ...)` 生成年度总结文字（输入为 title + inputText） |
| `analyzeVideo(videoBase64, mimeType)` | `string`, `string` | `Promise<VideoAnalysis>` | v2.0 新增：调用 `postAi('analyze-video', ...)` 分析视频内容 + 提取关键帧 |

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
| `TEXT_MODEL` | - | `string` | 文本模型常量 = `'gemini-2.5-flash'` |
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
| `saveImage(type, base64Data, mimeType?)` | `'avatars'\|'posters'\|'inputs'`, `string`, `string` | `string` | 保存 base64 图片到磁盘，返回相对路径（如 `posters/abc123.png`） |
| `getImageFullPath(relativePath)` | `string` | `string` | 返回图片的完整磁盘路径 |
| `deleteImage(relativePath)` | `string` | `void` | 删除指定图片文件 |
| `ensureDirectories()` | 无 | `void` | 确保 `data/images/avatars/`、`data/images/posters/`、`data/images/inputs/` 目录存在 |

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
  title TEXT,                -- AI 生成的故事标题
  input_text TEXT,           -- v1.8: 用户原始输入文字（打字/语音转写）
  input_photos TEXT,         -- v1.8: 原始上传照片路径 JSON 数组（如 ["inputs/a.jpg","inputs/b.jpg"]）
  poster_url TEXT,           -- v1.8: 合成海报图片路径（如 "posters/abc123.png"）
  style TEXT,
  created_at INTEGER NOT NULL
);
-- v1.8 迁移说明：删除 scenes 表，stories 表新增 input_text/input_photos/poster_url 列
-- 通过 ALTER TABLE ADD COLUMN 方式迁移（schema.ts 迁移逻辑）
```

**约束**：
- 数据库连接必须使用 singleton 模式
- 必须启用 WAL 模式（`PRAGMA journal_mode = WAL`）提升并发性能
- 所有表必须包含 `user_id` 字段（当前为 NULL，预留多用户）
- `stories` 删除时必须同步删除对应的 `poster_url` 和 `input_photos` 磁盘文件

---

### inputService 模块（前端薄封装 + 后端 inputAnalyzer）

**前端 inputService**（薄封装）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `transcribeAudio(audioBlob)` | `Blob` | `Promise<string>` | 调用 `apiClient.postAi('transcribe-audio', ...)` |
| `analyzeImages(imageUris)` | `string[]` | `Promise<ImageAnalysis[]>` | 调用 `apiClient.postAi('analyze-images', ...)` |
| `analyzeVideo(videoFile)` | `File` | `Promise<VideoAnalysis>` | v2.0 新增：调用 `apiClient.postAi('analyze-video', ...)` |

**后端 inputAnalyzer**（完整逻辑，迁移自前端）：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `transcribeAudio(audioBase64, mimeType)` | `string`, `string` | `Promise<string>` | 语音转文字，调用 TEXT_MODEL |
| `analyzeImages(imageBase64s)` | `string[]` | `Promise<ImageAnalysis[]>` | 并行分析多张图片 |

**后端内部流程（analyzeImages）**：
1. 所有图片并行处理（Promise.all），每张图独立压缩（maxWidth=800, quality=0.6）+ 分析
2. 调用 TEXT_MODEL（gemini-2.5-flash）分析
3. 解析 JSON 结果，按原始顺序排序返回
4. 单张分析失败时返回降级描述，不中断整体流程

**约束**：
- 图片分析模型必须统一为 `TEXT_MODEL`（gemini-2.5-flash）
- 单张图片分析失败不允许中断整体流程，必须返回降级结果
- 图片发送前必须经过压缩（防止 payload 过大导致 500）

---

### videoAnalyzer 模块（后端，v2.0 新增）

**职责**：分析用户上传的视频，理解视频内容并提取关键帧。使用 Gemini Video Understanding API。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `analyzeVideo(videoBase64, mimeType)` | `string`, `string` | `Promise<VideoAnalysis>` | 视频内容理解 + 关键帧提取 |

**VideoAnalysis 类型**（新增于 `server/types.ts`）：
```typescript
interface VideoAnalysis {
  description: string;        // 视频内容文字描述（100-200字）
  keyFrames: VideoKeyFrame[]; // 2-4 个关键帧
}

interface VideoKeyFrame {
  timestamp: string;          // 时间戳（如 "00:03"）
  description: string;        // 这一帧的画面描述
  imageBase64: string;        // 关键帧图片 base64（由 Gemini 从视频中截取）
}
```

**前端 VideoAnalysis 类型**（新增于 `comic-growth-record/types.ts`）：
```typescript
interface VideoAnalysis {
  description: string;
  keyFrames: VideoKeyFrame[];
}

interface VideoKeyFrame {
  timestamp: string;
  description: string;
  imageUrl: string;           // 前端用 URL（后端保存后返回 /api/images/scenes/xxx.png）
}
```

**内部流程**：
1. 接收视频 base64 + mimeType（`video/mp4` 或 `video/quicktime`）
2. 调用 TEXT_MODEL（gemini-2.5-flash，支持 Video Understanding），传入视频 inlineData + 分析提示词
3. 提示词要求 AI 完成两个任务：
   - 任务一：视频内容理解（100-200字描述，含场景/人物/动作/情绪/物品/声音线索）
   - 任务二：关键帧提取（2-4 个代表故事发展的关键时刻，含时间戳和描述）
4. 解析 JSON 响应，提取 description 和 keyFrames
5. 对每个关键帧：根据时间戳从视频中截取帧图片（通过 Gemini 的视频帧提取能力），转为 base64
6. 返回 VideoAnalysis 对象

**关键帧提取策略**：
- AI 自动决定帧数（2-4 个），基于视频内容丰富度
- 每帧必须代表故事的一个阶段（起承转合），帧间有叙事推进
- 优先选择人物表情清晰、动作有代表性的画面
- 关键帧图片存储到 `data/images/scenes/`（通过 imageStorage），返回 URL

**约束**：
- 必须使用 `TEXT_MODEL` 调用 Video Understanding（gemini-2.5-flash 支持视频输入）
- 必须通过 `withRetry` 包装 API 调用（C03）
- 视频大小由前端校验（≤500MB、≤3分钟、MP4/MOV），后端不重复校验大小但校验格式
- 关键帧图片必须存储到磁盘（通过 imageStorage.saveImage('scenes', ...)），返回 URL 给前端
- 视频分析失败时必须返回明确错误信息，不允许静默失败
- 单次最多处理 1 段视频

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
| `generateTitle(text, imageAnalysis?)` | `string`, `ImageAnalysis[]?` | `Promise<string>` | v1.4: 根据故事内容生成简短标题（5-15字）（内部函数，不 export） |
| `generateYearlySummary(stories)` | `SummaryStoryItem[]` | `Promise<string>` | v1.7: 根据多个故事的标题和 caption 生成 300-500 字年度总结文字 |

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
  title: string;                     // v1.6: 故事标题（管线内与 Step4 并行生成，随脚本一起返回）
  totalScenes: number;
  currentBatch: SceneScript[];
  hasMore: boolean;
  keyObjects: KeyObject[];
  characterDefinitions: CharacterDef[];
  storyOutline: string;            // 保留大纲用于后续续写
}

interface SceneScript {
  sceneNumber: number;
  description: string;             // 图像生成脚本（50-100字，含完整视觉细节，用于 AI 图像生成）
  caption: string;                 // v1.5: 故事叙述（10-20字，温馨简短，展示在漫画图下方供读者阅读）
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
  输出 → 逐个分镜的详细脚本（v1.5: 每个分镜包含 description + caption 两份文字）
  约束 → description（50-100字）：必须包含角色完整视觉特征，用于 AI 图像生成
        caption（10-20字）：温馨简短的故事叙述，展示在漫画图下方供读者阅读，不作为图像生成输入
  说明 → 如果 Step 2 审核有 issues，在脚本细化时参考 issues 做针对性优化
  模型 → TEXT_MODEL

Step 4: 脚本一致性检查（checkConsistency）— 质量校验  ┐
  输入 → 全部分镜脚本                                   ├─ 并行执行（互相独立）
  输出 → { passed: boolean, inconsistencies: string[] }  │
  检查维度：                                             │
    - 角色描述是否前后一致？                              │
    - 场景描述是否连贯？                                  │
    - 时间线是否合理？                                    │
  不通过 → 标记不一致项，局部修正后返回                   │
  模型 → TEXT_MODEL                                      │
                                                         │
标题生成（generateTitle）                               ─┘
  输入 → 用户文字描述 + 图片分析结果
  输出 → 故事标题（4-10字名词短语）
  与 Step 4 并行，Promise.all 同时等待两者完成
  结果随 StoryOutput.title 一起返回给前端
  模型 → TEXT_MODEL
```

**约束**：
- 4 步管线必须按顺序执行，不允许跳步
- Step 2（质量关卡）仅审核、不重试，不通过时降级继续（issues 传递给 Step 3 参考）
- Step 4（质量校验）与标题生成并行执行（Promise.all），不阻塞流程，只做局部修正
- 标题生成随 StoryOutput 一起返回，前端收到后立即设置标题（早于图片生成完成）
- 分镜数量规则：简单故事 2-4 个，复杂故事先生成前 4 个
- 用户上传 N 张图片时，必须严格生成 N 个分镜（1:1 对应）
- 所有步骤的 JSON 输出必须经过 `JSON.parse` 验证
- 人物规则（v1.6）：用户文本中出现名字的人物强制出现在故事中；未被提及的人物库角色只提供视觉描述参考，不强制出现

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

**链式参考策略（v1.6）**：
- Scene 1：只使用人物参考图（原照 + 头像），无场景参考图
- Scene 2+：以上一张已生成分镜图作为场景参考（链式传递），通过 `[风格参考帧]` prompt label 要求保持画风/线条/色调一致
- 有用户上传照片时：每张用对应的用户照片作场景参考（保持原有逻辑，不变）

**约束**：
- 分镜图片分辨率使用 1K（1024x1024），平衡质量与生成效率
- 角色头像生成使用 2K（2048x2048），由 characterService 负责
- 每个角色最多传 2 张参考图（头像 + 参考表）
- 参考图总数不超过 6 张（3 角色 × 2 张），留余量给场景参考
- 风格提示词必须从 styleConfig 获取，不允许硬编码
- 有参考图方案失败时必须降级为纯文字方案，不允许直接报错

---

### posterGenerator 模块（前端，v1.4 新增）

**职责**：将分镜图片拼合为网格海报 PNG 图片，纯前端 Canvas 实现。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generatePoster(options)` | `PosterOptions` | `Promise<Blob>` | 生成海报 PNG Blob |

**PosterOptions 类型**：
```typescript
interface PosterOptions {
  title: string;              // 故事标题
  date: string;               // 创建日期（格式化后的字符串）
  scenes: { imageUrl: string; caption: string }[];  // v1.5: 使用 caption 作为分镜配文（替换原 script）
  watermark?: string;         // 水印文字，默认 'MangaGrow'
}
```

**内部流程**：
1. 创建离屏 Canvas
2. 计算海报尺寸：基于分镜数量和图片尺寸自动计算
   - 固定 2 列，行数 = Math.ceil(scenes.length / 2)
   - 标题区高度：120px
   - 水印区高度：60px
   - 分镜间距：20px
   - 每个分镜：图片 + 下方故事叙述文字 caption（文字区高度 60px）
3. 绘制白色背景（#FFFFFF）
4. 绘制标题区（居中，标题字号 36px 黑色，日期字号 18px #999）
5. 逐个绘制分镜（fetch 图片 → drawImage + fillText）
   - 奇数末行居中排列
6. 绘制水印区（底部居中，18px #CCCCCC）
7. `canvas.toBlob('image/png')` 返回 Blob

**分镜排版规则**（固定 2 列，奇数末行居中）：

| 分镜数 | 行数 | 排法 |
|-------|------|------|
| 2 | 1 | 2 列 |
| 3 | 2 | 2 + 1（居中）|
| 4 | 2 | 2×2 |
| 5 | 3 | 2+2+1 |
| 6 | 3 | 2×3 |
| 7 | 4 | 2+2+2+1 |
| 8 | 4 | 2×4 |

**约束**：
- 不引入第三方库（html2canvas 等），使用原生 Canvas API
- 图片通过 fetch + createImageBitmap 加载（处理跨域）
- caption 文字超长时截断并加省略号（单行最多 30 字）；caption 不存在时降级使用 script 前 30 字
- 水印文字固定为 'MangaGrow'（不可配置）

---

### HistoryPanel 组件（前端，v1.4 新增，v1.8 重构）

**职责**：全宽双栏主页面，左栏展示故事列表，右栏展示选中故事的只读详情（海报大图 + 原始输入文字 + 原始照片）。v1.8 废弃侧边栏交互。

**Props 定义**：
```typescript
interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // 注：v1.8 不再需要 onSelectStory（历史为只读，不加载到创作面板）
}
```

**内部状态**：
- `stories: StorySummary[]`：历史列表数据
- `selectedStoryId: string | null`：当前右栏展示的故事
- `selectedStory: StoryDetail | null`：右栏展示的详情数据
- `isLoading: boolean`：加载状态

**StorySummary 类型**（v1.8 更新）：
```typescript
interface StorySummary {
  id: string;
  title: string;              // 故事标题
  createdAt: number;          // 创建时间戳
  posterUrl: string;          // v1.8: 海报图 URL（/api/images/posters/xxx.png）
  inputText: string;          // v1.8: 用户原始输入文字
}
```

**StoryDetail 类型**（v1.8 新增）：
```typescript
interface StoryDetail {
  id: string;
  title: string;
  createdAt: number;
  posterUrl: string;          // 海报图 URL
  inputText: string;          // 原始输入文字
  inputPhotos: string[];      // 原始上传照片 URL 数组
}
```

**内部流程**（v1.8）：
1. `isOpen` 变为 true 时，调用 `apiClient.getStories()` 获取列表，按 `createdAt` 倒序排列
2. 默认选中第一条，左栏第一条高亮
3. 切换故事时调用 `apiClient.getStory(id)` 获取详情（含 inputText、inputPhotos）
4. 右栏展示只读详情：海报大图 + input_text + input_photos（若有）
5. 右栏右上角「删除」图标 → 确认弹窗 → DELETE API → 左栏移除并选中相邻条

**约束**（见 C43）：
- 左栏宽度固定 280px，右栏 flex 占满剩余宽度
- 右栏严格只读，不渲染任何编辑/重绘/脚本编辑控件
- `isHistoryOpen` 与 `isGrowthAlbumOpen` 互斥（C41）
- 空状态显示引导文案
- 删除前必须弹出确认对话框

---

### pdfGenerator 模块（前端，v1.7 新增）

**职责**：生成 PDF 成长故事书，每页用 Canvas 渲染后由 jsPDF 拼合。

**接口定义**：

| 函数名 | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `generateStoryBookPdf(options)` | `StoryBookOptions` | `Promise<Blob>` | 生成 PDF Blob（封面 + 故事页 + 总结页） |

**StoryBookOptions 类型**（v1.8 更新）：
```typescript
interface StoryBookOptions {
  dateLabel: string;          // 日期范围文字（如"2025年7月 - 2026年2月"）
  characterName: string;      // 主角名字（封面使用，如"念念"），无角色时为"成长故事书"
  summary: string;            // AI 生成的阶段总结文字（300-500字）
  stories: Array<{
    title: string;
    createdAt: number;
    posterUrl: string;        // v1.8: 海报图 URL（/api/images/posters/xxx.png）
    inputText: string;        // v1.8: 原始输入文字（供 AI 总结使用）
  }>;
}
```

**内部流程**（v1.8 更新）：
1. 引入 jsPDF（`import { jsPDF } from 'jspdf'`）
2. 创建 A4 PDF 实例（`new jsPDF('p', 'mm', 'a4')`）
3. **封面页**：离屏 Canvas（794×1123px），Canvas fillText 绘制标题和日期范围，转 JPEG → jsPDF.addImage
4. **故事海报页**（每个故事 1 页）：
   - fetch posterUrl → createImageBitmap → Canvas drawImage（全页铺满）
   - Canvas fillText 绘制故事标题 + 日期（叠加在海报上方）
   - Canvas → JPEG → jsPDF.addPage + jsPDF.addImage
5. **AI 总结页**：Canvas 绘制总结标题 + 正文（多行 wrapText）
6. `jsPDF.output('blob')` 返回 Blob

**约束**：
- 中文文字必须使用 Canvas fillText 渲染后转为图片，不允许直接用 jsPDF.text 输出中文（避免字体问题）
- jsPDF 仅负责 PDF 结构拼合（addPage、addImage），不负责文字渲染
- 图片加载使用 fetch + createImageBitmap 模式（与 posterGenerator 一致）

---

### GrowthAlbum 组件（前端，v1.7 新增）

**职责**：成长相册主页面，时间轴展示已保存故事，触发 PDF 生成。

**Props 定义**：
```typescript
interface GrowthAlbumProps {
  isOpen: boolean;                        // 是否显示成长相册页面（替换主内容区）
  onClose: () => void;                    // 关闭（返回主界面）
  // 注：v1.8 不再需要 onSelectStory（点击故事在相册内展开只读详情，不加载到创作面板）
  characters: Character[];               // 人物库（封面名字取最常出现的人物）
}
```

**内部状态**：
- `stories: StorySummary[]`：全量故事列表（含 posterUrl、inputText）
- `selectedStoryId: string | null`：当前展开的只读详情故事
- `isPdfPanelOpen: boolean`：PDF 日期选择面板是否展开
- `dateRange: { preset: 'month'|'half'|'year'|'custom', from: number, to: number }`
- `isPdfGenerating: boolean`：PDF 生成中状态

**时间轴渲染逻辑**：
- 调用 `apiClient.getStories()` 获取全量列表
- 按 `createdAt` 分组：`Map<year, Map<month, StorySummary[]>>`
- 渲染：年份标题行 → 月份标题行（可选）→ 故事卡片列表（缩略图使用 posterUrl）
- 点击卡片：设置 `selectedStoryId`，右侧展示只读详情

**PDF 触发逻辑**：
1. 用户选择日期范围（预设或自定义）
2. 前端根据 dateRange 从 stories 中筛选（client-side filter）
3. 调用 `apiClient.generateYearlySummary(filteredStories.map(s => ({ title: s.title, inputText: s.inputText })))` → 获取总结文字
4. 调用 `pdfGenerator.generateStoryBookPdf(options)` → 获取 Blob
5. 浏览器 `URL.createObjectURL(blob)` + `<a download>` 触发下载

**约束**：
- PDF 故事筛选在前端 client-side 完成（日期比较），不新增 `GET /api/stories?from=&to=` 端点
- PDF 生成中显示 loading 状态，防止重复点击
- 年度总结生成失败时降级为固定文字："这一段时间里，记录了 ${count} 个成长故事。"
- 点击故事卡片在相册内展开只读详情，不关闭相册，不回调 onSelectStory

---

### 前端组件 Props 变更（v1.5）

**InputPanel 新增 Props**：
```typescript
interface InputPanelProps {
  // ... 原有 props ...
  onCharacterClick: (id: string) => void;  // v1.5: 点击人物头像时回调，打开人物库并进入详情页
}
```
**行为变更（v1.5）**：
- 人物快捷区从"显示前4个"改为"按文本自动匹配"：`text.toLowerCase().includes(c.name.toLowerCase())`
- 匹配结果为空时（文本为空或无人物名字）不显示任何人物卡片
- 点击人物头像触发 `onCharacterClick(char.id)`，由 App.tsx 打开详情

**CharacterLibrary 新增 Props**：
```typescript
interface CharacterLibraryProps {
  // ... 原有 props ...
  initialCharacterId?: string;  // v1.5: 打开时自动导航到该人物的详情视图
}
```
**行为变更（v1.5）**：
- `isOpen && initialCharacterId` 时：自动找到对应人物，切换到 `detail` 视图

**DisplayPanel 分镜卡片行为变更（v1.5）**：
- 卡片下方不再显示完整 `script`，改为显示简短 `caption`（10-20字故事叙述）
- caption 缺失时降级显示：`scene.script.slice(0, 30) + '...'`
- 「编辑脚本」按钮点击后以气泡弹窗（absolute positioned overlay）展示完整 `script`，支持修改后「保存并重绘」

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

### 故事标题生成 技术方案（v1.4 新增）

**需求引用**：Product-Spec.md v1.4 → 故事标题

**方案选定**：管线外独立调用 TEXT_MODEL

**方案描述**：
故事管线 4 步完成后，独立调用 `storyPipeline.generateTitle()` 生成标题。
标题不插入管线内部，因为标题不影响分镜脚本质量。

**选型理由**：
- 不插入管线：标题与脚本质量无关，独立调用更清晰，不增加管线复杂度
- 不在前端生成：标题生成需要 AI，必须走后端

**实现约束**：
- 调用 TEXT_MODEL，使用 `responseMimeType: "text/plain"`（纯文本，不需要 JSON）
- 标题长度 5-15 字，超长时截断
- 生成失败时降级为 `input_summary` 的前 15 字 + "..."

**状态**：✅ 确定

---

### 手动保存确认 技术方案（v1.4 新增，v1.8 重构）

**需求引用**：Product-Spec.md v1.8 → 手动保存确认

**方案选定**：点击「保存故事」→ 前端生成海报 → 上传海报+照片 → POST 一次性保存，保存后只读

**方案描述**：
- 生成完成后：前端**不自动保存**，底部浮动操作栏显示「保存故事」按钮，顶部信息栏显示「未保存」状态
- 用户点击「保存故事」，三步执行：
  1. 前端调用 `posterGenerator.generatePoster(scenes)` 生成海报 Blob
  2. 将海报 Blob 转为 base64，连同 input_text、input_photos（base64 数组）一起 POST 到 `/api/stories`
  3. 后端将海报和照片写盘（`imageStorage.saveImage('posters', ...)`、`imageStorage.saveImage('inputs', ...)`），返回 storyId
- 保存成功：按钮消失，顶部显示「✅ 已保存」
- 保存后的故事**只读**，不支持编辑/重绘/同步

**选型理由（v1.8 重构原因）**：
- 废弃 scenes 表 + PUT debounce：分镜级别持久化复杂度高、边界 bug 多（部分保存、并发竞态）
- 海报一次性存储：最终展示效果直接持久化，简单且无歧义；历史查看即看海报，无需重建分镜状态
- 原始输入保存：用户可在历史中回顾当时的故事描述和参考照片，增加记录价值

**实现约束**（见 C27、C42）：
- 「保存故事」按钮仅在 `scenes.length > 0 && !isSaved` 时显示
- 保存流程严格三步顺序：generatePoster → 上传 → POST；中途失败不写数据库
- POST `/api/stories` body：`{ title, input_text, input_photos: string[], poster_base64, style }`
- 不存在 PUT `/api/stories/:id`（已废除）
- 保存状态：「未保存」→「保存中...」→「✅ 已保存」，App.tsx 管理 `isSaved: boolean`

**状态**：✅ 确定

---

### HistoryPanel 技术方案（v1.4 新增，v1.8 重构为双栏主页面）

**需求引用**：Product-Spec.md v1.8 → 历史记录主页面

**方案选定**：全宽双栏布局（与 GrowthAlbum 对等），左栏列表 + 右栏只读详情

**方案描述**：
- HistoryPanel 改为占据主内容区的全宽页面（与 GrowthAlbum 布局对等）
- 左栏（固定 280px）：故事列表，按时间倒序，卡片含海报缩略图 + 标题 + 日期
- 右栏（flex）：选中故事的只读详情——海报大图 + input_text + input_photos（若有）
- 默认选中最新一条（进入时自动展示第一条详情）
- 删除：右栏右上角「删除」图标 → 确认弹窗 → DELETE API → 左栏移除并选中相邻条

**选型理由（v1.8 重构原因）**：
- 原侧边栏：每次点击打开历史，需要多次交互才能查看不同故事，体验割裂
- 双栏主页面：左右分栏，点击即切换，流畅浏览；与成长相册风格一致，降低认知负担

**Props 定义**：
```typescript
interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // 注：v1.8 不再需要 onSelectStory（历史为只读，不加载到创作面板）
}
```

**内部状态**：
- `stories: StorySummary[]`：全量故事列表
- `selectedStoryId: string | null`：当前右栏展示的故事
- `selectedStory: StoryDetail | null`：右栏展示的详情数据（含 inputText、inputPhotos、posterUrl）

**实现约束**（见 C43）：
- 打开时调用 `apiClient.getStories()` 刷新列表，默认选中第一条
- 切换故事时调用 `apiClient.getStory(id)` 获取详情（含 inputText、inputPhotos）
- 历史详情区严格只读，不渲染任何编辑/重绘控件
- `isHistoryOpen` 与 `isGrowthAlbumOpen` 互斥（C41）

**状态**：✅ 确定

---

### 成长相册 技术方案（v1.7 新增）

**需求引用**：Product-Spec.md v1.7 → 成长相册

**方案选定**：新增全屏主页面组件，client-side 按年/月分组渲染

**方案描述**：
成长相册作为独立的主视图（GrowthAlbum 组件），点击导航栏图标后替换中间+右侧主内容区显示。
数据复用 `apiClient.getStories()` 的结果，在前端 client-side 按 `createdAt` 分组（无需新 API 端点）。

**选型理由**：
- 不选侧边栏（与 HistoryPanel 区分）：成长相册有 PDF 生成功能，需要足够的操作空间
- 全屏视图：时间轴内容多，需要宽度；PDF 配置面板也需要展示空间
- Client-side 分组：stories 数量有限（家长记录，一年通常 < 200条），无需服务端分组

**实现约束**：
- `isGrowthAlbumOpen` 与 `isHistoryOpen` 互斥（不同时打开）
- 成长相册打开时自动调用一次 `apiClient.getStories()` 刷新数据（每次打开刷新，不缓存）
- 故事列表按 `createdAt` 倒序显示（最新的在顶部）
- 缩略图使用 story.posterUrl（`/api/images/posters/xxx.png`）
- 点击故事卡片：在相册内展开只读详情（海报大图 + input_text + input_photos），不关闭相册，不加载到创作面板

**状态**：✅ 确定

---

### PDF 成长故事书 技术方案（v1.7 新增）

**需求引用**：Product-Spec.md v1.7 → PDF 成长故事书

**方案选定**：Canvas 分页渲染 + jsPDF 拼合

**方案描述**：
1. 年度总结文字：调用后端 `POST /api/ai/generate-summary`（服务端 Gemini 调用，AI 生成 300-500 字总结）
2. 每页内容用 Canvas API 渲染（封面、故事页、总结页），Canvas 原生支持系统字体（含中文），无字体问题
3. 每页 Canvas 转为 JPEG Data URL，jsPDF 用 addImage 拼合为 A4 PDF
4. 触发浏览器下载

**选型理由**：
- 选 Canvas + jsPDF：jsPDF 直接输出中文需要嵌入字体文件（5-10MB），改为 Canvas fillText + 转图片完全规避字体问题；与 posterGenerator 技术栈一致
- 不选 puppeteer（后端）：需要 headless Chrome，重量级依赖不适合当前架构
- 不选 window.print()：排版不可控，用户体验差
- 年度总结 AI 生成放后端：需要 Gemini API Key，必须走后端代理

**实现约束**：
- jsPDF 通过 npm 安装（`npm install jspdf`），仅在前端使用
- 所有中文文字必须用 Canvas fillText 渲染（不直接用 jsPDF.text 输出中文）
- 后端新增 `POST /api/ai/generate-summary` 端点，调用 storyPipeline.generateYearlySummary()
- 年度总结生成失败（网络/AI错误）时降级为固定文字，不阻塞 PDF 生成
- PDF 生成是纯前端计算，服务端只提供年度总结文字

**状态**：✅ 确定

---

### 网格海报导出 技术方案（v1.4 新增）

**需求引用**：Product-Spec.md v1.4 → 网格海报导出

**方案选定**：前端原生 Canvas API

**方案描述**：
前端使用 Canvas API 将分镜图片拼合为完整海报。
用户点击「导出海报」→ 调用 `posterGenerator.generatePoster()` → 生成 Blob → `saveAs()` 下载。

**选型理由**：
- 选原生 Canvas：无额外依赖，分镜图片已在前端可用，Canvas 绑定图片 + 文字足够
- 不选 html2canvas：引入第三方依赖，且对复杂 CSS 渲染有兼容性问题
- 不选后端生成：海报是纯视觉合成，不需要 AI 能力，后端无必要

**实现约束**：
- 使用 `OffscreenCanvas` 或 `document.createElement('canvas')`
- 图片加载使用 `fetch` + `createImageBitmap`（支持跨域的后端图片 URL）
- 输出格式固定 PNG（`canvas.toBlob('image/png')`）
- 文件名格式：`{title}_poster.png`（title 中非法字符替换为下划线）

**状态**：✅ 确定

---

### 视频转漫画 技术方案（v2.0 新增）

**需求引用**：Product-Spec.md v2.0 → 视频上传、视频内容分析、关键帧提取

**方案选定**：Gemini Video Understanding（TEXT_MODEL）+ 服务端关键帧存储

**方案描述**：
1. 用户上传视频（MP4/MOV，≤3分钟，≤500MB），前端即时校验后发送到后端
2. 后端 `videoAnalyzer.analyzeVideo()` 将视频 base64 作为 inlineData 传入 Gemini TEXT_MODEL（支持 Video Understanding）
3. AI 同时完成两个任务：内容理解（100-200字描述）+ 关键帧选取（2-4 帧，含时间戳和描述）
4. 后端截取关键帧图片，存储到磁盘，返回 URL 给前端
5. 前端展示关键帧缩略图，用户可删除不需要的帧
6. 点击生成时：关键帧数量 1:1 决定分镜数；关键帧图片作为场景参考图；视频描述作为故事输入

**选型理由**：
- 选 Gemini Video Understanding：Gemini 2.5 flash 原生支持视频输入（inlineData），无需额外的视频处理库
- 不选 FFmpeg 抽帧 + 图片分析：需要服务端安装 FFmpeg，增加部署复杂度；AI 选帧比均匀抽帧更有叙事价值
- 不选前端抽帧（Canvas + Video API）：浏览器视频解码受限，大文件容易 OOM；无法利用 AI 选择叙事关键帧
- 关键帧存储到磁盘：与现有 imageStorage 机制一致，复用 scenes 目录

**实现约束**：
- 视频校验严格在前端完成（格式、时长、大小），不满足直接拒绝，不发送到后端
- 后端接收 base64 视频，不保存视频原文件到磁盘（只保存关键帧图片）
- 视频分析在上传时立即触发（异步），不等待用户点击「生成漫画」
- 关键帧图片存储路径：`data/images/scenes/`（复用现有目录）
- 关键帧数量由 AI 决定（2-4 帧），前端不可手动添加帧，只可删除
- 删除关键帧后分镜数同步减少
- 视频 + 照片可同时上传：关键帧决定分镜骨架，照片作为额外视觉参考
- 视频分析超时设置为 120 秒（视频处理耗时较长）

**状态**：✅ 确定

---

## 数据流

### 主流程数据流（用户点击「生成漫画」）

```
用户输入文字/语音/照片/视频
      │
      ▼
[前端 InputPanel] ──── 语音 ──→ inputService → POST /api/ai/transcribe-audio → 文字
      │                  照片 ──→ inputService → POST /api/ai/analyze-images → ImageAnalysis[]
      │                  视频 ──→ inputService → POST /api/ai/analyze-video → VideoAnalysis
      │                           （v2.0：上传后立即分析，不等用户点击生成）
      │                           → 关键帧展示在输入区（用户可删除），keyFrames 决定分镜数
      │
      ▼
[前端 App.tsx handleGenerate]
      │
      ├─ 1. 调用 inputService（→ 后端 inputAnalyzer / videoAnalyzer → Gemini）
      │     ├─ 照片分析（如有）→ ImageAnalysis[]
      │     └─ 视频分析结果已缓存（上传时已完成）→ VideoAnalysis（含 keyFrames）
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
            ├─ 有视频关键帧 → 并行调用 imageService（→ POST /api/ai/generate-image）
            │   每张图使用对应关键帧图片 URL 作为场景参考（关键帧 1:1 对应分镜）
            │   照片（如有）作为额外视觉参考注入，不增加分镜数
            │
            ├─ 有用户照片（无视频）→ 并行调用 imageService（→ POST /api/ai/generate-image）
            │   每张图使用对应的用户照片 base64 作为场景参考
            │
            └─ 无照片无视频 → 串行调用 imageService（→ POST /api/ai/generate-image）
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
            │
      │  ↑ [v1.6] storyService 返回的 StoryOutput 已包含 title（与 Step4 并行生成）
      │     前端收到后立即 setStoryTitle(title)，此时图片尚未开始生成
      │     → 用户在分镜卡片加载前就看到标题和日期
      │
      └─ 5. [v1.8] 显示"保存故事"按钮（不自动保存，scenes.length > 0 && !isSaved 时显示）
            顶部信息栏显示「未保存」
            → 用户点击「保存故事」→ 触发 [手动保存数据流（v1.8 三步流程）]
```

### 视频分析数据流（v2.0 新增）

```
用户点击「添加视频」上传视频文件
      │
      ▼
[前端 InputPanel] 客户端校验
      ├─ 格式校验：MP4/MOV（video/mp4, video/quicktime）
      ├─ 时长校验：≤3 分钟
      ├─ 大小校验：≤500MB
      ├─ 数量校验：最多 1 段视频
      └─ 不通过 → 前端直接拒绝并显示具体原因
      │
      ▼（校验通过）
[前端 InputPanel] 显示上传进度 → 「AI 分析中...」
      │
      ▼
inputService.analyzeVideo(videoFile)
      → 将 File 转为 base64
      → POST /api/ai/analyze-video { videoBase64, mimeType }
      │
      ▼
[后端 routes/ai.ts → videoAnalyzer.analyzeVideo()]
      ├─ 1. 将 video base64 作为 inlineData 传入 TEXT_MODEL（Gemini Video Understanding）
      ├─ 2. AI 返回 JSON：{ description, keyFrames: [{ timestamp, description }] }
      ├─ 3. 对每个关键帧：AI 提取帧图片 → base64 → imageStorage.saveImage('scenes', ...) → URL
      └─ 4. 返回 VideoAnalysis（description + keyFrames with imageUrl）
      │
      ▼
[前端 InputPanel] 更新状态
      ├─ 设置 videoAnalysis = 返回结果
      ├─ 展示关键帧缩略图（与照片缩略图并排，带"关键帧"标签）
      ├─ 用户可删除单个关键帧（从 keyFrames 数组中移除）
      └─ 视频描述文字自动追加到 inputText（或作为独立字段传入 handleGenerate）
      │
      ▼（用户点击「生成漫画」时）
[前端 App.tsx handleGenerate]
      ├─ keyFrames.length 决定分镜数量（1:1 对应）
      ├─ videoAnalysis.description 作为输入传给 storyService
      ├─ keyFrames 图片 URL 作为 sceneReferenceImages 传给 imageService
      └─ 照片（如有）作为额外视觉参考，不增加分镜数

注意：
- 视频分析在上传时立即触发，不等待用户点击「生成漫画」
- 用户可在视频分析期间继续写文字、选风格、上传照片
- 分析失败时显示错误提示 + 重试按钮
```

---

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

### 历史记录浏览数据流（v1.4 新增，v1.8 重构为双栏主页面）

```
用户点击左侧「历史记录」图标
      │
      ▼
[前端 App.tsx] isHistoryOpen = true（isGrowthAlbumOpen 强制 false，C41）
      │
      ▼
[HistoryPanel 组件] 全宽双栏主页面挂载
      │
      ▼
apiClient.getStories()
      → GET /api/stories
      → 返回 StorySummary[]（title, createdAt, posterUrl, inputText）
      │
      ▼
左栏（280px）：历史列表（按 createdAt 倒序），默认选中第一条
右栏（flex）：展示第一条故事详情
      │
      ▼
用户点击左栏某条记录
      │
      ▼
apiClient.getStory(id)
      → GET /api/stories/:id
      → 返回 StoryDetail（posterUrl, inputText, inputPhotos）
      │
      ▼
右栏更新展示：
      ├─ 海报大图（posterUrl = /api/images/posters/xxx.png）
      ├─ 原始输入文字（inputText）
      └─ 原始上传照片（inputPhotos[]）（若有）
      （严格只读，不渲染编辑/重绘控件，C43）
      │
      ▼
用户点击右栏「删除」图标 → 确认弹窗 → DELETE /api/stories/:id
      → 同步删除 poster + input 磁盘文件
      → 左栏移除该条，选中相邻条
```

### 手动保存数据流（v1.7 新增，v1.8 重构为三步流程）

```
用户点击「保存故事」按钮（scenes.length > 0 && !isSaved 时可见）
      │
      ▼
[前端 App.tsx] 显示「保存中...」状态（isSaving = true）
      │
      ▼
Step ①: posterGenerator.generatePoster(scenes, title)
      → Canvas 拼合分镜网格海报 → canvas.toBlob() → Blob
      → Blob → base64 转换（poster_base64）
      │
      ▼（Step ① 完成后）
Step ②: 同时执行：
      ├─ 前端将 poster_base64 传入 POST body
      └─ 前端将 inputPhotos[]（base64）传入 POST body
      （实际文件写盘在后端 Step ③ 中执行）
      │
      ▼
Step ③: apiClient.saveStory({ title, input_text, input_photos, poster_base64, style })
      → POST /api/stories
      → 后端执行：
            ├─ imageStorage.saveImage('posters', poster_base64) → poster_url
            ├─ imageStorage.saveImage('inputs', photo_i) × N → input_photos[]
            └─ 写入 stories 表（title, input_text, input_photos JSON, poster_url）
      → 返回 { storyId }
      │
      ▼
      isSaved = true
      「保存故事」按钮消失
      顶部信息栏显示「✅ 已保存」

约束（C42）：Step① → Step③ 严格顺序，Step①失败则中止，Step③失败不写DB
```

### 修改同步数据流（v1.4 新增，v1.8 已废除）

```
⚠️ 此流程已在 v1.8 废除。

v1.8 起，故事保存后只读，不支持修改同步。
删除了 PUT /api/stories/:id 端点。
约束 C28（PUT debounce）已从约束清单删除（见 C42）。
```

### 成长相册浏览数据流（v1.7 新增，v1.8 更新为只读详情）

```
用户点击左侧导航栏「成长相册」图标
      │
      ▼
[前端 App.tsx] 设置 isGrowthAlbumOpen = true（isHistoryOpen 强制 false，C41）
      │
      ▼
[GrowthAlbum 组件] 挂载时调用 apiClient.getStories()
      → GET /api/stories → 返回 StorySummary[]（含 posterUrl、inputText）
      │
      ▼
Client-side 分组：stories 按 createdAt 分为 Map<year, Map<month, stories[]>>
渲染时间轴：年份标题行 → 月份标题行 → 故事卡片（日期 + 海报缩略图 posterUrl + 标题）
      │
      ▼
用户点击故事卡片
      │
      ▼
[v1.8] 在相册内展开只读详情（设置 selectedStoryId）
      → 右侧显示：海报大图 + input_text + input_photos（若有）
      → 不关闭相册，不调用 onSelectStory，不加载到创作面板
```

### PDF 成长故事书生成数据流（v1.7 新增）

```
用户在成长相册页面点击「生成 PDF 故事书」
      │
      ▼
[GrowthAlbum 组件] 展开日期范围选择面板
用户选择预设（月/半年/一年）或自定义日期范围
      │
      ▼
Client-side 筛选：从 stories 中过滤 createdAt 在 [from, to] 范围内的故事
显示「已选 X 个故事」提示
      │
      ▼
用户点击「生成 PDF」
      │
      ▼
Step 1: 生成年度总结（v1.8：输入改为 title + inputText，不再依赖 captions）
      apiClient.generateYearlySummary([ { title, inputText } ])
      → POST /api/ai/generate-summary
      [后端 storyPipeline.generateYearlySummary() → Gemini TEXT_MODEL → 300-500字文字]
      → 返回总结文字
      若失败 → 降级为「这一段时间里，记录了 ${count} 个成长故事。」
      │
      ▼
Step 2: 生成 PDF（纯前端 Canvas + jsPDF，v1.8：海报页结构）
      pdfGenerator.generateStoryBookPdf({
        dateLabel, characterName, summary, stories（含 posterUrl）
      })
      → 封面页：Canvas fillText 绘制标题/日期 → JPEG → addImage
      → 每个故事海报页（每故事 1 页）：
            fetch posterUrl → Canvas drawImage（全页铺满）
            Canvas fillText 叠加标题+日期 → JPEG → addPage + addImage
      → AI 总结页：Canvas fillText 多行正文 → JPEG → addPage + addImage
      → jsPDF.output('blob') → Blob
      │
      ▼
浏览器下载：URL.createObjectURL(blob) + <a download="成长故事书_xxx.pdf">
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

### 标题生成 质量标准（v1.4，v1.6 更新）

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 标题长度 | 4-10 个字（v1.6 收紧） | 代码检查字数 | 截断或使用 input_summary 前 10 字 |
| 标题格式 | 名词短语，优先「{人名}+{核心事件}」，禁止形容词堆叠开头 | 人工审查 | 用户可点击编辑修改 |
| 标题相关性 | 标题与故事主题强相关，读即知事 | 人工审查 | 用户可点击编辑修改 |
| 生成时机 | 与 Step4 并行，随 StoryOutput 一起返回，早于图片生成（v1.6） | 代码保证 | 不会发生（代码保证） |
| 生成可靠性 | 标题生成失败不阻塞主流程 | try-catch | 降级为 input_summary 前 10 字 + "..." |

### 手动保存 质量标准（v1.4 新增，v1.8 重构）

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 保存按钮可见性 | 仅在 `scenes.length > 0 && !isSaved` 时显示「保存故事」按钮 | 代码检查条件 | 不会发生（代码保证） |
| 保存顺序完整性 | 三步必须严格顺序：generatePoster → 后端写盘 → POST stories；任一步失败不写 DB | try-catch + 中止 | 报错给用户，不写 DB（C42） |
| 保存内容完整性 | POST body 必须包含 title、input_text、input_photos、poster_base64、style | 代码检查请求体 | 不会发生（代码保证） |
| 保存后只读 | 保存成功后按钮消失，故事不支持编辑/重绘/PUT 同步 | UI 检查 | 不会发生（代码保证） |
| 保存状态指示 | 「未保存」→「保存中...」→「✅ 已保存」状态正确流转 | UI 检查 | 不会发生（代码保证） |

### PDF 成长故事书 质量标准（v1.7 新增，v1.8 更新）

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 中文显示 | PDF 中中文字符完整显示，无乱码 | 人工审查 | Canvas fillText 渲染（不用 jsPDF.text，C39） |
| 年度总结降级 | AI 生成失败时降级为固定文字，不阻塞 PDF 生成（C40） | try-catch | 固定降级文字兜底 |
| 多页正确性 | 封面页 + 故事海报页（每故事一页）+ 总结页页数和内容正确 | 人工审查 | 代码 bug，修复 |
| 海报图片显示 | 每个故事的海报图在 PDF 中全页正确展示 | 人工审查 | fetch + canvas 渲染，检查错误处理 |
| AI 总结输入 | 总结 AI 输入为 title + inputText（非 captions） | 代码检查 generateYearlySummary 调用参数 | 不会发生（代码保证） |
| 下载文件名 | 格式 `成长故事书_${startDate}_${endDate}.pdf` | 代码检查 | 不会发生（代码保证） |

### 海报导出 质量标准（v1.4 新增）

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 排版正确性 | 分镜按 2 列网格排列，奇数末行居中 | 人工审查 | 代码 bug，修复 |
| 图片清晰度 | 海报图片与原始分镜同等清晰度 | 人工审查 | 检查 Canvas drawImage 参数 |
| 标题显示 | 海报包含故事标题和日期 | 人工审查 | 代码 bug，修复 |
| 水印显示 | 底部显示 "MangaGrow" | 人工审查 | 代码 bug，修复 |
| 导出格式 | PNG 格式，文件名包含标题 | 代码检查 | 不会发生（代码保证） |

### 视频分析 质量标准（v2.0 新增）

| 维度 | 标准 | 检查方法 | 不达标处理 |
|------|------|---------|-----------|
| 前端校验 | 格式（MP4/MOV）、时长（≤3min）、大小（≤500MB）、数量（≤1）不满足时直接拒绝 | 代码检查 | 不会发生（代码保证） |
| 视频描述质量 | 描述 100-200 字，涵盖场景/人物/动作/情绪 | 人工抽查 | AI 输出质量问题，调整 prompt |
| 关键帧数量 | 2-4 个关键帧，每帧代表故事一个阶段 | 代码检查 JSON 数组长度 | AI 返回 <2 帧时使用全部；>4 帧时截取前 4 帧 |
| 关键帧叙事性 | 帧间有叙事推进，不重复 | 人工抽查 | AI 输出质量问题，调整 prompt |
| 关键帧图片质量 | 帧图片清晰可用作场景参考 | 人工审查 | 用户可删除不满意的帧 |
| 分析超时 | 120 秒内完成 | 代码 timeout | 超时返回错误，用户可重试 |
| 分析失败处理 | 失败时前端显示错误提示 + 重试按钮 | UI 检查 | 不会发生（代码保证） |
| 视频+照片混合 | 关键帧决定分镜骨架，照片为额外参考 | 代码检查生成逻辑 | 不会发生（代码保证） |

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
| C21 | 图片文件必须存储在 `data/images/{type}/` 下（type: avatars/posters/inputs），不允许存到其他位置 | server/imageStorage | 统一管理（v1.8 更新） |
| C22 | 数据库所有表必须包含 `user_id` 字段（当前可为 NULL），为多用户预留 | server/db/schema.ts | 扩展性 |
| C23 | 前端图片展示必须使用后端 URL（`/api/images/...`），不允许使用 base64 Data URL 长期存储 | 前端所有文件 | 内存和性能 |
| C24 | 后端 API 必须返回标准 JSON 格式 `{ success: boolean, data?: any, error?: string }` | server/routes/*.ts | API 一致性 |
| C25 | 图片保存到磁盘时必须使用唯一文件名（UUID），防止覆盖 | server/imageStorage | 数据安全 |
| C26 | 前端 `services/*.ts` 不允许直接 import `@google/genai`，所有 AI 功能通过 `apiClient` 调用后端 | 前端 services/*.ts | 架构边界 |
| C27 | 生成完成后必须**显示「保存故事」按钮**（不自动保存），`scenes.length > 0 && !isSaved` 时按钮可见，保存成功后按钮消失；不存在 PUT /api/stories/:id（已废除） | 前端 App.tsx, DisplayPanel | 避免废片（v1.8 更新） |
| C29 | 海报生成必须使用原生 Canvas API，不引入 html2canvas 等第三方库 | 前端 utils/posterGenerator.ts | 依赖最小化（v1.4） |
| C30 | 海报排版固定 2 列，奇数分镜末行居中，水印固定 "MangaGrow" | 前端 utils/posterGenerator.ts | 排版一致性（v1.4） |
| C31 | 标题生成失败不允许阻塞主流程，必须降级为 input_summary 前 15 字 | server/storyPipeline, 前端 App.tsx | 容错（v1.4） |
| C32 | ~~HistoryPanel 侧边栏约束已废除~~（v1.8 重构为双栏主页面，见 C43） | — | 已废除（v1.8） |
| C33 | ~~历史故事加载到创作面板约束已废除~~（v1.8 历史为只读，见 C43） | — | 已废除（v1.8） |
| C34 | 分镜卡片下方显示 caption（10-20字故事叙述），完整 script 仅在编辑气泡弹窗中展示，不允许直接展示 script | 前端 DisplayPanel.tsx | 阅读体验（v1.5） |
| C35 | 人物快捷区必须按输入文本自动匹配人物名字，不允许默认显示所有人物；文本为空时不显示任何人物 | 前端 InputPanel.tsx | 信息准确性（v1.5） |
| C36 | 人物头像点击时必须打开人物库并直接进入该人物详情视图（通过 initialCharacterId prop 实现） | 前端 InputPanel.tsx, CharacterLibrary.tsx | 操作便捷性（v1.5） |
| C37 | 标题生成必须在 storyPipeline 内与 Step4 并行执行，随 StoryOutput.title 一起返回；前端收到后立即设置标题，不得等待图片生成完成 | server/storyPipeline, 前端 App.tsx | 体验一致性（v1.6） |
| C38 | 图片串行生成时，Scene 2+ 以上一张已生成分镜图作为场景参考（链式传递），通过 `[风格参考帧]` prompt label 保持画风一致；有用户照片时每张用对应用户照片作参考 | 前端 App.tsx, server/imageGenerator | 人物一致性（v1.6） |
| C39 | PDF 中所有中文文字必须通过 Canvas fillText 渲染后转为图片嵌入，不允许直接调用 jsPDF.text 输出中文（避免字体缺失乱码） | 前端 utils/pdfGenerator.ts | 中文显示（v1.7） |
| C40 | 年度总结 AI 生成失败时必须降级为固定文字（不允许空白总结页或阻塞 PDF 生成），降级文字：「这一段时间里，记录了 ${count} 个成长故事。」 | 前端 GrowthAlbum.tsx, 后端 storyPipeline | 容错（v1.7） |
| C41 | 成长相册（isGrowthAlbumOpen）与历史记录主页面（isHistoryOpen）必须互斥，不允许同时显示；打开任一时必须关闭另一 | 前端 App.tsx | 交互一致性（v1.7，v1.8 更新） |
| C42 | 保存故事流程必须严格按顺序：① posterGenerator.generatePoster() ② imageStorage.saveImage('posters'/'inputs') ③ POST /api/stories；任一步骤失败不得写入数据库 | 前端 App.tsx, 后端 routes/stories.ts | 数据完整性（v1.8） |
| C43 | HistoryPanel 必须为双栏主页面：左栏故事列表（280px）+ 右栏只读详情；右栏只展示 posterUrl/inputText/inputPhotos，不渲染任何编辑/重绘控件 | 前端 components/HistoryPanel.tsx | 只读一致性（v1.8） |
| C44 | 视频校验必须在前端完成（格式 MP4/MOV、时长 ≤3min、大小 ≤500MB、数量 ≤1），不满足时直接拒绝，不发送到后端 | 前端 InputPanel.tsx | 避免无效上传（v2.0） |
| C45 | 视频分析必须在上传时立即触发（异步），不等待用户点击「生成漫画」；用户可在分析期间继续输入文字、选风格、上传照片 | 前端 InputPanel.tsx, App.tsx | 并行体验（v2.0） |
| C46 | 关键帧数量由 AI 决定（2-4 帧），前端不可手动添加帧，只可删除；删除帧后分镜数同步减少；关键帧与分镜 1:1 对应 | 前端 App.tsx, 后端 videoAnalyzer | 叙事一致性（v2.0） |
| C47 | 视频 + 照片可同时上传：关键帧决定分镜骨架（1:1），照片作为额外视觉参考注入，不增加分镜数 | 前端 App.tsx | 混合输入（v2.0） |
| C48 | 后端不保存视频原文件到磁盘，只保存关键帧图片（通过 imageStorage.saveImage('scenes', ...)）| 后端 videoAnalyzer | 存储效率（v2.0） |
| C49 | 视频分析 API 超时设置为 120 秒（视频处理耗时较长），超时返回错误 | 后端 routes/ai.ts, videoAnalyzer | 超时控制（v2.0） |

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
| v1.4 | 2026-02-14 | Product-Spec v1.4 — 故事标题 + 自动保存 + 网格海报导出 + 历史记录 | 1) storyPipeline 新增 `generateTitle()` 函数; 2) StoryOutput 新增 `title` 字段; 3) stories 表新增 `title TEXT` 和 `updated_at INTEGER` 列; 4) apiClient 新增 `updateStory()` 函数; 5) 新增前端 posterGenerator 模块（Canvas 网格海报生成）; 6) 新增前端 HistoryPanel 组件（历史记录侧边栏）; 7) 新增 StorySummary 类型; 8) 主流程数据流新增标题生成和自动保存步骤; 9) 新增历史记录浏览数据流和修改同步数据流; 10) 新增 4 组质量标准（标题/自动保存/海报/历史）; 11) 新增约束 C27-C33; 12) 3 个新增技术方案（标题生成/自动保存/海报导出） | storyPipeline, apiClient, db schema, App.tsx, DisplayPanel, 新增 posterGenerator + HistoryPanel |
| v1.6 | 2026-02-24 | 生成流程优化：标题提前 + 锚定帧一致性 + 人物规则松绑 + 标题格式收紧 | 1) storyPipeline: generateTitle 移入管线，与 Step4 并行执行，StoryOutput 新增 title 字段; 2) App.tsx: 收到 storyResult 后立即 setStoryTitle，去掉单独 generateTitle 调用; 3) App.tsx: 图片串行生成改为锚定帧策略（所有分镜参考 Scene 1，非链式）; 4) imageGenerator: scene 参考 label 改为"基准帧"描述; 5) storyPipeline: 人物规则改为按文本提及分档（提及→强制，未提及→仅参考）; 6) storyPipeline: 标题 prompt 改为 4-10字名词短语格式; 7) 新增约束 C37、C38; 8) 标题质量标准更新 | storyPipeline, App.tsx, imageGenerator, server/types, 前端 types |
| v1.8 | 2026-02-27 | Product-Spec v1.8 — 存储模型重构（海报存储 + 历史只读 + 历史双栏页面） | 1) DB schema：删除 scenes 表；stories 表新增 input_text/input_photos/poster_url，删除 updated_at; 2) imageStorage：type 参数从 avatars/scenes 改为 avatars/posters/inputs，ensureDirectories 新增 posters/inputs 目录; 3) 手动保存方案重构：废除 debounce PUT，改为「generatePoster → 上传 → POST」三步流程; 4) HistoryPanel 重构：侧边栏 → 双栏主页面（左280px列表 + 右只读详情）; 5) GrowthAlbum：缩略图改为 posterUrl；点击故事展开只读详情（不调用 onSelectStory）; 6) pdfGenerator：StoryBookOptions 删除 scenes[]，改为 posterUrl+inputText；故事页从分镜网格改为海报全页; 7) apiClient：saveStory body 改为 title/input_text/input_photos/poster_base64/style; 8) 约束：C21 更新目录类型；C27 更新保存流程；删除 C28/C32/C33；C41 更新；新增 C42/C43 | DB schema, imageStorage, App.tsx, HistoryPanel, GrowthAlbum, pdfGenerator, apiClient, routes/stories.ts |
| v1.7 | 2026-02-26 | Product-Spec v1.6 — 手动保存确认 + 成长相册 + PDF 成长故事书 | 1) 存档逻辑：自动保存改为手动保存（生成完显示「保存故事」按钮，点击后 POST）；已保存故事仍 debounce PUT；约束 C27/C28 更新; 2) 新增前端模块 GrowthAlbum（时间轴页面，client-side 按年/月分组）; 3) 新增前端工具 pdfGenerator（Canvas 分页渲染 + jsPDF 拼合，中文用 Canvas fillText）; 4) 后端 storyPipeline 新增 generateYearlySummary（300-500字年度总结，TEXT_MODEL）; 5) 后端新增 POST /api/ai/generate-summary 端点; 6) apiClient 新增 generateYearlySummary 方法; 7) 新增 3 个技术方案（手动保存/成长相册/PDF）; 8) 新增 3 个数据流（手动保存/成长相册浏览/PDF生成）; 9) 新增约束 C39/C40/C41; 10) 新增 PDF 质量标准 | App.tsx, DisplayPanel, 新增 GrowthAlbum + pdfGenerator, storyPipeline, routes/ai.ts, apiClient |
| v1.5 | 2026-02-24 | 分镜卡片 caption 显示 + 人物快捷区自动匹配 + 人物头像点击进入详情 | 1) SceneScript 新增 `caption: string` 字段（10-20字故事叙述）; 2) Scene 新增 `caption?: string` 字段; 3) scenes 表新增 `caption TEXT` 列（ALTER TABLE 迁移）; 4) storyPipeline Step 3 同时生成 description（图像脚本）和 caption（故事叙述）; 5) DisplayPanel 分镜卡片下方改为显示 caption，script 改为气泡弹窗编辑; 6) InputPanel 人物快捷区改为按文本自动匹配人物名字; 7) InputPanel 新增 `onCharacterClick` prop; 8) CharacterLibrary 新增 `initialCharacterId` prop，支持直接进入人物详情; 9) posterGenerator PosterOptions `scenes` 字段从 `script` 改为 `caption`; 10) 新增约束 C34-C36; 11) 新增前端组件 Props 变更文档 | SceneScript 类型, Scene 类型, db schema, storyPipeline Step 3, DisplayPanel, InputPanel, CharacterLibrary, posterGenerator, App.tsx |
| v2.0 | 2026-03-06 | Product-Spec v2.0 — 视频转漫画功能 | 1) 新增后端模块 videoAnalyzer（视频内容理解 + 关键帧提取，使用 Gemini Video Understanding）; 2) 新增 `POST /api/ai/analyze-video` 端点; 3) 新增 VideoAnalysis/VideoKeyFrame 类型（前后端）; 4) inputService 新增 `analyzeVideo()` 前端薄封装; 5) apiClient 新增 `analyzeVideo()` 方法; 6) InputPanel 新增视频上传按钮 + 校验 + 分析状态 + 关键帧缩略图展示; 7) App.tsx handleGenerate 新增视频路径（关键帧 1:1 决定分镜数，照片为额外参考）; 8) 主流程数据流新增视频分析路径; 9) 新增视频分析数据流; 10) 新增视频转漫画技术方案; 11) 新增视频分析质量标准; 12) 新增约束 C44-C49; 13) 修正模型名称（gemini-2.5-flash / nano-banana-pro-preview 与代码一致） | 新增 videoAnalyzer, routes/ai.ts, inputService, apiClient, InputPanel, App.tsx, types.ts, 数据流, 约束 C44-C49 |
