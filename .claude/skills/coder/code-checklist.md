# 代码自检清单

实现完成后，对照此清单逐项检查。来源：dev-constraints.md C01-C33。

---

## 前端文件（comic-growth-record/）

### Services 层
- [ ] **C26** 不 import `@google/genai`，所有 AI 功能通过 `apiClient` 调用后端
- [ ] **C02** 组件（.tsx）不直接调用后端 API，必须通过 `services/` 层
- [ ] **C20** 不存储或读取 API Key
- [ ] 所有后端通信通过 `services/apiClient.ts`，不直接 fetch

### 组件层
- [ ] **C02** 组件不直接调用 Gemini API 或后端接口
- [ ] **C23** 图片展示使用后端 URL（`/api/images/...`），不用 base64 长期存储

---

## 后端文件（server/）

### AI 调用
- [ ] **C03** 所有 Gemini 调用通过 `withRetry` 包装（至少 3 次重试）
- [ ] **C04** 模型名称引用 `TEXT_MODEL` / `IMAGE_MODEL` 常量，不硬编码
- [ ] **C11** API 响应 JSON 经过 `JSON.parse()` 验证

### 角色系统
- [ ] **C05** 分镜图片 1K，角色头像 2K
- [ ] **C06** 生成角色图片时同时传入参考图和文字描述
- [ ] **C12** 角色照片传入 API 前压缩（maxWidth=800, quality=0.6）
- [ ] **C14** 有参考图失败时降级为纯文字，不直接报错
- [ ] **C16** 性别/年龄识别在生成头像后立即执行
- [ ] **C17** 角色头像 1:1 方形

### 风格系统
- [ ] **C07** 风格提示词从 `styleConfig.getStylePrompt()` 获取
- [ ] **C08** 同一组分镜使用完全相同的风格参数

### 故事管线
- [ ] **C09** 故事管线 4 步按顺序执行，不跳步
- [ ] **C10** 质量关卡仅审核不重试，不通过时降级继续

### 数据存储
- [ ] **C21** 图片文件存储在 `data/images/{type}/`（avatars/scenes）
- [ ] **C22** 数据库表包含 `user_id` 字段
- [ ] **C25** 图片文件名使用 UUID

### API 规范
- [ ] **C24** 响应格式 `{ success: boolean, data?: any, error?: string }`

---

## 通用检查

- [ ] **C13** 系统提示词与 Product-Spec.md 一致
- [ ] **C15** Architecture.md 变更时同步更新 architecture-diagram.html
- [ ] **C18** 用户保存角色时，性别/年龄信息写入 description
- [ ] **C19** description 格式："性别，年龄段（具体年龄），外貌特征..."
### 自动保存与同步（v1.4）
- [ ] **C27** 生成完成后自动保存，不依赖用户手动保存
- [ ] **C28** 修改后 debounce 1 秒同步到后端（PUT /api/stories/:id）
- [ ] **C31** 标题生成失败不阻塞主流程，降级为 input_summary 前 15 字
- [ ] **C33** 加载历史故事后展示结构与生成结果完全一致

### 海报导出（v1.4）
- [ ] **C29** 海报生成使用原生 Canvas API，不引入 html2canvas
- [ ] **C30** 海报排版固定 2 列，奇数末行居中，水印 "MangaGrow"

### 历史记录（v1.4）
- [ ] **C32** HistoryPanel 交互与 CharacterLibrary 一致（折叠侧边栏、关闭按钮、动画）

---

## 通用检查

- [ ] **C13** 系统提示词与 Product-Spec.md 一致
- [ ] **C15** Architecture.md 变更时同步更新 architecture-diagram.html
- [ ] **C18** 用户保存角色时，性别/年龄信息写入 description
- [ ] **C19** description 格式："性别，年龄段（具体年龄），外貌特征..."
- [ ] 无 TypeScript 编译错误
- [ ] 无未使用的 import
- [ ] 新增文件已在 Architecture.md 模块设计中定义
