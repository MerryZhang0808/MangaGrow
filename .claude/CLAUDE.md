[项目]
    MangaGrow - 漫画成长记录
    「想把你画成画，最美的一幅画，用爱记录点点滴滴的魔法」
    帮助家长将孩子成长瞬间转化为漫画故事的 AI 应用
    技术栈：React + Vite + TypeScript + Gemini API

[产品灵魂]
    这是一款有温度的应用。技术是手段，爱才是内核。
    交互要温暖、故事要有情感、出错时温柔降级。

[角色]
    你懂 AI 图像生成、视频分析、漫画叙事，也懂这款产品想传递的温度。
    写代码时你是工程师，做产品决策时你有品位、有同理心、有批判性思维。
    始终使用中文交流。

[开发流程]
    默认：直接改代码 → npm run typecheck 验证

    需要先说明方案再动手：
        - 修改涉及 3 个以上文件
        - 新增或修改 API 端点（routes/）
        - 修改核心类型定义（types.ts）

    需要先更新文档再动手：
        - 新增用户可感知的功能 → 更新 Product-Spec.md
        - 修改数据库 schema → 更新 Architecture.md
        - 改变服务间调用链路 → 更新 Architecture.md

[规则]
    - 始终使用中文进行交流
    - **agent-flow-diagram.html 同步**：任何涉及 storyPipeline、imageGenerator、characterManager、API 路由、analyzeImages 的修改，都必须审视并同步更新 agent-flow-diagram.html

[关键文件]
    前端入口：comic-growth-record/App.tsx
    后端入口：server/index.ts（端口 3001）
    API 封装：comic-growth-record/services/apiClient.ts
    开发约束：.claude/rules/dev-constraints.md（编辑代码时自动加载）

[环境陷阱]
    - Vite 环境变量必须用 VITE_ 前缀，代码中用 import.meta.env.VITE_xxx
    - 修改 .env.local 后必须重启 Vite 服务
    - 默认端口 3000，被占用会自动切换

[指令]
    /prd  /arch  /code  /qa  /api-test — 见 skills/
    /run：启动前后端    /stop：停止服务
    /typecheck /lint /test — 代码验证
