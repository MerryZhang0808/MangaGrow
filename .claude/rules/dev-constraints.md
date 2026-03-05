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
- 图片文件必须存储在 `data/images/{type}/` 下（type: avatars/posters/inputs）（C21，v1.8 更新）
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

## 手动保存（v1.8 重构）
- 生成完成后必须显示「保存故事」按钮（不自动保存），`scenes.length > 0 && !isSaved` 时按钮可见，保存成功后按钮消失（C27）
- 保存流程必须严格三步顺序：① posterGenerator.generatePoster() ② imageStorage.saveImage('posters'/'inputs') ③ POST /api/stories；任一步骤失败不得写入数据库（C42）
- 不存在 PUT /api/stories/:id，禁止任何 debounce 同步逻辑（C28 已废除）
- 保存后故事只读，不支持编辑/重绘
- 标题生成失败不允许阻塞主流程，必须降级为 input_summary 前 15 字（C31）

## 海报导出（v1.4）
- 海报生成必须使用原生 Canvas API，不引入 html2canvas 等第三方库（C29）
- 海报排版固定 2 列，奇数分镜末行居中，水印固定 "MangaGrow"（C30）

## 历史记录（v1.8 重构）
- HistoryPanel 必须为全宽双栏主页面：左栏 280px 固定宽故事列表 + 右栏 flex 只读详情（C43）
- 右栏只展示 posterUrl/inputText/inputPhotos，不允许渲染任何编辑/重绘控件（C43）
- 历史记录严格只读，不支持将历史故事加载到创作面板（C33 已废除 v1.8）
- C32（侧边栏约束）已废除

## PDF 成长故事书（v1.7 新增，v1.8 更新）
- PDF 中所有中文文字必须通过 Canvas fillText 渲染后转为图片嵌入，不允许直接调用 jsPDF.text 输出中文（避免字体缺失乱码）（C39）
- 年度总结 AI 生成失败时必须降级为固定文字（不允许空白总结页或阻塞 PDF 生成），降级文字：「这一段时间里，记录了 ${count} 个成长故事。」（C40）
- jsPDF 仅允许在 `comic-growth-record/utils/pdfGenerator.ts` 中引入，其他文件不允许 import jspdf
- 成长相册（isGrowthAlbumOpen）与历史记录主页面（isHistoryOpen）必须互斥，不允许同时显示（C41）
- 图片串行生成时，Scene 2+ 以上一张已生成分镜图作为场景参考（链式传递），通过 `[风格参考帧]` prompt label 保持画风一致；有用户照片时每张用对应用户照片作参考（C38）

## 文档同步
- Architecture.md 变更时必须同步更新 architecture-diagram.html（C15）
- 涉及模块新增/删除、数据流变化、约束变更时，架构图必须同步修改
