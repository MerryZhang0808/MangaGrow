---
paths:
  - "comic-growth-record/**"
---

# 代码开发约束（编辑项目代码时自动生效）

## 文档优先
- 修改代码前，先确认该修改符合 Architecture.md 中的技术方案
- 如果 Architecture.md 中没有覆盖该修改，先更新 Architecture.md 再写代码
- 新增 service 文件必须先在 Architecture.md 的模块设计中定义

## 环境配置
- 环境变量必须使用 VITE_ 前缀（如 VITE_GEMINI_API_KEY）
- 代码中通过 import.meta.env.VITE_xxx 读取，不允许使用 process.env
- 修改 .env.local 后必须提醒用户重启 Vite 服务

## AI 调用规范
- 所有 Gemini API 调用必须通过 `withRetry` 包装（至少 3 次重试）
- 模型名称必须引用 `aiClient.ts` 中的常量（TEXT_MODEL / IMAGE_MODEL），不允许硬编码
- 不允许在组件（.tsx）中直接调用 Gemini API，必须通过 services/ 层
- 分镜图片分辨率使用 1K（1024x1024），角色头像分辨率使用 2K（2048x2048）
- 所有 API 响应的 JSON 必须经过 `JSON.parse()` 验证
- 角色照片传入 API 前必须压缩（maxWidth=800, quality=0.6）
- 有参考图方案失败时必须降级为纯文字方案，不允许直接报错

## 角色系统
- 生成角色相关图片时，必须同时传入角色参考图和文字描述
- 不允许仅靠文字描述生成角色图片（降级方案除外）
- 角色参考图通过 Gemini API 的 inlineData 传入

## 风格系统
- 同一组分镜必须使用完全相同的风格参数
- 生成图片的提示词必须包含完整的风格关键词（不允许只写风格名称）

## 代码组织
- constants.ts 中的系统提示词必须与 Product-Spec.md 一致
- 新增功能对应的状态管理必须在 App.tsx 中有对应的状态和逻辑

## 文档同步
- Architecture.md 变更时必须同步更新 architecture-diagram.html
- 涉及模块新增/删除、数据流变化、约束变更时，架构图必须同步修改
