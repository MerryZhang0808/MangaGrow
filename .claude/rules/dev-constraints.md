---
paths:
  - "comic-growth-record/**"
  - "server/**"
---

# 代码开发约束（编辑项目代码时自动生效）

## 文档优先
- 修改代码前，先确认该修改符合 Architecture.md 中的技术方案
- 如果 Architecture.md 中没有覆盖该修改，先更新 Architecture.md 再写代码
- 新增 service 文件必须先在 Architecture.md 的模块设计中定义

## 环境配置
- 后端环境变量在 `.env` 文件中定义（如 `GEMINI_API_KEY`），通过 `process.env` 读取
- 前端不再需要 API Key 环境变量，不允许使用 `VITE_GEMINI_API_KEY`
- 前端不允许存储或读取 API Key（C20）

## AI 调用规范
- 所有 Gemini API 调用必须在后端（`server/services/`）中执行，前端不允许直接调用
- 后端所有 Gemini 调用必须通过 `server/services/gemini.ts` 的 `withRetry` 包装（至少 3 次重试）（C03）
- 模型名称必须引用 `server/services/gemini.ts` 中的常量（TEXT_MODEL / IMAGE_MODEL），不允许硬编码（C04）
- 前端 `services/*.ts` 不允许直接 import `@google/genai`，所有 AI 功能通过 `apiClient` 调用后端（C26）
- 前端组件（.tsx）不允许直接调用后端 API，必须通过 `services/` 层（C02）
- 分镜图片分辨率使用 1K（1024x1024），角色头像分辨率使用 2K（2048x2048）（C05）
- 后端所有 API 响应的 JSON 必须经过 `JSON.parse()` 验证（C11）
- 角色照片传入 API 前必须压缩（maxWidth=800, quality=0.6）（C12）
- 有参考图方案失败时必须降级为纯文字方案，不允许直接报错（C14）

## 角色系统
- 生成角色相关图片时，必须同时传入角色参考图和文字描述（C06）
- 不允许仅靠文字描述生成角色图片（降级方案除外）
- 角色头像比例固定为 1:1 方形（C17）
- 性别/年龄识别必须在生成头像后立即执行（C16）
- 用户保存角色时，必须将性别/年龄信息写入 `character.description`（C18）
- description 格式："性别，年龄段（具体年龄），外貌特征..."（C19）

## 风格系统
- 同一组分镜必须使用完全相同的风格参数（C08）
- 图片生成的风格提示词必须从 `server/services/styleConfig.getStylePrompt()` 获取（C07）

## 数据存储
- 图片文件必须存储在 `data/images/{type}/` 下（type: avatars/scenes）（C21）
- 图片保存到磁盘时必须使用唯一文件名（UUID）（C25）
- 数据库所有表必须包含 `user_id` 字段（当前可为 NULL）（C22）
- 前端图片展示必须使用后端 URL（`/api/images/...`），不允许使用 base64 Data URL 长期存储（C23）

## API 规范
- 后端 API 必须返回标准 JSON 格式 `{ success: boolean, data?: any, error?: string }`（C24）
- 前端所有后端通信必须通过 `services/apiClient.ts`，不允许在组件或其他 service 中直接 fetch

## 代码组织
- 系统提示词在后端服务中直接使用，必须与 Product-Spec.md 一致（C13）
- 故事管线 4 步必须按顺序执行，不允许跳步（C09）
- 质量关卡仅审核、不重试，不通过时降级继续（C10）

## 自动保存与同步（v1.4）
- 生成完成后必须自动保存（POST /api/stories），不允许依赖用户手动保存（C27）
- 用户修改分镜（脚本编辑、重绘、标题修改）后必须 debounce 同步到后端（PUT /api/stories/:id），间隔 1 秒（C28）
- 标题生成失败不允许阻塞主流程，必须降级为 input_summary 前 15 字（C31）
- 加载历史故事后在右侧面板呈现，展示结构必须与生成结果完全一致（C33）

## 海报导出（v1.4）
- 海报生成必须使用原生 Canvas API，不引入 html2canvas 等第三方库（C29）
- 海报排版固定 2 列，奇数分镜末行居中，水印固定 "MangaGrow"（C30）

## 历史记录（v1.4）
- HistoryPanel 交互方式必须与 CharacterLibrary 一致（折叠侧边栏、关闭按钮、动画）（C32）

## 文档同步
- Architecture.md 变更时必须同步更新 architecture-diagram.html（C15）
- 涉及模块新增/删除、数据流变化、约束变更时，架构图必须同步修改
