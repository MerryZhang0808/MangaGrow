# Tasks - MangaGrow 漫画成长记录

## 概述
共 44+5 个任务：1 个 POC 任务，44 个已完成开发任务，5 个新增开发任务（v2.0 视频转漫画）。
T-01~T-44 + FIX-03 已全部完成（基础模块 + 核心管线 + 后端迁移 + 功能增强 + 存储重构）。
T-45~T-49 为 v2.0 新任务（视频转漫画功能：后端视频分析 + 前端视频上传 + 生成流程集成）。
POC-01 与开发任务独立，结果影响 T-05。

---

## POC 任务（先验证再开发）

### [POC-01] 角色参考表生成验证
- **目的**：验证 Gemini API 能否根据用户照片稳定生成多角度角色参考表（正面+全身）
- **方案引用**：Architecture.md → 人物一致性技术方案 / POC 清单
- **验证方法**：
  1. 准备 3 张不同人物照片（幼儿、儿童、成人各 1 张）
  2. 对每张照片调用 gemini-3-pro-image-preview，提示词要求生成「正面半身 + 全身」参考表
  3. 检查生成结果：角色特征是否与原照一致、角度是否正确、是否可用作后续参考
- **预期结果**：3 次中至少 2 次生成可用的参考表
- **通过后**：在 characterService 中启用 `generateReferenceSheet()`，Character 类型中 `referenceSheetUrl` 字段正式使用
- **不通过**：跳过参考表，仅使用头像 + 详细文字描述（T-05 中标注的 POC 部分不实现）
- **状态**：⬜ 待验证（独立于 T-01~T-10，可后续执行）

---

## 开发任务

### [T-01] 提取基础设施模块（aiClient + imageUtils + storageUtils）
- **目的**：从 geminiService.ts 中提取共享基础设施，为后续模块拆分打基础
- **方案引用**：Architecture.md → aiClient 模块 / 模块总览
- **修改文件**：
  - `services/aiClient.ts`：新建，提取 `getAiClient()`、`withRetry()`、`SAFETY_SETTINGS`、`TEXT_MODEL`、`IMAGE_MODEL` 常量
  - `utils/imageUtils.ts`：新建，提取 `compressImage()`、`parseDataUri()`
  - `utils/storageUtils.ts`：新建，封装 LocalStorage 读写（characters、history）
  - `services/geminiService.ts`：保留但改为从 aiClient 和 imageUtils 导入
- **实现要求**：
  1. `TEXT_MODEL = 'gemini-3-flash-preview'`，`IMAGE_MODEL = 'gemini-3-pro-image-preview'` 定义为常量
  2. `withRetry` 保持现有逻辑（指数退避 + jitter，4xx 不重试，429 除外）
  3. 提取后 geminiService.ts 中的所有函数必须仍能正常工作（不改变行为，只改变导入来源）
- **约束**：
  - 必须遵守 C04（模型名称从 aiClient 常量引用）
- **验收标准**：
  - [ ] aiClient.ts 导出 getAiClient、withRetry、SAFETY_SETTINGS、TEXT_MODEL、IMAGE_MODEL
  - [ ] imageUtils.ts 导出 compressImage、parseDataUri
  - [ ] storageUtils.ts 导出 loadCharacters、saveCharacters、loadHistory、saveHistory
  - [ ] geminiService.ts 从新模块导入，所有原有功能不受影响
  - [ ] 项目能正常 `npm run dev` 启动且无 TypeScript 错误
- **依赖**：无
- **状态**：✅ 已完成

---

### [T-02] 提取风格配置模块（styleConfig）
- **目的**：将 4 种风格的详细提示词参数从散落的代码中集中管理
- **方案引用**：Architecture.md → styleConfig 模块
- **修改文件**：
  - `services/styleConfig.ts`：新建，定义 4 组风格英文提示词 + `getStylePrompt()` + `getStyleDescription()`
- **实现要求**：
  1. 4 组风格提示词按 Architecture.md 中的表格硬编码
  2. `getStylePrompt(style: ComicStyle): string` 返回完整英文关键词
  3. `getStyleDescription(style: ComicStyle): string` 返回中文描述（用于脚本生成时的风格引导）
- **约束**：
  - 必须遵守 C07（风格提示词必须从此模块获取）
- **验收标准**：
  - [ ] styleConfig.ts 导出 getStylePrompt、getStyleDescription
  - [ ] 4 种 ComicStyle 枚举值都有对应的提示词和描述
  - [ ] 无 TypeScript 错误
- **依赖**：无
- **状态**：✅ 已完成

---

### [T-03] 提取输入处理模块（inputService）
- **目的**：将语音转文字和图片分析功能从 geminiService.ts 中独立出来
- **方案引用**：Architecture.md → inputService 模块
- **修改文件**：
  - `services/inputService.ts`：新建，迁移 `transcribeAudio()` 和 `analyzeImages()`
  - `services/geminiService.ts`：移除上述两个函数
  - `App.tsx`：更新 import 来源为 inputService
- **实现要求**：
  1. `transcribeAudio` 逻辑不变，改为从 aiClient 导入 `getAiClient`、`withRetry`、`TEXT_MODEL`
  2. `analyzeImages` 模型统一为 `TEXT_MODEL`（当前代码用 `gemini-flash-latest`，需修正）
  3. 返回类型改为结构化的 `ImageAnalysis[]`（而非 JSON 字符串）
- **约束**：
  - 必须遵守 C03（withRetry 包装）、C04（模型常量）、C12（图片压缩）
- **验收标准**：
  - [ ] inputService.ts 导出 transcribeAudio、analyzeImages
  - [ ] analyzeImages 使用 TEXT_MODEL 而非 gemini-flash-latest
  - [ ] analyzeImages 返回 `ImageAnalysis[]` 类型（需在 types.ts 中定义）
  - [ ] App.tsx 从 inputService 导入且功能正常
  - [ ] 单张图片分析失败时不中断整体流程
- **依赖**：依赖 [T-01]
- **状态**：✅ 已完成

---

### [T-04] 构建故事管线（storyService） ⚠️
- **目的**：将现有单步脚本生成替换为 5 步管线 + 2 个质量关卡
- **⚠️ 受 v1.1 变更影响**：管线从 5 步改为 4 步，审核不再重试。见 T-11。
- **方案引用**：Architecture.md → storyService 模块（核心升级）
- **修改文件**：
  - `services/storyService.ts`：新建，实现 5 步管线
  - `types.ts`：新增 `StoryInput`、`StoryOutput`、`SceneScript`、`StoryOutline` 等类型
  - `services/geminiService.ts`：移除 `generateScripts()`
- **实现要求**：
  1. 实现 5 个内部函数：`analyzeInput()`、`generateOutline()`、`reviewOutline()`、`detailScripts()`、`checkConsistency()`
  2. `generateStory(input: StoryInput): Promise<StoryOutput>` 为入口，按顺序调用 5 步
  3. Step 3（reviewOutline）：审核不通过时带修改建议回到 Step 2，最多 2 次，超过降级继续
  4. Step 5（checkConsistency）：发现不一致时局部修正，不重新生成全部
  5. 每步都使用 `responseMimeType: "application/json"` 要求 JSON 输出
  6. 用户上传 N 张图片时，Step 2 必须在大纲中规划 N 个分镜（1:1 对应）
- **约束**：
  - 必须遵守 C09（5 步按顺序）、C10（质量关卡最多 2 次重试）、C11（JSON 验证）、C04（模型常量）
- **验收标准**：
  - [ ] storyService.ts 导出 generateStory
  - [ ] 5 步管线按顺序执行，日志中可见每步的执行记录
  - [ ] Step 3 审核不通过时触发重试（可通过日志确认）
  - [ ] Step 3 超过 2 次重试后降级继续（不阻塞）
  - [ ] Step 5 发现不一致时执行局部修正
  - [ ] 输出的 StoryOutput 包含 currentBatch（SceneScript[]）、keyObjects、characterDefinitions
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 [T-01]
- **状态**：✅ 已完成

---

### [T-05] 重构角色系统（characterService） ⚠️
- **目的**：将角色相关功能从 geminiService.ts 独立，增加参考表能力（POC 后决定）
- **⚠️ 受 v1.2 变更影响**：需新增性别/年龄识别、更新 description 函数，`generateAvatar()` 需支持性别/年龄参数。见 T-13。
- **方案引用**：Architecture.md → characterService 模块 / 人物一致性技术方案
- **修改文件**：
  - `services/characterService.ts`：新建，迁移并增强角色功能
  - `types.ts`：Character 类型新增 `referenceSheetUrl?: string` 字段
  - `services/geminiService.ts`：移除 `generateCharacter()`
  - `components/CharacterLibrary.tsx`：更新 import 来源
- **实现要求**：
  1. 迁移现有 `generateCharacter()` 逻辑，拆分为 `analyzeCharacter()` + `generateAvatar()` 两步
  2. 新增 `createCharacter(name, photoDataUri)` 组合入口（调用分析→生成头像→返回 Character）
  3. 新增 `getCharacterReferences(characters, sceneScript)` 用于图片生成时筛选相关角色
  4. 如果 POC-01 通过：实现 `generateReferenceSheet()`，在 `createCharacter` 中调用
  5. 如果 POC-01 不通过：`generateReferenceSheet()` 留空函数，`referenceSheetUrl` 不赋值
- **约束**：
  - 必须遵守 C05（头像 2K）、C06（照片+文字同时传入）、C12（照片压缩）
- **验收标准**：
  - [ ] characterService.ts 导出 createCharacter、getCharacterReferences
  - [ ] 角色头像生成使用 2K 分辨率
  - [ ] 生成头像时同时传入照片和文字描述
  - [ ] Character 类型包含 referenceSheetUrl 可选字段
  - [ ] CharacterLibrary 组件从 characterService 导入且功能正常
  - [ ] getCharacterReferences 能正确筛选脚本中涉及的角色
- **依赖**：依赖 [T-01]，POC-01 结果影响参考表部分
- **状态**：✅ 已完成（参考表部分待 POC-01）

---

### [T-06] 重构图片生成模块（imageService）
- **目的**：将图片生成功能独立，集成 styleConfig 和 characterService
- **方案引用**：Architecture.md → imageService 模块 / 图片生成质量技术方案
- **修改文件**：
  - `services/imageService.ts`：新建，迁移并重构 `generateImage()`
  - `services/geminiService.ts`：移除 `generateImage()`（此时 geminiService.ts 应为空文件，可删除）
- **实现要求**：
  1. 实现 `generateSceneImage(params: SceneImageParams): Promise<string>`
  2. 提示词构造：从 `styleConfig.getStylePrompt()` 获取风格参数，按 6 层优先级结构组织
  3. 参考图注入：从 `characterService.getCharacterReferences()` 获取角色参考图
  4. 分辨率固定 1K（`imageSize: '1K'`）
  5. 降级逻辑：有参考图生成失败 → 纯文字重试 → 失败 → 报错
  6. 连续性参考：非首个分镜且无用户照片时，使用前一分镜图作为参考
- **约束**：
  - 必须遵守 C05（分镜 1K）、C07（风格从 styleConfig 获取）、C08（同组分镜相同参数）、C14（降级机制）
- **验收标准**：
  - [ ] imageService.ts 导出 generateSceneImage
  - [ ] 风格提示词通过 styleConfig.getStylePrompt() 获取（非硬编码）
  - [ ] 图片分辨率为 1K
  - [ ] 有参考图失败时自动降级为纯文字方案
  - [ ] geminiService.ts 已无剩余函数（可安全删除）
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 [T-01], [T-02], [T-05]
- **状态**：✅ 已完成

---

### [T-07] 集成 App.tsx 调度逻辑 ⚠️
- **目的**：更新 App.tsx 中的 handleGenerate 流程，对接新的服务模块
- **⚠️ 受 v1.1 变更影响**：图片生成从串行改为条件并行。见 T-12。
- **方案引用**：Architecture.md → 主流程数据流
- **修改文件**：
  - `App.tsx`：重写 handleGenerate 函数
  - `services/geminiService.ts`：确认已无引用后删除
- **实现要求**：
  1. handleGenerate 流程改为：
     - 调用 `inputService.analyzeImages()` 处理图片（如有）
     - 调用 `storyService.generateStory()` 生成脚本（替代原 generateScripts）
     - 从 StoryOutput 中提取 scenes、keyObjects、characterDefinitions
     - 逐个分镜调用 `imageService.generateSceneImage()` 生成图片
  2. 角色筛选改用 `characterService.getCharacterReferences()`
  3. 移除 App.tsx 中所有对 geminiService 的 import
- **约束**：
  - 必须遵守 C02（组件不直接调用 Gemini API）
- **验收标准**：
  - [ ] App.tsx 不再 import geminiService
  - [ ] handleGenerate 依次调用 inputService → storyService → imageService
  - [ ] 角色筛选通过 characterService.getCharacterReferences()
  - [ ] 完整的生成流程可正常运行（文字输入 → 脚本 → 图片）
  - [ ] geminiService.ts 文件已删除
- **依赖**：依赖 [T-03], [T-04], [T-05], [T-06]
- **状态**：✅ 已完成

---

### [T-08] 集成 CharacterLibrary 组件 ⚠️
- **目的**：更新人物库组件，对接 characterService
- **⚠️ 受 v1.2 变更影响**：需新增详情页视图、性别/年龄显示、重新生成按钮。见 T-14、T-15。
- **方案引用**：Architecture.md → characterService 模块 / 角色创建数据流
- **修改文件**：
  - `components/CharacterLibrary.tsx`：更新创建角色逻辑
- **实现要求**：
  1. 创建角色改为调用 `characterService.createCharacter(name, photoDataUri)`
  2. 返回完整 Character 对象（含 avatarUrl、description、referenceSheetUrl）
  3. 保存角色时使用 `storageUtils.saveCharacters()`
- **约束**：
  - 必须遵守 C02（组件不直接调用 Gemini API）、C06（照片+文字同时传入）
- **验收标准**：
  - [ ] CharacterLibrary 不再直接调用 Gemini API
  - [ ] 创建角色流程正常（输入名字+照片 → 生成头像 → 保存）
  - [ ] 角色数据包含 description 和 avatarUrl
  - [ ] 角色数据正确保存到 LocalStorage
- **依赖**：依赖 [T-05]
- **状态**：✅ 已完成

---

### [T-09] 更新 DisplayPanel 重绘逻辑
- **目的**：更新分镜展示面板的重绘功能，对接 imageService
- **方案引用**：Architecture.md → imageService 模块
- **修改文件**：
  - `components/DisplayPanel.tsx`：更新重绘单个分镜的逻辑
- **实现要求**：
  1. 单分镜重绘改为调用 `imageService.generateSceneImage()`
  2. 重绘时传入前后分镜图作为连续性参考
  3. 风格参数从 props 中获取的 ComicStyle 通过 styleConfig 转换
- **约束**：
  - 必须遵守 C02、C07、C14
- **验收标准**：
  - [ ] 重绘单个分镜功能正常
  - [ ] 重绘时使用 styleConfig 获取风格提示词
  - [ ] 重绘失败时有降级处理
- **依赖**：依赖 [T-06]
- **状态**：✅ 已完成

---

### [T-10] 清理 + dev-constraints 同步 + 架构图更新
- **目的**：清理废弃代码，确保约束文档与 Architecture.md 一致，更新架构图
- **方案引用**：Architecture.md → 约束清单 C15
- **修改文件**：
  - `services/geminiService.ts`：确认已删除（T-07 中完成）
  - `rules/dev-constraints.md`：同步 Architecture.md 中 C01-C15 的最新内容
  - `architecture-diagram.html`：确认与 Architecture.md 一致（如有变更则更新）
- **实现要求**：
  1. 确认 geminiService.ts 已无任何引用并删除
  2. dev-constraints.md 中的分辨率规则更新为：分镜 1K，头像 2K（当前写的是统一 2K）
  3. 检查 architecture-diagram.html 是否反映最新模块结构
  4. 确认所有 import 路径正确，无 unused import
- **验收标准**：
  - [ ] 项目中无对 geminiService.ts 的引用
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致
  - [ ] architecture-diagram.html 与 Architecture.md 一致
  - [ ] `npm run dev` 正常启动，无警告无错误
  - [ ] TypeScript 编译无错误
- **依赖**：依赖 [T-07], [T-08], [T-09]
- **状态**：✅ 已完成

---

## 依赖关系图

```
=== v1.0~v1.2（已完成）===

POC-01 ──→ T-05 ⚠️
T-01 ──→ T-03 ──→ T-07 ──→ T-12 ✅
  ├──→ T-04 ──→ T-11 ✅
  └──→ T-05 ──→ T-06 ──→ T-07 ──→ T-09 ──→ T-10 ✅
         ├──→ T-08 ──→ T-13 ──→ T-14 ──→ T-15 ✅
T-02 ──→ T-06 ✅

=== v1.3 后端迁移（已完成）===

T-16 → T-17 → T-18/T-19/T-20 → T-21 → T-22 → T-23 ✅

=== v1.4 功能增强（待开发）===

T-24 (DB 迁移 + 标题生成 API)
  │
  ├──→ T-25 (自动保存 + 同步)
  │         │
  │         └──→ T-27 (历史记录侧边栏) ──→ T-29 (集成验证 + 文档同步)
  │
  └──→ T-26 (网格海报导出) ──→ T-29

T-28 (导航栏 + DisplayPanel UI 更新) ──→ T-29
```

**推荐执行顺序**：

| 阶段 | 任务 | 说明 |
|------|------|------|
| Phase 1-14 | T-01~T-23 | ✅ 全部完成 |
| **Phase 15** | **T-24** | **DB 迁移 + 后端标题生成 + PUT 路由** |
| **Phase 16** | **T-25, T-26, T-28** | **三者可并行：自动保存、海报导出、UI 更新** |
| **Phase 17** | **T-27** | **历史记录侧边栏（依赖自动保存）** |
| **Phase 18** | **T-29** | **集成验证 + 文档同步** |

---

## 状态说明

| 符号 | 含义 |
|------|------|
| ⬜ | 待开发/待验证 |
| 🔄 | 进行中 |
| ✅ | 已完成 |
| ❌ | 已否决/不再需要 |
| ⚠️ | 受上游变更影响，需重新审视 |

---

### [T-11] 故事管线优化：5 步合并为 4 步 + 审核不重试
- **目的**：合并 storyService 的 Step 1（输入分析）和 Step 2（大纲生成）为单步，审核门禁改为仅审核不重试
- **方案引用**：Architecture.md v1.1 → storyService 模块 / 故事管线技术方案
- **修改文件**：
  - `services/storyService.ts`：重构管线流程
- **实现要求**：
  1. 删除 `analyzeInput()` 函数
  2. 修改 `generateOutline()` 的 prompt，内置事件提取逻辑（who/what/emotion/keyDetails），直接从原始输入生成大纲
  3. 删除 `generateStory()` 中的 outline 重试循环（`for` 循环 + `MAX_OUTLINE_RETRIES`）
  4. `reviewOutline()` 仍然执行，但不通过时直接降级继续
  5. 将 `reviewOutline()` 返回的 `issues` 传递给 `detailScripts()`，在脚本细化 prompt 中作为优化参考
  6. 更新日志输出：`[StoryPipeline] Step 1/2/3/4` 而非原来的 `Step 1/2/3/4/5`
- **约束**：
  - 必须遵守 C09（4 步按顺序）、C10（仅审核不重试）、C11（JSON 验证）
- **验收标准**：
  - [ ] `analyzeInput()` 函数已删除
  - [ ] `generateOutline()` 直接接收原始输入（text, imageAnalysis, characters, style）
  - [ ] 无重试循环代码（无 `MAX_OUTLINE_RETRIES`、无 `for` 循环包裹 outline+review）
  - [ ] `reviewOutline()` 的 issues 传递给 `detailScripts()`
  - [ ] 管线日志显示 4 步执行记录
  - [ ] 无 TypeScript 错误
- **依赖**：基于 [T-04] 已完成的代码
- **状态**：✅ 已完成

---

### [T-12] 图片生成条件并行化
- **目的**：有用户照片时并行生成所有分镜图片，无照片时保持串行（保证环境一致性）
- **方案引用**：Architecture.md v1.1 → 主流程数据流
- **修改文件**：
  - `App.tsx`：重写 handleGenerate 中图片生成部分（L157-202）
- **实现要求**：
  1. 判断条件：`inputImages.length > 0 && inputImages.length >= initialScenes.length`
  2. **有照片路径**（并行）：
     - 使用 `Promise.all` 并行调用 `generateSceneImage()`
     - 每个 scene 使用 `inputImages[i]` 作为 `sceneReferenceImages`
     - 每完成一张立即更新对应 Scene 状态（`setScenes` 在 `.then()` 中调用）
     - `generationStage` 显示 "并行绘制中..."
  3. **无照片路径**（串行，保持现有逻辑）：
     - for 循环逐个生成
     - `previousGeneratedImage` 传递给下一张作为连续性参考
     - `generationStage` 显示 "绘制第 X/N 幅画面..."
  4. 两条路径共享相同的错误处理逻辑（单张失败不中断其他）
- **约束**：
  - 无照片时必须保持串行（参考 MEMORY.md 记录的环境不一致问题）
  - 必须遵守 C08（同组分镜相同风格参数）
- **验收标准**：
  - [ ] 有照片时：所有分镜图片并行生成（Promise.all）
  - [ ] 无照片时：分镜图片串行生成（for 循环 + previousGeneratedImage）
  - [ ] 并行生成时，每张图完成后立即更新 UI（非等全部完成）
  - [ ] 单张图片生成失败不影响其他图片
  - [ ] 无 TypeScript 错误
- **依赖**：基于 [T-07] 已完成的代码
- **状态**：✅ 已完成

---

### [T-13] characterService 性别/年龄识别功能
- **目的**：在 characterService 中新增性别/年龄识别和 description 更新功能
- **方案引用**：Architecture.md v1.2 → characterService 模块 / 人物一致性技术方案
- **修改文件**：
  - `services/characterService.ts`：新增 `detectGenderAge()` 和 `updateCharacterDescription()` 函数
  - `services/characterService.ts`：修改 `generateAvatar()` 增加性别/年龄可选参数
  - `services/characterService.ts`：修改 `createCharacter()` 增加性别/年龄识别步骤
  - `types.ts`：Character 接口新增 `gender`, `ageGroup`, `specificAge` 字段
- **实现要求**：
  1. 新增 `detectGenderAge(photoDataUri): Promise<{gender: string, ageGroup: string}>`
     - 调用 TEXT_MODEL 分析照片
     - 返回格式：`{ gender: '男'|'女'|'未知', ageGroup: '婴儿(0-1岁)'|'幼儿(1-3岁)'|... }`
  2. 修改 `generateAvatar()` 签名：增加 `gender?`, `ageGroup?`, `specificAge?` 可选参数
     - 如果传入了这些参数，在生成头像时融入 prompt
     - prompt 示例："性别：${gender}，年龄段：${ageGroup}，具体年龄：${specificAge}（如有）"
  3. 新增 `updateCharacterDescription(character, gender, ageGroup, specificAge?): string`
     - 根据用户确认的性别/年龄更新 character.description
     - 格式："${gender}，${ageGroup}（具体${specificAge}），${原description}"
     - 必须包含明确年龄信息
  4. 修改 `createCharacter()` 流程：
     - 分析 → 生成头像 → 识别性别/年龄 → 生成参考表 → 返回 Character（包含 gender, ageGroup 字段）
  5. 头像比例固定为 1:1（`aspectRatio: "1:1"`）
- **约束**：
  - 必须遵守 C16（性别/年龄识别在生成头像后立即执行）、C17（头像1:1方形）、C19（description 格式）
- **验收标准**：
  - [ ] `detectGenderAge()` 函数正常工作，返回正确的 JSON 格式
  - [ ] `generateAvatar()` 接收性别/年龄参数，生成时融入 prompt
  - [ ] `updateCharacterDescription()` 正确更新 description 格式
  - [ ] `createCharacter()` 流程增加性别/年龄识别步骤（1-3秒）
  - [ ] Character 类型包含 gender, ageGroup, specificAge 字段
  - [ ] 无 TypeScript 错误
- **依赖**：基于 [T-05] 已完成的代码
- **状态**：✅ 已完成

---

### [T-14] CharacterLibrary 详情页 UI 实现
- **目的**：在人物库组件中新增详情页视图，显示大图和性别/年龄字段
- **方案引用**：Architecture.md v1.2 → 角色创建数据流 / Product-Spec.md v1.2 → UI 布局
- **修改文件**：
  - `components/CharacterLibrary.tsx`：新增 `detail` 视图
- **实现要求**：
  1. 新增视图状态：`view: 'list' | 'create' | 'detail'`
  2. 小卡片增加点击事件，点击进入详情页
  3. 小卡片增加性别/年龄显示（文字标签）
  4. 详情页布局：
     - 返回按钮（左上角）
     - 大图预览（方形，右上角有刷新按钮，悬停显示，样式同 DisplayPanel）
     - 性别下拉框：男 / 女 / 未知（默认值为 character.gender）
     - 年龄段下拉框：婴儿(0-1岁) / 幼儿(1-3岁) / 儿童(3-6岁) / 少儿(6-12岁) / 成人 / 未知
     - 具体年龄文本框（可选）
     - 保存按钮（底部）
     - 删除按钮（底部，次要样式）
  5. 字段交互：
     - 用户可修改性别/年龄段/具体年龄
     - 修改后点击保存，调用 `characterService.updateCharacterDescription()` 更新 description
     - 更新后保存到 LocalStorage
- **约束**：
  - 刷新按钮样式与 DisplayPanel 一致（白底黑边，悬停显示）
  - 必须遵守 C18（保存时更新 description）
- **验收标准**：
  - [ ] 点击小卡片进入详情页
  - [ ] 小卡片显示性别/年龄标识
  - [ ] 详情页显示大图 + 性别/年龄字段
  - [ ] 字段默认值为 character 的 gender, ageGroup, specificAge
  - [ ] 保存按钮调用 `updateCharacterDescription()` 并更新 LocalStorage
  - [ ] UI 交互流畅，无 TypeScript 错误
- **依赖**：基于 [T-08] 已完成的代码，依赖 [T-13]
- **状态**：✅ 已完成

---

### [T-15] 头像重新生成功能（融合性别/年龄）
- **目的**：实现详情页中的头像重新生成功能，传入用户修改的性别/年龄参数
- **方案引用**：Architecture.md v1.2 → characterService 模块 / 人物一致性技术方案
- **修改文件**：
  - `components/CharacterLibrary.tsx`：在详情页增加重新生成逻辑
- **实现要求**：
  1. 详情页大图右上角增加刷新按钮（RefreshCw 图标）
  2. 点击刷新按钮触发重新生成：
     - 读取当前详情页的 gender, ageGroup, specificAge 字段值
     - 调用 `characterService.generateAvatar(name, photo, description, gender, ageGroup, specificAge)`
     - 传入原始照片 + 当前用户修改的性别/年龄参数
  3. 生成中状态显示加载动画
  4. 生成完成后更新 character.avatarUrl
  5. 错误处理：生成失败时显示错误提示
- **约束**：
  - 重新生成必须传入性别/年龄参数（如果用户修改了）
  - 刷新按钮样式与 DisplayPanel 一致
- **验收标准**：
  - [ ] 刷新按钮正常显示（悬停显示）
  - [ ] 点击刷新按钮触发重新生成
  - [ ] 重新生成时传入用户修改的性别/年龄参数
  - [ ] 生成完成后更新头像
  - [ ] 错误处理正常
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 [T-13], [T-14]
- **状态**：✅ 已完成

---

### [T-16] 后端项目基础设施搭建

- **目的**：搭建 Node.js/Express + TypeScript 后端项目骨架，为所有后端模块提供运行基础
- **方案引用**：Architecture.md v1.3 → 模块总览 / db 模块 / imageStorage 模块
- **新建文件**：
  - `server/index.ts`：Express 入口（端口 3001，CORS，JSON 解析）
  - `server/tsconfig.json`：后端 TypeScript 配置
  - `server/db/index.ts`：SQLite 连接（singleton，WAL 模式）
  - `server/db/schema.ts`：建表语句（characters, stories, scenes）
  - `server/services/imageStorage.ts`：图片文件管理（保存/读取/删除）
  - `.env`：服务端环境变量（`GEMINI_API_KEY`, `PORT=3001`）
  - `.gitignore`：追加 `data/` 目录
- **安装依赖**：express, better-sqlite3, cors, dotenv, uuid, concurrently + @types/*
- **实现要求**：
  1. SQLite 使用 WAL 模式，singleton 连接
  2. 所有表包含 `user_id TEXT` 字段（当前为 NULL）
  3. `ensureDirectories()` 在服务启动时自动创建 `data/images/avatars/` 和 `data/images/scenes/`
  4. 图片文件名使用 UUID（`crypto.randomUUID()`）
- **约束**：
  - 必须遵守 C21（图片存储路径）、C22（user_id 字段）、C25（UUID 文件名）
- **验收标准**：
  - [ ] `server/index.ts` 能独立启动并监听 3001 端口
  - [ ] SQLite 数据库文件 `data/manga.db` 自动创建
  - [ ] `data/images/avatars/` 和 `data/images/scenes/` 目录自动创建
  - [ ] imageStorage 能保存 base64 图片到磁盘并返回相对路径
  - [ ] 无 TypeScript 编译错误
- **依赖**：无
- **状态**：✅ 已完成

---

### [T-17] 后端 AI 基础设施（gemini + styleConfig）

- **目的**：将 Gemini API 客户端和风格配置迁移到后端，建立后端 AI 调用基础
- **方案引用**：Architecture.md v1.3 → gemini 模块 / styleConfig 模块
- **新建文件**：
  - `server/services/gemini.ts`：API 客户端、重试、安全设置、模型常量
  - `server/services/styleConfig.ts`：4 组风格提示词（从前端 styleConfig.ts 迁移）
- **实现要求**：
  1. `getAiClient()` 读取 `process.env.GEMINI_API_KEY`（非 VITE_ 前缀）
  2. `withRetry()` 指数退避，默认 3 次重试，4xx 不重试（429 除外）
  3. 导出 `TEXT_MODEL`, `IMAGE_MODEL`, `SAFETY_SETTINGS` 常量
  4. styleConfig 逻辑不变，仅迁移到后端路径
- **约束**：
  - 必须遵守 C01（服务端 .env）、C04（模型常量集中管理）
- **验收标准**：
  - [ ] `gemini.ts` 导出 getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL, IMAGE_MODEL
  - [ ] API Key 从 `process.env.GEMINI_API_KEY` 读取
  - [ ] `styleConfig.ts` 导出 getStylePrompt, getStyleDescription
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-16]
- **状态**：✅ 已完成

---

### [T-18] 后端输入处理服务（inputAnalyzer）

- **目的**：实现后端的语音转文字和图片分析服务
- **方案引用**：Architecture.md v1.3 → inputService 模块（后端 inputAnalyzer）
- **新建文件**：
  - `server/services/inputAnalyzer.ts`：transcribeAudio, analyzeImages
- **实现要求**：
  1. 从前端 `inputService.ts` 迁移完整 AI 逻辑
  2. 图片分析并行处理（Promise.all），单张失败不中断
  3. 图片压缩逻辑移到后端（maxWidth=800, quality=0.6）
  4. 使用 `gemini.ts` 的 withRetry 和模型常量
- **约束**：
  - 必须遵守 C03（withRetry 包装）、C04（模型常量）、C11（JSON 验证）、C12（图片压缩）
- **验收标准**：
  - [ ] `inputAnalyzer.ts` 导出 transcribeAudio, analyzeImages
  - [ ] 图片分析使用 TEXT_MODEL
  - [ ] 单张图片分析失败不中断整体流程
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-17]
- **状态**：✅ 已完成

---

### [T-19] 后端故事管线（storyPipeline）

- **目的**：将 4 步故事管线迁移到后端
- **方案引用**：Architecture.md v1.3 → storyService 模块（后端 storyPipeline）
- **新建文件**：
  - `server/services/storyPipeline.ts`：4 步管线（大纲→审核→脚本→一致性）
- **实现要求**：
  1. 从前端 `storyService.ts` 迁移完整 4 步管线逻辑
  2. 使用后端 `gemini.ts` 和 `styleConfig.ts`
  3. 保持 4 步顺序执行，审核不重试，issues 传递给下游
  4. 所有步骤使用 `responseMimeType: "application/json"`
- **约束**：
  - 必须遵守 C09（4 步顺序）、C10（审核不重试）、C11（JSON 验证）、C04（模型常量）
- **验收标准**：
  - [ ] `storyPipeline.ts` 导出 generateStory
  - [ ] 4 步管线按顺序执行
  - [ ] 审核不通过时降级继续，issues 传递给 Step 3
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-17]
- **状态**：✅ 已完成

---

### [T-20] 后端角色分析服务 + 图片生成服务（characterAnalyzer + imageGenerator）

- **目的**：实现后端角色分析和图片生成服务
- **方案引用**：Architecture.md v1.3 → characterService 模块（后端 characterAnalyzer）/ imageService 模块（后端 imageGenerator）
- **新建文件**：
  - `server/services/characterAnalyzer.ts`：角色分析、头像生成、性别/年龄识别
  - `server/services/imageGenerator.ts`：分镜图片生成
- **实现要求**：
  1. characterAnalyzer：从前端 `characterService.ts` 迁移 AI 逻辑
     - `analyzeCharacter()`, `generateAvatar()`, `detectGenderAge()`, `createCharacterFull()`
     - 头像保存到 `data/images/avatars/`（通过 imageStorage）
  2. imageGenerator：从前端 `imageService.ts` 迁移 AI 逻辑
     - `generateSceneImage()`：生成图片 → 保存到 `data/images/scenes/`
     - 从 DB 查找角色头像文件（通过 referenceCharIds）
     - 降级机制：有参考图失败 → 纯文字重试
  3. 提示词结构按 6 层优先级
- **约束**：
  - 必须遵守 C05（分镜1K/头像2K）、C06（照片+文字）、C07（风格从 styleConfig 获取）、C14（降级机制）、C16（性别/年龄识别）、C17（头像1:1）
- **验收标准**：
  - [ ] characterAnalyzer 导出 analyzeCharacter, generateAvatar, detectGenderAge, createCharacterFull
  - [ ] imageGenerator 导出 generateSceneImage
  - [ ] 头像保存到 data/images/avatars/，分镜图保存到 data/images/scenes/
  - [ ] 图片生成降级机制正常工作
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-16]（imageStorage + db）, [T-17]（gemini + styleConfig）
- **状态**：✅ 已完成

---

### [T-21] 后端 REST 路由

- **目的**：实现所有后端 API 端点，将服务模块暴露为 HTTP 接口
- **方案引用**：Architecture.md v1.3 → 模块总览（routes/）/ Product-Spec.md v1.3 → API 端点表
- **新建文件**：
  - `server/routes/ai.ts`：7 个 AI 代理端点（analyze-images, generate-story, generate-image, transcribe-audio, analyze-character, generate-avatar, detect-gender-age）
  - `server/routes/characters.ts`：人物库 CRUD（GET/POST/PUT/DELETE /api/characters）
  - `server/routes/stories.ts`：漫画历史 CRUD（GET/POST/DELETE /api/stories）
  - `server/routes/images.ts`：图片静态服务（GET /api/images/:type/:filename）
- **实现要求**：
  1. 所有响应使用标准格式 `{ success: boolean, data?: any, error?: string }`
  2. AI 路由调用对应的后端 service 模块
  3. characters 路由：创建时调用 characterAnalyzer.createCharacterFull()
  4. stories 路由：保存时将 scenes 写入 scenes 表（级联关联）
  5. images 路由：从 `data/images/` 静态服务图片文件
  6. 所有路由注册到 `server/index.ts`
- **约束**：
  - 必须遵守 C24（标准 JSON 响应格式）
- **验收标准**：
  - [ ] 7 个 AI 代理端点可通过 curl/Postman 测试
  - [ ] 人物库 CRUD 完整可用
  - [ ] 漫画历史 CRUD 完整可用
  - [ ] 图片静态服务可访问 `/api/images/avatars/xxx.png`
  - [ ] 所有响应符合标准格式
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-16]（db + imageStorage）, [T-18], [T-19], [T-20]
- **状态**：✅ 已完成

---

### [T-22] 前端 apiClient + 服务瘦化 + Vite proxy

- **目的**：创建前端 API 客户端，将所有前端 services 瘦化为 HTTP 调用封装，配置 Vite 开发代理
- **方案引用**：Architecture.md v1.3 → apiClient 模块 / 各前端服务模块
- **新建文件**：
  - `comic-growth-record/services/apiClient.ts`：后端 API 调用封装
- **修改文件**：
  - `comic-growth-record/services/storyService.ts`：瘦化为调用 apiClient
  - `comic-growth-record/services/imageService.ts`：瘦化为调用 apiClient
  - `comic-growth-record/services/characterService.ts`：瘦化为调用 apiClient（保留纯前端函数）
  - `comic-growth-record/services/inputService.ts`：瘦化为调用 apiClient
  - `comic-growth-record/vite.config.ts`：添加 `/api` proxy 到 localhost:3001
  - `comic-growth-record/package.json`：添加 concurrently 启动脚本
- **删除文件**：
  - `comic-growth-record/services/aiClient.ts`：前端不再需要 Gemini 客户端
  - `comic-growth-record/utils/storageUtils.ts`：数据改存后端 SQLite
- **实现要求**：
  1. apiClient 封装：fetchApi（基础 fetch）、postAi（AI 端点）、CRUD 方法
  2. 5xx 错误简单重试 1 次
  3. 前端 services 只保留 HTTP 调用 + 纯计算函数（如 updateCharacterDescription, getCharacterReferences）
  4. Vite proxy 配置：`/api` → `http://localhost:3001`
  5. `npm run dev` 使用 concurrently 同时启动前端和后端
  6. 更新 App.tsx 中所有对 services 的调用方式（如有变化）
- **约束**：
  - 必须遵守 C02（组件通过 services 层）、C20（前端不存储 API Key）、C23（用 URL 不用 base64）、C26（前端 services 不 import @google/genai）
- **验收标准**：
  - [ ] apiClient.ts 导出 fetchApi, postAi, getCharacters, createCharacter 等
  - [ ] 所有前端 services 不再 import @google/genai
  - [ ] aiClient.ts 和 storageUtils.ts 已删除
  - [ ] Vite proxy 正常转发 `/api/*` 请求
  - [ ] `npm run dev` 同时启动前后端
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-21]（后端路由就绪后才能对接）
- **状态**：✅ 已完成

---

### [T-23] 集成验证 + 清理 + 文档同步

- **目的**：端到端验证完整流程，清理废弃代码，同步约束文档和架构图
- **方案引用**：Architecture.md v1.3 → 约束清单 C15
- **修改文件**：
  - `.claude/rules/dev-constraints.md`：同步 Architecture.md v1.3 约束 C01-C26
  - `architecture-diagram.html`：更新为前后端分离架构图
- **实现要求**：
  1. 端到端测试：
     - 创建角色（上传照片 → 生成头像 → 识别性别/年龄 → 保存到 SQLite）
     - 生成漫画（文字输入 → 4 步管线 → 图片生成 → 保存到磁盘）
     - 查看历史（从 SQLite 读取 → 前端展示图片 URL）
     - 人物库管理（CRUD 全流程）
  2. 清理废弃代码：
     - 确认无残留的前端直接 AI 调用
     - 确认无残留的 localStorage 引用
     - 确认无残留的 VITE_GEMINI_API_KEY 引用
  3. dev-constraints.md 同步 Architecture.md C01-C26
  4. architecture-diagram.html 更新为 3 层架构（前端 + 后端 + 数据层）
- **验收标准**：
  - [ ] 完整流程可正常运行（创建角色 → 生成漫画 → 查看历史）
  - [ ] 无前端直接 AI 调用代码残留
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致
  - [ ] architecture-diagram.html 反映 v1.3 架构
  - [ ] `npm run dev` 正常启动，无错误
- **依赖**：依赖 [T-22]
- **状态**：✅ 已完成

---

### [T-24] DB 迁移 + 后端标题生成 + PUT 路由

- **目的**：扩展 stories 表字段，实现后端标题生成功能和故事更新 API
- **方案引用**：Architecture.md v1.4 → db 模块 / storyPipeline 模块 / 故事标题生成技术方案
- **修改文件**：
  - `server/db/schema.ts`：stories 表新增 `title TEXT` 和 `updated_at INTEGER` 列（ALTER TABLE 迁移）
  - `server/services/storyPipeline.ts`：新增 `generateTitle(text, imageAnalysis?)` 函数
  - `server/routes/ai.ts`：新增 `POST /api/ai/generate-title` 端点
  - `server/routes/stories.ts`：新增 `PUT /api/stories/:id` 端点（更新标题、分镜等）
- **实现要求**：
  1. DB 迁移：检测 stories 表是否有 title 列，没有则 ALTER TABLE 添加
  2. `generateTitle(text, imageAnalysis?)`:
     - 调用 TEXT_MODEL，提示词要求生成 5-15 字温馨标题
     - 使用 `responseMimeType: "text/plain"`（纯文本）
     - 失败时返回 input_summary 前 15 字 + "..."
  3. PUT /api/stories/:id：
     - 接收 partial update（title、scenes 等）
     - 更新 `updated_at = Date.now()`
     - scenes 更新时：删除旧 scenes → 插入新 scenes（事务）
  4. GET /api/stories 返回数据增加 title 和第一张分镜的 image_path（作为缩略图）
- **约束**：
  - 必须遵守 C03（withRetry）、C04（模型常量）、C24（标准 JSON 响应）、C31（标题失败降级）
- **验收标准**：
  - [ ] stories 表包含 title 和 updated_at 列（新建和迁移都支持）
  - [ ] `generateTitle()` 返回 5-15 字标题
  - [ ] `generateTitle()` 失败时降级为 input_summary 前 15 字
  - [ ] `POST /api/ai/generate-title` 端点可用
  - [ ] `PUT /api/stories/:id` 端点可用，支持 partial update
  - [ ] `GET /api/stories` 返回 title 和 thumbnailUrl
  - [ ] 无 TypeScript 编译错误
- **依赖**：基于 T-23 已完成的后端
- **状态**：✅ 已完成

---

### [T-25] 前端自动保存与同步

- **目的**：生成完成后自动保存故事，修改后自动同步到后端
- **方案引用**：Architecture.md v1.4 → 自动保存与同步技术方案 / 主流程数据流 / 修改同步数据流
- **修改文件**：
  - `comic-growth-record/services/apiClient.ts`：新增 `updateStory(id, data)` 函数
  - `comic-growth-record/services/storyService.ts`：新增 `generateTitle(text, imageAnalysis?)` 薄封装
  - `comic-growth-record/App.tsx`：新增自动保存逻辑、currentStoryId 状态、debounce 同步
  - `comic-growth-record/types.ts`：新增 `StorySummary` 类型，更新 `StoryOutput` 增加 `title`
- **实现要求**：
  1. apiClient 新增：
     - `updateStory(id: string, data: UpdateStoryRequest): Promise<Story>`
     - `generateTitle(text: string, imageAnalysis?: ImageAnalysis[]): Promise<string>`（调用 `postAi('generate-title', ...)`）
  2. App.tsx 新增状态：
     - `currentStoryId: string | null`（null = 新创作，有值 = 已保存/加载历史）
     - `saveStatus: 'idle' | 'saving' | 'saved'`
     - `storyTitle: string`（显示和编辑用）
  3. handleGenerate 流程末尾新增：
     - 调用 `storyService.generateTitle()` 获取标题
     - 调用 `apiClient.saveStory()` 保存故事（含标题、scenes、style 等）
     - 设置 `currentStoryId` = 返回的 storyId
  4. 修改同步逻辑：
     - 编辑脚本 / 重绘图片 / 修改标题后触发 debounce
     - debounce 1 秒后调用 `apiClient.updateStory(currentStoryId, { 变更字段 })`
     - debounce 使用 `useRef` + `setTimeout` + `clearTimeout`
  5. 保存状态指示：修改触发 → `saving` → PUT 成功 → `saved`
- **约束**：
  - 必须遵守 C27（自动保存）、C28（debounce 同步）、C31（标题失败降级）
- **验收标准**：
  - [ ] 生成完成后自动调用 saveStory，currentStoryId 有值
  - [ ] 标题自动生成并显示
  - [ ] 编辑脚本后 1 秒自动同步到后端
  - [ ] 重绘图片后自动同步
  - [ ] 标题修改后自动同步
  - [ ] 保存状态指示正常（saving → saved）
  - [ ] 标题生成失败时降级处理
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 [T-24]（后端 API 就绪）
- **状态**：✅ 已完成

---

### [T-26] 网格海报导出

- **目的**：实现前端 Canvas 网格海报生成和导出功能
- **方案引用**：Architecture.md v1.4 → posterGenerator 模块 / 网格海报导出技术方案
- **新建文件**：
  - `comic-growth-record/utils/posterGenerator.ts`：Canvas 海报生成
- **修改文件**：
  - `comic-growth-record/components/DisplayPanel.tsx`：导出按钮改为下拉（海报 + ZIP）
- **实现要求**：
  1. posterGenerator 实现：
     - `generatePoster(options: PosterOptions): Promise<Blob>`
     - 创建离屏 Canvas，计算尺寸（基于分镜数量）
     - 绘制白色背景 → 标题区 → 分镜网格 → 水印区
     - 分镜排版：固定 2 列，奇数末行居中
     - 图片加载：`fetch(imageUrl)` → `createImageBitmap(blob)`
     - 脚本文字：截断 30 字 + 省略号
     - 水印固定 "MangaGrow"
     - `canvas.toBlob('image/png')` 返回 Blob
  2. DisplayPanel 导出 UI：
     - 「导出」按钮改为下拉按钮
     - 选项 1：「导出海报」→ 调用 posterGenerator → `saveAs(blob, '{title}_poster.png')`
     - 选项 2：「导出 ZIP」→ 保持现有 ZIP 导出逻辑
     - 导出时显示 loading 状态
  3. 海报尺寸计算：
     - 标题区：120px
     - 每个分镜格：图片（保持原始比例）+ 脚本文字区（60px）
     - 分镜间距：20px
     - 水印区：60px
     - 两侧边距：40px
- **约束**：
  - 必须遵守 C29（原生 Canvas，不引入 html2canvas）、C30（2 列 + 居中 + MangaGrow 水印）
- **验收标准**：
  - [ ] posterGenerator 正确生成 2 列网格海报
  - [ ] 奇数分镜末行居中
  - [ ] 海报包含标题 + 日期 + 分镜 + 脚本文字 + MangaGrow 水印
  - [ ] 2-8 张分镜均排版正确
  - [ ] 导出按钮为下拉形式（海报 / ZIP）
  - [ ] 导出的 PNG 图片清晰度与原始分镜一致
  - [ ] 文件名格式：`{title}_poster.png`
  - [ ] 无 TypeScript 错误
- **依赖**：无强依赖（需要 T-25 提供 storyTitle，但可先用 mock 标题开发）
- **状态**：✅ 已完成

---

### [T-27] 历史记录侧边栏

- **目的**：实现历史记录浏览组件，支持加载历史故事到右侧面板
- **方案引用**：Architecture.md v1.4 → HistoryPanel 组件 / 历史记录浏览数据流
- **新建文件**：
  - `comic-growth-record/components/HistoryPanel.tsx`：历史记录侧边栏组件
- **修改文件**：
  - `comic-growth-record/App.tsx`：集成 HistoryPanel，新增 loadStory 逻辑
- **实现要求**：
  1. HistoryPanel 组件：
     - 交互方式与 CharacterLibrary 完全一致（折叠侧边栏、关闭按钮 X、覆盖在输入区上方）
     - `isOpen` 变为 true 时调用 `apiClient.getStories()` 获取列表
     - 按 createdAt 倒序排列
     - 每条卡片：标题 + 日期 + 缩略图 + 分镜数
     - 点击卡片 → 调用 `onSelectStory(storyId)`
     - `currentStoryId` 对应的卡片高亮
     - 删除操作：确认弹窗 → `apiClient.deleteStory(id)` → 刷新列表
     - 空状态：「还没有创作记录，开始你的第一个故事吧！」
  2. App.tsx 集成：
     - 新增 `isHistoryOpen` 状态
     - `loadStory(storyId)` 函数：
       - 调用 `apiClient.getStory(storyId)` 获取详情
       - 设置 scenes（imageUrl = `/api/images/scenes/xxx.png`）
       - 设置 storyTitle = story.title
       - 设置 currentStoryId = storyId
       - 关闭 HistoryPanel
     - 历史面板和人物库面板互斥（同时只能打开一个）
- **约束**：
  - 必须遵守 C32（交互与 CharacterLibrary 一致）、C33（展示结构与生成结果一致）
- **验收标准**：
  - [ ] 侧边栏交互与 CharacterLibrary 一致（动画、关闭按钮、覆盖位置）
  - [ ] 历史列表按时间倒序显示
  - [ ] 每条记录显示标题 + 日期 + 缩略图 + 分镜数
  - [ ] 点击记录在右侧面板加载故事（分镜展示结构一致）
  - [ ] 当前查看的记录高亮
  - [ ] 删除功能正常（确认弹窗 + 刷新列表）
  - [ ] 空状态正确显示
  - [ ] 历史面板和人物库面板互斥
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 [T-25]（currentStoryId 和 saveStory 逻辑）
- **状态**：✅ 已完成

---

### [T-28] 导航栏 + DisplayPanel UI 更新

- **目的**：导航栏新增历史图标，DisplayPanel 新增顶部信息栏（标题 + 时间 + 保存状态）
- **方案引用**：Architecture.md v1.4 → Product-Spec.md v1.4 → UI 布局
- **修改文件**：
  - `comic-growth-record/App.tsx`：导航栏新增历史记录图标按钮
  - `comic-growth-record/components/DisplayPanel.tsx`：新增顶部信息栏
  - `comic-growth-record/components/InputPanel.tsx`：标题改为可编辑（生成后 AI 标题替换）
- **实现要求**：
  1. 导航栏（App.tsx 左侧 64px 栏）：
     - 中部图标新增「历史记录」（Clock 或 History 图标，lucide-react）
     - 图标顺序：人物库 → 历史记录 → 新创作
     - 点击历史记录图标 → 设置 `isHistoryOpen = true`
  2. DisplayPanel 顶部信息栏：
     - 生成完成后显示（scenes.length > 0 时）
     - 左侧：故事标题（可点击编辑，编辑后触发 debounce 同步）
     - 中间：创建日期（格式化显示）
     - 右侧：保存状态指示（「已保存」/ 「保存中...」）
  3. InputPanel 标题区：
     - 默认显示「新的回忆」
     - 生成完成后或加载历史后，由 App.tsx 传入 storyTitle
     - 标题可点击编辑
- **约束**：
  - 历史图标样式与其他导航图标一致
  - 信息栏不占用分镜展示空间（在网格上方，固定高度）
- **验收标准**：
  - [ ] 导航栏新增历史记录图标，样式一致
  - [ ] 点击历史图标打开 HistoryPanel
  - [ ] DisplayPanel 顶部显示标题 + 日期 + 保存状态
  - [ ] 标题可点击编辑
  - [ ] 保存状态指示正确（saving / saved）
  - [ ] InputPanel 标题随 storyTitle 状态变化
  - [ ] 无 TypeScript 错误
- **依赖**：无强依赖（与 T-25, T-27 协作，但 UI 可先搭建）
- **状态**：✅ 已完成

---

### [T-29] 集成验证 + 文档同步

- **目的**：端到端验证 v1.4 所有新功能，同步约束文档和架构图
- **方案引用**：Architecture.md v1.4 → 约束清单 C15 / C27-C33
- **修改文件**：
  - `.claude/rules/dev-constraints.md`：同步 Architecture.md v1.4 约束 C27-C33
  - `architecture-diagram.html`：更新架构图（新增 posterGenerator、HistoryPanel、标题生成流程、自动保存流程）
- **实现要求**：
  1. 端到端测试：
     - 生成漫画 → 标题自动生成 → 自动保存 → 验证数据库
     - 编辑脚本 → 自动同步 → 验证数据库 updated_at 更新
     - 修改标题 → 自动同步 → 验证数据库 title 更新
     - 重绘图片 → 自动同步 → 验证数据库 scenes 更新
     - 导出海报 → 验证 PNG（2 列网格、标题、水印）
     - 导出 ZIP → 验证内容（图片 + 脚本文本）
     - 打开历史侧边栏 → 查看列表 → 点击加载 → 右侧面板呈现
     - 删除历史记录 → 确认列表更新
     - 新建创作 → currentStoryId 重置 → 标题恢复「新的回忆」
  2. dev-constraints.md 新增 C27-C33
  3. architecture-diagram.html 更新
  4. 修复截图中的已知 bug：`Cannot read properties of undefined (reading 'length')`
- **验收标准**：
  - [ ] 所有端到端测试通过
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致（C01-C33）
  - [ ] architecture-diagram.html 反映 v1.4 架构
  - [ ] 已知 bug 修复
  - [ ] `npm run dev` 正常启动，无错误
  - [ ] TypeScript 编译无错误
- **依赖**：依赖 [T-24], [T-25], [T-26], [T-27], [T-28]
- **状态**：✅ 已完成

---

### [T-30] storyPipeline v1.6 优化（标题提前 + 人物规则松绑 + 标题格式收紧）
- **目的**：将 generateTitle 移入管线与 Step 4 并行执行；调整人物规则为两档（提及→强制，未提及→仅参考）；收紧标题格式为 4-10字名词短语
- **方案引用**：Architecture.md → storyPipeline 技术方案（v1.6）, 约束 C37
- **修改文件**：
  - `server/services/storyPipeline.ts`：generateTitle 内移、与 Step 4 Promise.all、人物规则两档、标题 prompt 格式
  - `server/types.ts`：StoryOutput 新增 `title: string` 字段
- **实现要求**：
  1. `generateTitle` 函数改为模块内部函数（不再 export），由 `generateStory` 内部调用
  2. `generateStory` 末尾：`const [{ scripts: finalScripts }, titleResult] = await Promise.all([checkConsistency(...), generateTitle_internal(...)])` 替换原先的串行 checkConsistency
  3. `generateStory` 返回值增加 `title: titleResult`
  4. 标题 prompt 更新为：4-10字名词短语、优先 `{人名}+{核心事件}` 格式、禁止形容词堆叠开头、禁止情绪词汇开头；降级策略：`input_summary` 前 10 字（C31）
  5. `generateOutline` 的人物规则改为两档：
     - 第一档：名字出现在 `input.text` 中 → `[人物强制规则]：以下角色必须出现在故事中 + 必须用精确名字`
     - 第二档：名字未出现在 `input.text` 中 → `[人物参考]：以下角色为视觉参考，可根据故事需要决定是否出现`
  6. `detailScripts` 同步修改人物规则（与 generateOutline 保持一致）
- **约束**：
  - 必须遵守 C37（标题与 Step4 并行，随 StoryOutput 返回）
  - 必须遵守 C31（标题失败降级，不阻塞主流程）
- **验收标准**：
  - [ ] `generateStory` 返回的 `StoryOutput` 包含 `title` 字段（非空）
  - [ ] 标题生成与 Step 4 并行执行（Promise.all），不串行
  - [ ] 人物库中有人物且被用户文本提及时：故事中该人物出现
  - [ ] 人物库中有人物但用户文本未提及时：不强制人物出现，只作视觉参考
  - [ ] 标题长度 4-10 字（降级时允许更长，最多 15 字）
  - [ ] `generateTitle` 不再 export（成为内部函数）
  - [ ] TypeScript 编译无错误
- **依赖**：无
- **状态**：✅ 已完成

---

### [T-31] App.tsx v1.6 优化（标题提前 + 锚定帧策略）
- **目的**：在收到 storyResult 后立即设置标题（早于图片生成）；将图片串行生成的链式传递改为锚定帧策略（Scene 2+ 统一参考 Scene 1）
- **方案引用**：Architecture.md → 主数据流（v1.6）, 锚定帧策略, 约束 C37, C38
- **修改文件**：
  - `comic-growth-record/App.tsx`：标题提前 setStoryTitle，移除单独 generateTitle 调用，锚定帧实现
  - `comic-growth-record/types.ts`：StoryOutput 新增 `title?: string` 字段
- **实现要求**：
  1. `handleGenerate` 中，在 `generateStory()` 返回后立即执行 `setStoryTitle(storyResult.title || '')` —— 在所有图片生成开始之前
  2. 移除现有的 `const title = await generateTitle(inputText, imageAnalysis)` 调用（该函数现已不再 export）
  3. 移除 `import { generateTitle } from './services/storyService'` 的 generateTitle import（如果其他地方没有用到）
  4. 锚定帧策略（无用户照片路径）：
     - `anchorFrameUrl` 变量，初始为 `null`
     - Scene 1（i === 0）：`continuityRef = []`（不传任何参考图）
     - Scene 1 生成完成后：`if (result) anchorFrameUrl = result`
     - Scene 2+（i > 0）：`continuityRef = anchorFrameUrl ? [anchorFrameUrl] : []`（统一引用 Scene 1，不引用前一帧）
  5. 有用户照片时（`hasUserPhotos` 路径）：保持原有 `inputImages[i]` 对应逻辑，不改变
  6. 自动保存逻辑中对 title 的赋值更新为从 `storyResult.title` 读取（已在 Step 1 中 setStoryTitle，此处用局部变量 `title = storyResult.title || ''`）
- **约束**：
  - 必须遵守 C37（前端收到 StoryOutput 后立即 setStoryTitle，早于图片）
  - 必须遵守 C38（Scene 2+ 参考 Scene 1 基准帧，不参考前一帧）
- **验收标准**：
  - [ ] 用户点击生成后，故事脚本加载完成时即显示标题（不等待图片）
  - [ ] Scene 2+ 的 `continuityRef` 均引用 Scene 1 的 imageUrl（非上一帧）
  - [ ] 有用户照片时：继续使用 `inputImages[i]` 逻辑，不使用锚定帧
  - [ ] `generateTitle` 不再被 App.tsx 调用
  - [ ] TypeScript 编译无错误
- **依赖**：依赖 [T-30]（storyResult.title 字段）
- **状态**：✅ 已完成

---

### [T-32] imageGenerator 基准帧标签更新
- **目的**：将连续性参考图的文字标签从"上一个分镜画面"改为"基准帧"，语义与锚定帧策略对齐
- **方案引用**：Architecture.md → imageGenerator 锚定帧策略, 约束 C38
- **修改文件**：
  - `server/services/imageGenerator.ts`：修改 `sceneReferenceImages` 对应的 label 文本
- **实现要求**：
  1. 将 `parts.push({ text: \`[上一个分镜画面] ⚠️ 连续性要求：...\` })` 中的文本改为：
     `[基准帧] ⚠️ 一致性要求：必须与此基准帧保持人物的发型、服装、面部特征完全一致。只改变：动作、姿态、表情和场景背景。`
- **约束**：
  - 必须遵守 C38（一致性要求描述与锚定帧策略对齐）
- **验收标准**：
  - [ ] `imageGenerator.ts` 中非用户照片分支的 label 文本已更新为"基准帧"
  - [ ] TypeScript 编译无错误
- **依赖**：依赖 [T-30]（架构确认）
- **状态**：✅ 已完成

---

### [T-33] v1.6 集成验证
- **目的**：验证 v1.6 三项优化（标题提前 + 锚定帧 + 人物规则）端到端正确运行
- **方案引用**：Architecture.md → 约束 C37, C38, 标题质量标准
- **修改文件**：无（验证任务）
- **实现要求**：
  1. 代码审查：确认 storyPipeline `generateTitle` 不再 export，generateStory 返回 title
  2. 代码审查：确认 App.tsx 中 `setStoryTitle` 在图片生成循环之前被调用
  3. 代码审查：确认锚定帧赋值逻辑正确（`anchorFrameUrl = result` 在 i===0 之后）
  4. 代码审查：确认人物规则两档（按 input.text 中是否提及分档）
  5. TypeScript 编译检查：`npx tsc --noEmit`（前端），`tsc --noEmit`（后端）
  6. 更新 Tasks.md 概述行的任务数量
- **验收标准**：
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致（C01-C38）
  - [ ] architecture-diagram.html 反映 v1.6 架构（C15，已在上轮更新）
  - [ ] TypeScript 编译无错误（前后端）
  - [ ] 代码中无孤立的 `generateTitle` import
- **依赖**：依赖 [T-30], [T-31], [T-32]
- **状态**：✅ 已完成

---

### [T-34] 手动保存改造
- **目的**：将「生成后自动保存」改为「生成后显示保存按钮，用户点击才保存」，避免废片堆积
- **方案引用**：Architecture.md v1.7 → 手动保存确认技术方案 / 约束 C27 / C28
- **修改文件**：
  - `comic-growth-record/App.tsx`：移除生成完成后的自动 saveStory 调用；新增 `isSaved` / `saveStatus` 状态；「保存故事」点击处理函数；PUT debounce 增加 currentStoryId 判断
  - `comic-growth-record/components/DisplayPanel.tsx`：新增「保存故事」按钮（底部浮动操作栏），更新保存状态指示（「未保存」/「保存中...」/「✅ 已保存」）
- **实现要求**：
  1. App.tsx 中删除 `handleGenerate` 末尾的 `apiClient.saveStory(...)` 调用
  2. 新增 `saveStatus: 'unsaved' | 'saving' | 'saved'` 状态，生成完成时设为 `'unsaved'`
  3. 新增 `handleSaveStory()` 函数：调用 `apiClient.saveStory(...)` → 设置 `currentStoryId` → `saveStatus = 'saved'`
  4. PUT debounce 触发条件改为：`if (!currentStoryId) return;` 提前返回
  5. DisplayPanel 底部操作栏：`saveStatus === 'unsaved'` 时显示「保存故事」按钮；`saveStatus === 'saving'` 时禁用按钮显示「保存中...」；`saveStatus === 'saved'` 时按钮消失
  6. 顶部信息栏右侧：显示当前 `saveStatus` 对应的文字
  7. 「新建创作」时重置：`saveStatus = 'unsaved'`，`currentStoryId = null`
- **约束**：
  - 必须遵守 C27（不自动保存，显示按钮）、C28（仅 currentStoryId !== null 时触发 PUT）
- **验收标准**：
  - [ ] 生成完成后，底部出现「保存故事」按钮，顶部显示「未保存」
  - [ ] 点击「保存故事」：按钮变「保存中...」→ 成功后消失，顶部显示「✅ 已保存」
  - [ ] 已保存故事修改后，1 秒自动同步（PUT）；未保存故事修改后不触发 PUT
  - [ ] 新建创作后保存状态正确重置
  - [ ] 无 TypeScript 错误
- **依赖**：基于 T-29 已完成的代码
- **状态**：✅ 已完成

---

### [T-35] 后端年度总结生成
- **目的**：新增 AI 年度总结生成接口，供 PDF 生成调用
- **方案引用**：Architecture.md v1.7 → storyPipeline.generateYearlySummary / PDF 技术方案
- **修改文件**：
  - `server/services/storyPipeline.ts`：新增导出函数 `generateYearlySummary(stories: SummaryStoryItem[]): Promise<string>`
  - `server/routes/ai.ts`：新增 `POST /api/ai/generate-summary` 端点
  - `server/types.ts`：新增 `SummaryStoryItem` 类型
- **实现要求**：
  1. `SummaryStoryItem` 类型：`{ title: string; date: string; captions: string[] }`
  2. `generateYearlySummary(stories)` 实现：
     - 将 stories 格式化为：`${date} - ${title}: ${captions.join('；')}` 逐行列出
     - 调用 TEXT_MODEL，提示词要求 300-500 字温馨成长总结（串联故事，有情感流动）
     - 使用 `responseMimeType: "text/plain"`
     - 失败时 `throw error`（由路由层 catch，返回降级文字）
  3. `POST /api/ai/generate-summary` 路由：
     - 接收 `{ stories: SummaryStoryItem[] }`
     - 调用 `generateYearlySummary(stories)`
     - 成功：`{ success: true, data: { summary: string } }`
     - 失败：`{ success: false, error: '...' }`（前端收到后使用降级文字）
- **约束**：
  - 必须遵守 C03（withRetry）、C04（模型常量）、C24（标准 JSON 响应）、C40（失败降级）
- **验收标准**：
  - [ ] `generateYearlySummary()` 导出，返回 300-500 字中文总结
  - [ ] `POST /api/ai/generate-summary` 端点可正常访问
  - [ ] 传入空 stories 或 AI 失败时端点返回 `{ success: false, error }` 而非 500
  - [ ] 无 TypeScript 编译错误
- **依赖**：基于 T-23（后端基础设施）
- **状态**：✅ 已完成

---

### [T-36] 成长相册组件
- **目的**：新增成长相册主页面组件，时间轴展示已保存故事，导航栏新增入口
- **方案引用**：Architecture.md v1.7 → GrowthAlbum 组件 / 成长相册技术方案 / 成长相册浏览数据流
- **新建文件**：
  - `comic-growth-record/components/GrowthAlbum.tsx`：成长相册主页面
- **修改文件**：
  - `comic-growth-record/App.tsx`：新增 `isGrowthAlbumOpen` 状态、导航栏成长相册图标、GrowthAlbum 集成
- **实现要求**：
  1. GrowthAlbum 组件：
     - Props：`{ isOpen, onClose, onSelectStory, characters }`
     - `isOpen = true` 时替换主内容区（绝对定位覆盖，或条件渲染替换中间+右侧区域）
     - 挂载时调用 `apiClient.getStories()` 获取全量列表
     - Client-side 分组逻辑：
       ```typescript
       const grouped = new Map<number, StorySummary[]>(); // key = 年份
       stories.forEach(s => {
         const year = new Date(s.createdAt).getFullYear();
         if (!grouped.has(year)) grouped.set(year, []);
         grouped.get(year)!.push(s);
       });
       // 按年份倒序排列，每年内按 createdAt 倒序
       ```
     - 渲染：年份标题行（如「2026 年」） + 故事卡片列表（日期 + 封面图 + 标题）
     - 点击故事卡片 → `onSelectStory(story.id)` + `onClose()`
     - 空状态：「还没有保存的故事，去创作第一个吧！」
     - 右上角「生成 PDF 故事书」按钮（点击打开 PDF 配置面板，T-37 实现）
  2. App.tsx 集成：
     - 新增 `isGrowthAlbumOpen: boolean` 状态
     - 导航栏中部新增成长相册图标（BookOpen 或 Album，lucide-react），顺序：人物库 → 历史记录 → 成长相册 → 新创作
     - `isGrowthAlbumOpen = true` 时，`isHistoryOpen` 强制 false（互斥）
- **约束**：
  - 必须遵守 C41（与 HistoryPanel 互斥）
  - 成长相册页面整体交互风格与已有侧边栏保持一致（图标、关闭方式）
- **验收标准**：
  - [ ] 导航栏新增成长相册图标，点击打开相册页面
  - [ ] 时间轴按年份分组，故事卡片显示日期 + 封面图 + 标题
  - [ ] 点击故事卡片关闭相册，在主界面加载该故事
  - [ ] 成长相册和历史侧边栏互斥（打开一个时另一个关闭）
  - [ ] 空状态正确显示
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 T-34（保存逻辑就绪，确保相册中有数据）
- **状态**：✅ 已完成

---

### [T-37] PDF 成长故事书生成
- **目的**：在成长相册中新增 PDF 日期范围配置面板和 PDF 生成功能
- **方案引用**：Architecture.md v1.7 → pdfGenerator 模块 / PDF 技术方案 / PDF 生成数据流
- **新建文件**：
  - `comic-growth-record/utils/pdfGenerator.ts`：Canvas 分页渲染 + jsPDF 拼合
- **修改文件**：
  - `comic-growth-record/components/GrowthAlbum.tsx`：新增 PDF 日期范围面板
  - `comic-growth-record/services/apiClient.ts`：新增 `generateYearlySummary()` 方法
- **安装依赖**：`npm install jspdf`（前端 comic-growth-record/package.json）
- **实现要求**：
  1. GrowthAlbum 内 PDF 配置面板：
     - 日期范围预设按钮（横向单选）：「最近一个月」「最近半年」「最近一年」「自定义」
     - 「自定义」时显示 from/to 日期选择器
     - 实时统计并显示「已选 X 个故事」
     - 「生成 PDF」按钮（生成中禁用 + loading 提示）
  2. apiClient 新增：
     - `generateYearlySummary(stories: SummaryStoryItem[]): Promise<string>`
     - 失败时返回降级文字（catch → 返回 `这一段时间里，记录了 ${stories.length} 个成长故事。`）
  3. pdfGenerator 实现：
     - `generateStoryBookPdf(options: StoryBookOptions): Promise<Blob>`
     - 所有文字使用 Canvas fillText（系统字体，支持中文），Canvas 转 JPEG 后嵌入 jsPDF
     - **封面页 Canvas**（794×1123px）：居中显示 characterName（大字）+ dateLabel（小字）+ MangaGrow 品牌
     - **故事页 Canvas**（同尺寸）：标题 + 日期 + 2 列分镜网格（复用 posterGenerator 的排版常量）
     - **总结页 Canvas**：「成长记录」标题 + yearlySummary 文字（wrapText 换行，每行高度 28px）
     - jsPDF 拼合：封面 → addPage → 各故事页 → addPage → 总结页
     - `jsPDF.output('blob')` 返回 Blob
  4. 下载触发：
     ```typescript
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url; a.download = `成长故事书_${dateLabel}.pdf`;
     a.click(); URL.revokeObjectURL(url);
     ```
- **约束**：
  - 必须遵守 C39（中文用 Canvas fillText，不用 jsPDF.text）、C40（年度总结降级）
  - jsPDF 仅在此文件中引入，不允许在其他地方使用
- **验收标准**：
  - [ ] PDF 日期范围面板正常工作（预设 + 自定义，实时显示故事数）
  - [ ] 生成的 PDF 包含封面页 + 故事页 + 总结页
  - [ ] 中文字符在 PDF 中正确显示（无乱码）
  - [ ] 分镜图片正确嵌入 PDF
  - [ ] 年度总结 AI 失败时降级为固定文字，PDF 仍可生成
  - [ ] 下载文件名格式正确
  - [ ] 无 TypeScript 错误
- **依赖**：依赖 T-35（后端年度总结 API）、T-36（成长相册组件）
- **状态**：✅ 已完成

---

### [T-38] v1.7 集成验证 + 文档同步
- **目的**：端到端验证 v1.7 三项功能，同步约束文档和架构图
- **方案引用**：Architecture.md v1.7 → 约束 C27/C28/C39/C40/C41 / 约束 C15
- **修改文件**：
  - `.claude/rules/dev-constraints.md`：同步 Architecture.md v1.7 约束 C27（更新）、C28（更新）、C39/C40/C41（新增）
  - `architecture-diagram.html`：新增 GrowthAlbum 组件、pdfGenerator 工具、generateYearlySummary 接口、手动保存数据流
- **实现要求**：
  1. 端到端测试：
     - 生成漫画 → 确认无自动保存（数据库故事数不增加）→ 点击「保存故事」→ 验证数据库新增记录
     - 未保存时编辑脚本 → 确认无 PUT 请求发出
     - 已保存时编辑脚本 → 确认 1 秒后 PUT 请求发出
     - 打开成长相册 → 确认时间轴按年分组正确
     - 生成 PDF（选 1 个月范围）→ 验证 PDF 可打开、中文显示正常、内容结构正确
     - 年度总结 AI 降级测试（模拟后端失败）→ 确认 PDF 仍可生成（使用固定文字）
  2. dev-constraints.md 更新 C27/C28，新增 C39/C40/C41
  3. architecture-diagram.html 更新（反映 v1.7 架构）
- **验收标准**：
  - [ ] 所有端到端测试通过
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致（C01-C41）
  - [ ] architecture-diagram.html 反映 v1.7 架构
  - [ ] TypeScript 编译无错误（前后端）
  - [ ] `npm run dev` 正常启动，无错误
- **依赖**：依赖 T-34, T-35, T-36, T-37
- **状态**：✅ 已完成（端到端测试待人工验证）

---

### [T-39] v1.8 DB Schema 迁移 + imageStorage 更新
- **目的**：删除 scenes 表，更新 stories 表结构，imageStorage 支持 posters/inputs 目录
- **方案引用**：Architecture.md v1.8 → DB Schema / imageStorage 模块
- **修改文件**：
  - `server/db/schema.ts`：删除 scenes 表建表语句；stories 表新增 input_text/input_photos/poster_url 列；迁移逻辑（ALTER TABLE ADD COLUMN）
  - `server/services/imageStorage.ts`：type 参数从 `'avatars'|'scenes'` 改为 `'avatars'|'posters'|'inputs'`；ensureDirectories 新增 posters/ 和 inputs/ 目录
  - `server/types.ts`：Story/StorySummary 类型更新（新增 posterUrl/inputText/inputPhotos，删除 scenes 相关）
- **实现要求**：
  1. schema.ts：删除 `CREATE TABLE IF NOT EXISTS scenes` 语句；stories 表 ALTER TABLE 新增三列；保留现有 characters 表不变
  2. imageStorage.ts：saveImage type 联合类型更新；ensureDirectories 创建三个目录
  3. server/types.ts：Story 接口新增 posterUrl、inputText、inputPhotos 字段；删除 Scene 类型
- **约束**：C21（目录类型更新）、C22（保留 user_id）
- **验收标准**：
  - [ ] schema.ts 中无 scenes 表定义
  - [ ] stories 表有 input_text、input_photos、poster_url 列
  - [ ] imageStorage.saveImage 接受 'posters' 和 'inputs' 类型
  - [ ] data/images/posters/ 和 data/images/inputs/ 目录自动创建
  - [ ] TypeScript 编译无错误
- **依赖**：无
- **状态**：✅ 已完成

---

### [T-40] 后端 stories 路由重构（保存 + 删除 + 详情）
- **目的**：更新 POST /api/stories 接受海报/照片，删除 PUT /api/stories/:id，DELETE 级联删除文件
- **方案引用**：Architecture.md v1.8 → 手动保存确认方案 / C42
- **修改文件**：
  - `server/routes/stories.ts`：POST 路由接收新字段；删除 PUT 路由；DELETE 路由补充磁盘文件删除
- **实现要求**：
  1. `POST /api/stories`：接收 `{ title, input_text, input_photos: string[], poster_base64, style }`；调用 imageStorage.saveImage('posters', poster_base64) 得到 poster_url；遍历 input_photos 调用 imageStorage.saveImage('inputs', ...) 得到路径数组；将 input_photos 路径数组 JSON.stringify 后存入 DB
  2. 删除 `PUT /api/stories/:id` 路由（整个路由块删除）
  3. `DELETE /api/stories/:id`：查询故事的 poster_url 和 input_photos，调用 imageStorage.deleteImage 逐一删除文件，再删除 DB 记录
  4. `GET /api/stories/:id`：返回 posterUrl、inputText、inputPhotos（JSON.parse 还原为数组）
- **约束**：C24（标准 JSON 响应）、C42（三步顺序）
- **验收标准**：
  - [ ] POST /api/stories 正确写入 poster_url/input_text/input_photos
  - [ ] PUT /api/stories/:id 路由不存在（返回 404）
  - [ ] DELETE /api/stories/:id 同步删除磁盘文件
  - [ ] GET /api/stories/:id 返回新字段
  - [ ] TypeScript 编译无错误
- **依赖**：T-39
- **状态**：✅ 已完成

---

### [T-41] 前端 App.tsx 保存流程重构
- **目的**：保存时先 generatePoster → 上传 → POST，移除 debounce PUT 同步逻辑
- **方案引用**：Architecture.md v1.8 → 手动保存确认方案 / C27 / C42
- **修改文件**：
  - `comic-growth-record/App.tsx`：handleSaveStory 重写；移除 debouncedSync/syncScenes；状态从 currentStoryId + saveStatus 简化为 isSaved
  - `comic-growth-record/services/apiClient.ts`：saveStory body 更新（新字段）；删除 updateStory 方法
- **实现要求**：
  1. handleSaveStory：① 调用 posterGenerator.generatePoster(scenes, { title, date }) 得到 Blob → 转 base64 ② 收集 inputPhotos（用户上传的照片 base64）③ 调用 apiClient.saveStory({ title, input_text, input_photos, poster_base64, style }) ④ 成功后 setIsSaved(true)
  2. 移除所有 debouncedSync、syncScenes、handleTitleChange 中的 PUT 调用
  3. 移除 currentStoryId 状态（不再需要 storyId 来判断 PUT）；改用 isSaved: boolean
  4. apiClient.saveStory 参数类型更新；删除 updateStory 方法
- **约束**：C27（按钮显示条件）、C42（三步顺序）
- **验收标准**：
  - [ ] 点击「保存故事」先生成海报再 POST，无 PUT 调用
  - [ ] 保存中显示「保存中...」，成功后「✅ 已保存」
  - [ ] 代码中无 debouncedSync/syncScenes/updateStory 引用
  - [ ] TypeScript 编译无错误
- **依赖**：T-40
- **状态**：✅ 已完成

---

### [T-42] HistoryPanel 重构为双栏主页面
- **目的**：将历史记录从侧边栏改为全宽双栏主页面（左列表 + 右只读详情）
- **方案引用**：Architecture.md v1.8 → HistoryPanel 技术方案 / C43
- **修改文件**：
  - `comic-growth-record/components/HistoryPanel.tsx`：整体重构
  - `comic-growth-record/App.tsx`：HistoryPanel 的 props 和渲染位置调整（从侧边栏叠加改为主内容区替换）
- **实现要求**：
  1. HistoryPanel 改为 isOpen 时替换主内容区（与 GrowthAlbum 同级）
  2. 左栏（280px 固定宽，垂直滚动）：故事列表卡片（海报缩略图 + 标题 + 日期）；点击卡片设置 selectedStoryId
  3. 右栏（flex）：展示选中故事详情——海报大图 + input_text + input_photos（若有）；右上角「删除」图标
  4. 进入时默认选中第一条（最新）；删除后自动选中相邻条
  5. 移除 onSelectStory prop（不再加载到创作面板）
  6. 右栏严格只读，无任何编辑/重绘控件
- **约束**：C41（与 GrowthAlbum 互斥）、C43（双栏只读）
- **验收标准**：
  - [ ] 历史记录页面为双栏布局（左 280px + 右 flex）
  - [ ] 点击左栏卡片右栏即时切换，无需翻页
  - [ ] 右栏展示海报大图 + 原始输入文字 + 原始照片（若有）
  - [ ] 右栏无任何编辑/重绘控件
  - [ ] 删除功能正常（确认弹窗 + 级联删除磁盘文件）
  - [ ] TypeScript 编译无错误
- **依赖**：T-40、T-41
- **状态**：✅ 已完成

---

### [T-43] GrowthAlbum + pdfGenerator v1.8 更新
- **目的**：相册缩略图改为 posterUrl；点击展开只读详情；PDF 故事页改为海报全页
- **方案引用**：Architecture.md v1.8 → GrowthAlbum 组件 / pdfGenerator 模块
- **修改文件**：
  - `comic-growth-record/components/GrowthAlbum.tsx`：缩略图 + 点击行为 + 详情展示 + PDF 触发参数
  - `comic-growth-record/utils/pdfGenerator.ts`：StoryBookOptions 类型 + 故事页渲染逻辑
- **实现要求**：
  1. GrowthAlbum：故事卡片缩略图改为 story.posterUrl；点击卡片设置 selectedStoryId（展开只读详情），不调用 onSelectStory；移除 onSelectStory prop
  2. GrowthAlbum 详情视图：海报大图 + inputText + inputPhotos（右侧内联展示）
  3. GrowthAlbum PDF 触发：generateYearlySummary 参数改为 `{ title, inputText }` 数组（不再传 captions）
  4. pdfGenerator StoryBookOptions：删除 scenes 字段，新增 posterUrl/inputText；故事页从分镜网格改为海报全页（fetch posterUrl → Canvas drawImage 全铺 + 标题日期叠加）
- **约束**：C39（中文 Canvas）、C40（总结降级）
- **验收标准**：
  - [ ] 相册卡片缩略图显示海报图
  - [ ] 点击卡片在相册内展开只读详情，不关闭相册
  - [ ] PDF 故事页为海报全页（非分镜网格）
  - [ ] PDF 中文正常显示
  - [ ] AI 总结降级正常
  - [ ] TypeScript 编译无错误
- **依赖**：T-39、T-40
- **状态**：✅ 已完成

---

### [T-44] v1.8 集成验证 + 文档同步
- **目的**：端到端验证 v1.8 全部功能，同步约束文档和架构图
- **方案引用**：Architecture.md v1.8 → C15（架构图同步）
- **修改文件**：
  - `.claude/rules/dev-constraints.md`：同步 C21/C27 更新，删除 C28/C32/C33，C41 更新，新增 C42/C43
  - `architecture-diagram.html`：反映 v1.8 架构（双栏历史、海报存储、无 scenes 表）
- **实现要求**：
  1. 端到端测试：
     - 生成漫画 → 点击「保存故事」→ 确认 posters/ 目录新增文件，DB stories 表有 poster_url
     - 打开历史记录 → 确认双栏布局，点击卡片右栏切换
     - 历史详情确认展示海报 + 原始输入文字
     - 删除故事 → 确认 DB 记录删除 + 磁盘文件删除
     - 成长相册缩略图为海报图
     - 生成 PDF → 确认故事页为海报全页、中文正常、总结页存在
  2. dev-constraints.md 同步更新
  3. architecture-diagram.html 更新
- **验收标准**：
  - [ ] 所有端到端测试通过
  - [ ] dev-constraints.md 与 Architecture.md v1.8 约束一致（C01-C43，C28/C32/C33 标废除）
  - [ ] architecture-diagram.html 反映 v1.8 架构
  - [ ] TypeScript 编译无错误（前后端）
- **依赖**：T-41、T-42、T-43
- **状态**：✅ 已完成

---

### [FIX-03] 清理 storyService.ts 中孤立的 generateTitle export（违反 T-30 验收标准）
- **问题**：T-30 要求 `generateTitle` 不再从 storyService.ts export（成为内部函数），但当前 storyService.ts 仍然 export `generateTitle` 函数，且该函数调用一个不存在的 `/api/ai/generate-title` 端点（后端已删除此路由）
- **涉及文件**：`comic-growth-record/services/storyService.ts`
- **修复方式**：删除 storyService.ts 中的 `generateTitle` 导出函数（共 9 行），因为标题现在通过 `storyResult.title` 从 generateStory 返回
- **约束**：C37（标题随 StoryOutput 返回）
- **验收标准**：
  - [ ] storyService.ts 中不再有 generateTitle export
  - [ ] TypeScript 编译无错误（无悬空 import 引用）
- **依赖**：无
- **状态**：✅ 已完成
- **优先级**：P1

---

### [T-45] 后端视频分析服务（videoAnalyzer + API 端点）
- **目的**：实现视频内容理解和关键帧提取的后端服务，支持 Gemini Video Understanding
- **方案引用**：Architecture.md v2.0 → videoAnalyzer 模块 / 视频转漫画技术方案
- **新建文件**：
  - `server/services/videoAnalyzer.ts`：视频分析核心逻辑
- **修改文件**：
  - `server/types.ts`：新增 `VideoAnalysis`、`VideoKeyFrame` 类型
  - `server/routes/ai.ts`：新增 `POST /api/ai/analyze-video` 端点
- **实现要求**：
  1. `VideoAnalysis` 类型：`{ description: string; keyFrames: VideoKeyFrame[] }`
  2. `VideoKeyFrame` 类型：`{ timestamp: string; description: string; imageBase64: string }`
  3. `analyzeVideo(videoBase64, mimeType)` 实现：
     - 将视频 base64 作为 inlineData 传入 TEXT_MODEL（Gemini Video Understanding）
     - 提示词要求 AI 完成两个任务：内容理解（100-200字）+ 关键帧选取（2-4 帧）
     - 使用 `responseMimeType: "application/json"` 要求 JSON 输出
     - 解析响应获取 description 和 keyFrames
     - 对每个关键帧：从视频中截取帧图片，通过 imageStorage.saveImage('scenes', ...) 存储到磁盘
     - 返回 VideoAnalysis（关键帧 imageBase64 替换为磁盘 URL）
  4. `POST /api/ai/analyze-video` 路由：
     - 接收 `{ videoBase64: string, mimeType: string }`
     - 调用 `videoAnalyzer.analyzeVideo()`
     - 超时设置 120 秒
     - 成功：`{ success: true, data: VideoAnalysis }`
     - 失败：`{ success: false, error: '...' }`
- **约束**：
  - 必须遵守 C03（withRetry）、C04（模型常量）、C11（JSON 验证）、C24（标准响应格式）、C48（不保存视频原文件）、C49（120 秒超时）
- **验收标准**：
  - [ ] `videoAnalyzer.ts` 导出 `analyzeVideo`
  - [ ] `POST /api/ai/analyze-video` 端点可正常访问
  - [ ] 传入视频 base64 后返回 description + 2-4 个关键帧
  - [ ] 关键帧图片保存到 data/images/scenes/
  - [ ] 超时 120 秒后返回错误
  - [ ] 无 TypeScript 编译错误
- **依赖**：基于 T-23（后端基础设施）
- **状态**：✅ 已完成

---

### [T-46] 前端类型定义 + apiClient + inputService 视频支持
- **目的**：前端新增视频相关类型，apiClient 和 inputService 新增视频分析方法
- **方案引用**：Architecture.md v2.0 → apiClient 模块 / inputService 模块
- **修改文件**：
  - `comic-growth-record/types.ts`：新增 `VideoAnalysis`、`VideoKeyFrame` 类型
  - `comic-growth-record/services/apiClient.ts`：新增 `analyzeVideo()` 方法
  - `comic-growth-record/services/inputService.ts`：新增 `analyzeVideo()` 薄封装
- **实现要求**：
  1. `VideoAnalysis` 类型：`{ description: string; keyFrames: VideoKeyFrame[] }`
  2. `VideoKeyFrame` 类型：`{ timestamp: string; description: string; imageUrl: string }`
  3. apiClient 新增：`analyzeVideo(videoBase64: string, mimeType: string): Promise<VideoAnalysis>`
     - 调用 `postAi('analyze-video', { videoBase64, mimeType })`
     - 超时设置 120 秒（覆盖默认 fetch timeout）
  4. inputService 新增：`analyzeVideo(videoFile: File): Promise<VideoAnalysis>`
     - 将 File 转为 base64（FileReader）
     - 推断 mimeType（file.type）
     - 调用 apiClient.analyzeVideo()
- **约束**：
  - 必须遵守 C02（通过 services 层）、C26（不 import @google/genai）
- **验收标准**：
  - [ ] types.ts 导出 VideoAnalysis、VideoKeyFrame 类型
  - [ ] apiClient.analyzeVideo() 可正常调用后端
  - [ ] inputService.analyzeVideo() 接收 File 对象，返回 VideoAnalysis
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-45]（后端 API 就绪）
- **状态**：✅ 已完成

---

### [T-47] InputPanel 视频上传 UI
- **目的**：在输入面板中新增视频上传按钮、前端校验、分析状态显示、关键帧缩略图展示
- **方案引用**：Architecture.md v2.0 → 视频分析数据流 / Product-Spec v2.0 → 素材上传区
- **修改文件**：
  - `comic-growth-record/components/InputPanel.tsx`：新增视频上传 UI
  - `comic-growth-record/App.tsx`：新增视频相关状态（videoAnalysis, isVideoAnalyzing）
- **实现要求**：
  1. InputPanel 素材上传区：
     - 「添加照片」和「添加视频」按钮并排（图片图标 + 视频图标）
     - 视频上传触发 `<input type="file" accept="video/mp4,video/quicktime">`
  2. 前端校验（C44）：
     - 格式：仅 MP4/MOV
     - 时长：≤3 分钟（通过 video element loadedmetadata 事件获取 duration）
     - 大小：≤500MB（file.size）
     - 数量：最多 1 段
     - 不满足时显示具体拒绝原因
  3. 视频分析状态显示：
     - 上传中：视频缩略图卡片（80x80px）+ 时长标签 + 进度条
     - 分析中：「AI 分析中...」+ 动画
     - 分析完成：关键帧缩略图（与照片缩略图并排，带"关键帧"标签），可删除单个帧
     - 失败：错误提示 + 重试按钮
  4. App.tsx 新增状态：
     - `videoAnalysis: VideoAnalysis | null`
     - `isVideoAnalyzing: boolean`
     - `videoFile: File | null`（保留 File 对象用于重试）
  5. 视频上传后立即触发分析（C45），不等待用户点击「生成漫画」
  6. 用户可在分析期间继续写文字、选风格、上传照片
  7. 删除关键帧：从 videoAnalysis.keyFrames 数组中移除
- **约束**：
  - 必须遵守 C44（前端校验）、C45（立即分析）、C46（帧数 AI 决定，用户只可删除）
- **验收标准**：
  - [ ] 「添加视频」按钮正常工作
  - [ ] 格式/时长/大小/数量校验正确拒绝不合规视频
  - [ ] 上传后立即开始分析，显示分析状态
  - [ ] 分析完成后展示关键帧缩略图
  - [ ] 用户可删除单个关键帧
  - [ ] 分析失败时显示错误 + 重试
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-46]（前端类型和 API 方法）
- **状态**：✅ 已完成

---

### [T-48] App.tsx handleGenerate 视频路径集成
- **目的**：在生成漫画流程中集成视频关键帧：关键帧决定分镜数，照片为额外参考
- **方案引用**：Architecture.md v2.0 → 主流程数据流（视频路径）/ 约束 C46、C47
- **修改文件**：
  - `comic-growth-record/App.tsx`：handleGenerate 函数增加视频分支
- **实现要求**：
  1. handleGenerate 判断视频输入：
     - `videoAnalysis?.keyFrames.length > 0` → 视频路径
     - 否则保持现有照片/纯文字路径
  2. 视频路径 - storyService 输入：
     - `text`：用户输入文字 + videoAnalysis.description（视频描述追加到文字输入）
     - `imageAnalysis`：照片分析结果（如有）
     - `imageCount`：keyFrames.length（关键帧数量决定分镜数）
  3. 视频路径 - 分镜数量：
     - `initialScenes` 数量 = keyFrames.length（1:1 对应）
  4. 视频路径 - 图片生成：
     - 并行调用 imageService（类似有照片路径）
     - 每张分镜使用对应关键帧的 imageUrl 作为 sceneReferenceImages
     - 如果同时有照片（inputImages），照片作为额外视觉参考注入（所有分镜共享），不增加分镜数
  5. 无视频时：保持现有逻辑不变（有照片并行/无照片串行链式）
- **约束**：
  - 必须遵守 C46（关键帧 1:1 对应分镜）、C47（照片为额外参考不增加分镜）、C38（无视频无照片时链式策略不变）
- **验收标准**：
  - [ ] 有视频关键帧时：分镜数 = 关键帧数
  - [ ] 每个分镜使用对应关键帧图片作为场景参考
  - [ ] 视频 + 照片混合时：照片不增加分镜，作为额外参考
  - [ ] 纯文字/纯照片路径行为不变
  - [ ] 无 TypeScript 编译错误
- **依赖**：依赖 [T-47]（App.tsx 已有 videoAnalysis 状态）
- **状态**：✅ 已完成

---

### [T-49] v2.0 集成验证 + 文档同步
- **目的**：端到端验证视频转漫画功能，同步约束文档和架构图
- **方案引用**：Architecture.md v2.0 → 约束 C15（架构图同步）、C44-C49
- **修改文件**：
  - `.claude/rules/dev-constraints.md`：同步 Architecture.md v2.0 约束 C44-C49
  - `architecture-diagram.html`：新增 videoAnalyzer 模块、视频分析数据流
  - `agent-flow-diagram.html`：新增视频分析流程
- **实现要求**：
  1. 端到端测试：
     - 上传 MP4 视频 → 前端校验通过 → 分析中状态 → 关键帧缩略图展示
     - 格式/时长/大小不合规视频 → 前端拒绝并提示
     - 删除单个关键帧 → 缩略图消失
     - 关键帧 + 文字 → 生成漫画 → 分镜数 = 关键帧数
     - 关键帧 + 照片 + 文字 → 生成漫画 → 分镜数 = 关键帧数（照片为额外参考）
     - 纯文字/纯照片 → 生成漫画 → 行为不变
     - 视频分析失败 → 错误提示 + 重试按钮
  2. dev-constraints.md 新增 C44-C49
  3. architecture-diagram.html 更新（新增 videoAnalyzer 模块）
  4. agent-flow-diagram.html 更新（新增视频分析路径）
- **验收标准**：
  - [ ] 所有端到端测试通过
  - [ ] dev-constraints.md 与 Architecture.md 约束清单一致（C01-C49，C28/C32/C33 标废除）
  - [ ] architecture-diagram.html 反映 v2.0 架构
  - [ ] agent-flow-diagram.html 反映视频分析流程
  - [ ] TypeScript 编译无错误（前后端）
  - [ ] `npm run dev` 正常启动，无错误
- **依赖**：依赖 T-45, T-46, T-47, T-48
- **状态**：✅ 已完成

---

## v2.0 依赖关系图

```
=== v2.0 视频转漫画（待开发）===

T-45 (后端 videoAnalyzer + API)
  │
  └──→ T-46 (前端类型 + apiClient + inputService)
          │
          └──→ T-47 (InputPanel 视频上传 UI)
                  │
                  └──→ T-48 (App.tsx handleGenerate 视频集成)
                          │
                          └──→ T-49 (集成验证 + 文档同步)
```

**推荐执行顺序**：

| 阶段 | 任务 | 说明 |
|------|------|------|
| Phase 1-22 | T-01~T-44, FIX-03 | ✅ 全部完成 |
| **Phase 23** | **T-45** | **后端视频分析服务（videoAnalyzer + API 端点）** |
| **Phase 24** | **T-46** | **前端类型定义 + apiClient + inputService** |
| **Phase 25** | **T-47** | **InputPanel 视频上传 UI** |
| **Phase 26** | **T-48** | **App.tsx handleGenerate 视频路径集成** |
| **Phase 27** | **T-49** | **集成验证 + 文档同步** |

---

## 变更记录

| 日期 | 触发来源 | 变更内容 | 受影响任务 |
|------|---------|---------|-----------|
| 2026-03-06 | Architecture v2.0（视频转漫画） | 新增 T-45~T-49：后端视频分析、前端类型+API、视频上传UI、生成流程集成、集成验证 | T-45~T-49 |
| 2026-02-27 | Architecture v1.8（存储重构 + 历史双栏） | 新增 T-39~T-44；T-34/T-36/T-37 标记受影响（已完成任务不重做，由新任务覆盖） | T-34⚠️, T-36⚠️, T-37⚠️, T-39~T-44 |
| 2026-02-09 | Architecture v1.0 | 初始任务拆分 | 全部 |
| 2026-02-10 | Phase 1-5 执行完成 | T-01~T-10 全部完成，geminiService.ts 已删除 | 全部 |
| 2026-02-10 | Architecture v1.1（性能优化） | 新增 T-11（故事管线4步化）、T-12（图片条件并行）；T-04、T-07 标记 ⚠️ | T-04, T-07, T-11, T-12 |
| 2026-02-10 | Architecture v1.2（人物库优化） | 新增 T-13（性别/年龄识别）、T-14（详情页 UI）、T-15（重新生成）；T-05、T-08 标记 ⚠️ | T-05, T-08, T-13, T-14, T-15 |
| 2026-02-13 | T-11~T-15 执行完成 | T-11~T-15 全部完成（性能优化 + 人物库优化） | T-11~T-15 |
| 2026-02-13 | Architecture v1.3（后端迁移） | 新增 T-16~T-23（后端基础设施、AI 服务迁移、REST 路由、前端瘦化、集成验证） | T-16~T-23 |
| 2026-02-14 | T-16~T-23 执行完成 | T-16~T-23 全部完成（后端迁移：Express + SQLite + 前端瘦化 + 集成验证） | T-16~T-23 |
| 2026-02-14 | Architecture v1.4（功能增强） | 新增 T-24~T-29：DB 迁移+标题生成、自动保存+同步、网格海报导出、历史记录侧边栏、UI 更新、集成验证 | T-24~T-29 |
| 2026-02-24 | Architecture v1.6（生成流程优化） | 新增 T-30~T-33：storyPipeline 标题内移+并行、App.tsx 锚定帧+标题提前、imageGenerator 基准帧标签、集成验证 | T-30~T-33 |
