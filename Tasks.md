# Tasks - MangaGrow 漫画成长记录

## 概述
共 11 个任务：1 个 POC 任务，10 个开发任务。
执行顺序：先完成基础模块拆分（T-01~T-03），再建设核心管线（T-04~T-06），最后集成调度（T-07~T-10）。
POC-01 与 T-01~T-03 可并行，结果影响 T-05。

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

### [T-04] 构建故事管线（storyService）
- **目的**：将现有单步脚本生成替换为 5 步管线 + 2 个质量关卡
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

### [T-05] 重构角色系统（characterService）
- **目的**：将角色相关功能从 geminiService.ts 独立，增加参考表能力（POC 后决定）
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

### [T-07] 集成 App.tsx 调度逻辑
- **目的**：更新 App.tsx 中的 handleGenerate 流程，对接新的服务模块
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

### [T-08] 集成 CharacterLibrary 组件
- **目的**：更新人物库组件，对接 characterService
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
POC-01 ─────────────────────────────────────→ T-05 (影响参考表部分)

T-01 (aiClient + utils) ──→ T-03 (inputService)  ──→ T-07 (App.tsx 集成)
          │                                              ▲
          ├──→ T-04 (storyService) ─────────────────────┤
          │                                              │
          └──→ T-05 (characterService) ──→ T-06 (imageService) ──→ T-07
                    │                          │
                    └──→ T-08 (CharacterLib)    └──→ T-09 (DisplayPanel)
                                                          │
T-02 (styleConfig) ──→ T-06                               ▼
                                                     T-10 (清理 + 同步)
```

**推荐执行顺序**：

| 阶段 | 任务 | 说明 |
|------|------|------|
| Phase 0 | POC-01 | 可与 Phase 1 并行 |
| Phase 1 | T-01, T-02 | 基础模块，无依赖，可并行 |
| Phase 2 | T-03, T-04, T-05 | 服务模块，依赖 T-01，三者可并行 |
| Phase 3 | T-06 | 图片服务，依赖 T-01 + T-02 + T-05 |
| Phase 4 | T-07, T-08, T-09 | UI 集成，依赖上游服务模块 |
| Phase 5 | T-10 | 清理收尾 |

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

## 变更记录

| 日期 | 触发来源 | 变更内容 | 受影响任务 |
|------|---------|---------|-----------|
| 2026-02-09 | Architecture v1.0 | 初始任务拆分 | 全部 |
| 2026-02-10 | Phase 1-5 执行完成 | T-01~T-10 全部完成，geminiService.ts 已删除 | 全部 |
