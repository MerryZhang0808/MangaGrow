# Peter Steinberger 的 AI 开发方法论 vs MangaGrow SDD 流程：差距分析

## Context

对比 Peter Steinberger（steipete）分享的 AI 编程工作流方法论与 MangaGrow 项目当前的 SDD（Spec-Driven Development）流程，找出差距和改进方向。

参考博客：
- https://steipete.me/posts/just-talk-to-it
- https://steipete.me/posts/2025/shipping-at-inference-speed
- https://steipete.me/posts/2025/optimal-ai-development-workflow

---

## 一、核心哲学差异

| 维度 | Peter 的方式 | MangaGrow SDD |
|------|-------------|---------------|
| **开发哲学** | "Just Talk To It" — 直接对话，迭代探索 | 文档驱动 — 先想清楚，层层审批 |
| **规划方式** | 轻量级，边做边调，在构建中探索设计 | 重量级，5 层瀑布式流程，每层需审批 |
| **速度目标** | "推理速度级别的发布" — 速度最大化 | 质量优先 — 文档完备性最大化 |
| **失败应对** | "从不还原，让模型修改或改变方向" | 降级策略预设，但流程本身不灵活 |

**Peter 的核心观点**：他明确说自己**从"规范驱动开发"（详细设计→构建）转向了"迭代讨论"**。这恰好是你当前流程的对立面。

---

## 二、具体差距分析

### 1. 流程重量级 vs 轻量迭代（最大差距）

**你的现状**：
- 5 层强制流程：Product-Spec → Architecture → Tasks → Code → QA
- 每层需要用户审批才能进下一层
- "任何功能变更都必须走以下流程，不允许跳步"
- 一个小功能可能需要更新 3 个文档才能开始写代码

**Peter 的做法**：
- 小任务直接执行，大任务才写计划
- 计划也只是给 GPT-5-Pro 审查一下，不是正式文档
- "实时看 UI 更新，动态迭代"
- 约 800 行 CLAUDE.md 涵盖所有约束，不需要多层文档

**差距**：你的流程对于一个个人/小团队项目来说**过度工程化**了。Peter 管理的是 30 万行代码库，但他的流程反而比你轻得多。

### 2. 并行执行 vs 串行等待

**你的现状**：
- 单一 Claude Code 会话，串行执行 /code T-XX
- 每个任务完成后才能开始下一个
- 没有并行代理的概念

**Peter 的做法**：
- 3×3 终端网格，同时运行 3-8 个代理
- 不同代理处理不同任务/项目
- 排队功能让代理持续工作
- "小任务 1-2 个代理，清理/测试/UI 工作约 4 个代理"

**差距**：你完全没有利用并行能力。这可能是效率提升最大的地方。

### 3. 上下文管理差异

**你的现状**：
- 大量文档（Product-Spec.md、Architecture.md、Tasks.md、dev-constraints.md、agent-flow-diagram.html...）
- 每次会话都需要加载大量上下文
- Skills 系统增加了额外的提示词层
- CLAUDE.md 本身就很长，加上所有 skills 和 rules

**Peter 的做法**：
- ~800 行 CLAUDE.md，涵盖所有需要的约束
- "提示变得更短"
- 约 50% 的提示包含截图（视觉输入效率更高）
- 移除了 MCP，因为"直接读代码更快"
- "大多数 MCP 应该改为 CLI"

**差距**：你的上下文负担太重。Skills、rules、多层文档都在消耗宝贵的 token 空间。

### 4. 截图/视觉驱动 vs 纯文字描述

**Peter 的做法**：
- 约 50% 的提示包含截图
- "模型能精确定位视觉信息"
- 直接截图 UI bug，一张图胜过千言万语

**你的现状**：
- 主要通过文字描述需求和 bug
- 没有利用视觉输入的工作流

**差距**：视觉输入是一个巨大的效率杠杆，你还没有用上。

### 5. 重构习惯

**Peter 的做法**：
- 投入约 20% 时间用于重构（全部由代理完成）
- 使用 jscpd 检测代码重复、knip 找死代码
- 持续保持代码库健康

**你的现状**：
- 没有定期重构的机制
- /qa 只检查与文档的一致性，不检查代码质量
- dev-constraints.md 有 80+ 条约束规则，但没有自动检测工具

**差距**：缺少代码健康维护的自动化。

### 6. 爆炸半径（Blast Radius）意识

**Peter 的核心概念**：
- 评估每次改动会影响多少文件
- 多个小改动优于少数大改动
- 便于隔离和回滚

**你的现状**：
- Tasks.md 中的任务粒度可能过大
- 没有明确的"改动影响范围"评估机制

---

## 三、你做得好的地方（Peter 也认同的）

1. **约束文件**：你的 dev-constraints.md 类似 Peter 的 agent 配置文件，这个方向是对的
2. **文档化约定**：API 规范、环境配置等写入约束，减少重复犯错
3. **降级策略**：C14、C31、C40 等降级规则体现了健壮性思维
4. **关注点分离**：前后端分层、service 抽象等架构决策是合理的

---

## 四、建议改进方向

### 优先级 1：简化流程（影响最大）
- **合并文档层**：将 Product-Spec + Architecture + Tasks 精简为一个 SPEC.md，只保留关键决策
- **去掉强制审批门禁**：改为"大变更需审批，小变更直接做"
- **废除 skills 系统**：将核心约束直接写入 CLAUDE.md，减少间接层
- Peter 原话："从规范驱动开发转向迭代讨论"

### 优先级 2：利用并行能力
- 开多个终端窗口，同时运行多个 Claude Code 实例
- 不同实例处理不同的独立任务
- 用 git 的原子提交保证各自的改动不冲突

### 优先级 3：善用视觉输入
- 养成截图习惯：UI bug、布局问题、设计意图
- 一张截图 + 一句话 > 三段文字描述

### 优先级 4：精简 CLAUDE.md
- 目标：800 行以内的单一配置文件
- 把 dev-constraints.md 中最重要的规则内联到 CLAUDE.md
- 删除不常触发的规则，只保留高频踩坑的约束
- 移除角色扮演设定（"你是 Merry"），直接给指令

### 优先级 5：建立重构习惯
- 定期让 Claude 检查代码重复和死代码
- 把 /qa 从"文档一致性检查"扩展为"代码健康检查"

---

## 五、一句话总结

**你现在的流程像是在用"企业级瀑布开发"的方式驾驶一个"个人创意项目"。** Peter 的经验告诉我们：对于 AI 辅助开发，轻量迭代 + 并行执行 + 视觉输入 >> 重文档 + 层层审批 + 纯文字交流。

核心转变：**从"文档守门员"变成"快速迭代者"**，让 AI 做更多探索，你做更多决策。

---

## 六、深入讨论：并行执行的实操指南

### 用户问题

> 我想到过这么干，比如一个正在帮我修改 bug，另外是否能启动一个帮忙做新功能开发，但我本人并不是架构师，担心两个功能可能会涉及修改相同的代码文件而不敢试试。

### 核心结论：你不需要是架构师，只需要认识 5 个"禁区文件"

经过对 MangaGrow 项目的完整依赖分析，**真正的冲突风险集中在极少数"枢纽文件"上**。只要不同时改这些文件，并行就是安全的。

### 绝对禁区：这 5 个文件永远不要并行编辑

| 文件 | 为什么危险 | 依赖它的文件数 |
|------|-----------|--------------|
| `comic-growth-record/types.ts` | 前端所有组件和服务都依赖它 | 10+ |
| `server/types.ts` | 后端所有服务和路由都依赖它 | 15+ |
| `server/services/gemini.ts` | 所有 AI 服务的基础（模型常量、重试逻辑） | 5 |
| `server/db/index.ts` | 数据库连接，所有路由依赖 | 3+ |
| `server/index.ts` | 服务器入口，导入所有路由 | 4 |

**记住这 5 个文件名就够了。** 如果两个任务都不涉及这 5 个文件，基本可以放心并行。

### MangaGrow 具体的安全并行组合

#### 场景 1：前端 UI 修改 + 后端独立功能（最推荐入门）

| 窗口 A | 窗口 B |
|--------|--------|
| 修 InputPanel.tsx 的 UI bug | 改 routes/stories.ts 的查询逻辑 |
| 改 DisplayPanel.tsx 的布局 | 优化 characterAnalyzer.ts 的提示词 |
| 调 GrowthAlbum.tsx 的样式 | 修 routes/characters.ts 的 CRUD |

**为什么安全**：前端组件和后端路由/服务之间没有直接文件依赖，只通过 HTTP API 通信。只要不改 API 接口格式，就不会冲突。

#### 场景 2：两个独立的前端组件

| 窗口 A | 窗口 B |
|--------|--------|
| 改 InputPanel.tsx | 改 HistoryPanel.tsx |
| 改 CharacterLibrary.tsx | 改 GrowthAlbum.tsx |
| 改 Button.tsx | 改 OptionsPanel.tsx |

**为什么安全**：这些组件互不导入，各自只被 App.tsx 使用。

#### 场景 3：两个独立的后端服务

| 窗口 A | 窗口 B |
|--------|--------|
| 改 inputAnalyzer.ts | 改 characterAnalyzer.ts |
| 改 storyPipeline.ts | 改 videoAnalyzer.ts |
| 改 routes/stories.ts | 改 routes/characters.ts |

**为什么安全**：这些服务之间没有互相导入关系。但注意：不要同时改它们共同依赖的 gemini.ts。

#### 场景 4（危险！避免）

| 窗口 A | 窗口 B | 为什么危险 |
|--------|--------|-----------|
| 改 types.ts | 改任何其他文件 | types.ts 是所有文件的依赖 |
| 改 gemini.ts | 改 storyPipeline.ts | storyPipeline 导入 gemini |
| 改前端 apiClient.ts | 改后端 routes/ai.ts | API 接口必须两端同步 |
| 改 App.tsx 的 props | 改子组件 | props 接口必须匹配 |

### 实操步骤：从 2 个窗口开始

**第一次尝试的最佳方案**：

```
终端窗口 A（bug 修复）：
  cd MangaGrow-latest
  claude
  → "帮我修复 InputPanel 的 xxx bug"

终端窗口 B（新功能）：
  cd MangaGrow-latest
  claude
  → "帮我优化 routes/stories.ts 的 xxx 功能"
```

**检查清单（启动前花 10 秒过一遍）**：
1. 两个任务会改同一个文件吗？→ 如果是，不要并行
2. 涉及上面 5 个禁区文件吗？→ 如果是，不要并行
3. 一个改前端一个改后端？→ 通常安全（除非改 API 接口）

### 冲突了怎么办？

即使真的发生了冲突（两个代理改了同一个文件），**后果也是可控的**：
- Git 会产生合并冲突标记
- 让其中一个 Claude 实例执行 `git diff` 查看冲突
- 告诉它："这个文件有冲突，帮我合并"
- 或者更简单：`git stash` 一个，先提交另一个，再 `git stash pop`

**Peter 的态度**：*"I simply never revert. If something isn't how I like it, I ask the model to change it."* 不要怕冲突，冲突是可以修的。

### 与 Peter 方式的关键区别

Peter 是**手动并行**（多个终端窗口，人工分配任务），而不是自动化的 sub-agent。他明确反对 sub-agent：

> "What others do with subagents, I usually do with separate windows. This gives me complete control and visibility over the context."

**对你的意义**：
- 不需要学习任何自动化编排工具
- 就是开两个终端，各跑一个 claude
- 你的职责是"任务调度员"：决定谁干什么
- 从 2 个窗口起步，熟练后再加到 3-4 个

---

## 七、深入讨论：新功能开发必然跨前后端，怎么并行？

### 用户问题

> 我觉得前后端分开的方法，当我增加新功能的时候，必然涉及前端和后端，任务应该如何下发？

### 核心认知转变：并行的单位不是"前端 vs 后端"，而是"新功能 vs 其他工作"

你说得对，一个新功能几乎一定要同时改前端和后端。所以正确的并行拆法是：

```
窗口 A：完整地做新功能（前端 + 后端一起改）
窗口 B：做与新功能无关的其他事情
```

**不是**把一个功能拆成前端和后端给两个窗口。

### 三种实用的并行模式

#### 模式 1：新功能 + Bug 修复（最常用）

```
窗口 A（新功能 - 完整垂直切片）：
  "帮我实现视频转漫画功能，包括：
   - 后端 videoAnalyzer.ts 的分析逻辑
   - 后端 routes/ai.ts 新增 /api/ai/analyze-video 端点
   - 前端 InputPanel.tsx 增加视频上传入口
   - 前端 inputService.ts 增加 analyzeVideo 调用"

窗口 B（独立 Bug 修复 - 不涉及视频功能的文件）：
  "帮我修复 HistoryPanel 的列表排序 bug"
  或 "优化 GrowthAlbum 的 PDF 导出样式"
  或 "修复 characterAnalyzer 的性别识别提示词"
```

**为什么安全**：窗口 A 改的是视频相关的文件，窗口 B 改的是历史记录/PDF/角色相关的文件，互不交叉。

#### 模式 2：新功能 + 重构/清理

```
窗口 A（新功能）：
  "实现 xxx 新功能"

窗口 B（代码卫生 - 只碰窗口 A 不碰的文件）：
  "帮我检查 posterGenerator.ts 的代码重复，做一次清理"
  或 "给 routes/stories.ts 加上缺失的错误处理"
  或 "优化 styleConfig.ts 的风格提示词"
```

#### 模式 3：新功能的"阶段式并行"（进阶）

当一个大功能可以拆成前后阶段时：

```
阶段 1 — 串行（必须先做）：
  窗口 A："帮我在 server/types.ts 中定义新功能的类型，
          并在 server/services/ 中实现核心后端逻辑"
  窗口 B：做无关的其他任务

阶段 2 — 并行（后端 API 就绪后）：
  窗口 A："帮我实现前端 UI 组件和 service 调用"
  窗口 B："帮我给刚写好的后端服务加上测试"
       或 "帮我更新 agent-flow-diagram.html 同步新的 API 流程"
```

**关键洞察**：types.ts 的修改是"阻塞点"，必须先完成。一旦类型和后端 API 定义好了，前端开发和测试/文档就可以并行。

### 给非架构师的判断口诀

下发任务前，问自己一个问题：

> **"窗口 B 的任务，跟窗口 A 正在改的功能模块有没有关系？"**

- **没关系** → 放心并行（比如 A 做视频功能，B 修 PDF 导出）
- **有关系但改不同文件** → 小心并行（确认不改同一个文件）
- **要改同一个文件** → 不要并行，排队做

不需要理解架构。**只需要知道两个任务"改的是不是同一堆文件"**。不确定的时候，直接问 Claude："我要做 X 功能和 Y 修复，它们会改到同一个文件吗？"

### MangaGrow 的功能模块隔离地图

你的项目天然有几块互不干扰的"领地"：

```
┌─────────────────────────────────────────────────┐
│  领地 A：故事生成管线                              │
│  storyPipeline.ts, imageGenerator.ts,            │
│  DisplayPanel.tsx, storyService.ts               │
├─────────────────────────────────────────────────┤
│  领地 B：角色系统                                  │
│  characterAnalyzer.ts, routes/characters.ts,     │
│  CharacterLibrary.tsx, characterService.ts       │
├─────────────────────────────────────────────────┤
│  领地 C：输入分析（照片/视频）                      │
│  inputAnalyzer.ts, videoAnalyzer.ts,             │
│  InputPanel.tsx, inputService.ts                 │
├─────────────────────────────────────────────────┤
│  领地 D：历史记录 & PDF                            │
│  routes/stories.ts, HistoryPanel.tsx,            │
│  GrowthAlbum.tsx, pdfGenerator.ts                │
├─────────────────────────────────────────────────┤
│  领地 E：基础设施（禁止并行编辑！）                  │
│  types.ts(x2), gemini.ts, db/index.ts,           │
│  server/index.ts, apiClient.ts, App.tsx          │
└─────────────────────────────────────────────────┘
```

**规则极其简单**：
- 在不同"领地"内的工作 → 可以并行
- 在同一个"领地"内的工作 → 不要并行
- 涉及"领地 E 基础设施"的工作 → 单独串行做完再开其他任务

### 实际举例：假设你要加"视频转漫画"+ 修"角色头像 bug"

```
✅ 可以并行：
  窗口 A（领地 C）："实现视频上传和关键帧提取"
    → 改 videoAnalyzer.ts, InputPanel.tsx, inputService.ts
  窗口 B（领地 B）："修复角色头像比例变形的 bug"
    → 改 characterAnalyzer.ts, CharacterLibrary.tsx

❌ 不可以并行：
  窗口 A（领地 C）："实现视频上传"
  窗口 B（领地 C）："优化照片分析的提示词"
    → 两者都可能改 inputAnalyzer.ts 或 InputPanel.tsx
```

### 总结：你需要的心智模型

```
并行 ≠ 把一个功能拆给两个窗口
并行 = 一个窗口做完整的新功能，另一个窗口做无关的其他事
判断标准 = 两个任务改的文件有没有交集
不确定时 = 直接问 Claude
```

---

## 八、深入讨论：判断错了怎么办？Git 是你的安全网

### 用户问题

> 拆分几个窗口是灵活的完全依赖我自己，我虽然不如 Peter 从架构层面分开，但只要会再开个窗口，就能灵活判断。即使判断错了，Git 会发现吗？

### 答案：会的，Git 100% 会拦住你

你根本不需要担心"判断错了会悄悄搞坏代码"。Git 有三层自动保护：

#### 第 1 层：冲突检测（自动）

两个窗口改了同一个文件的同一段代码时，第二个提交会直接报错：

```
CONFLICT (content): Merge conflict in server/services/gemini.ts
Automatic merge failed; fix conflicts and then commit the result.
```

**不会静默覆盖，不会丢代码。** Git 会把两边的修改都保留在文件里，用 `<<<<<<<` 和 `>>>>>>>` 标记出来。

#### 第 2 层：改了同文件但不同位置（自动合并）

两个窗口改了同一个文件，但改的是不同位置（比如一个改第 10 行，一个改第 100 行），Git 会**自动合并成功**。这种情况连冲突都不会有。

#### 第 3 层：未提交的修改（最常见的情况）

如果两个 Claude 实例在同一目录工作，一个保存了文件，另一个也要改同一个文件时：
- Claude 在编辑前会先读文件，读到的是最新内容（包含另一个窗口的修改）
- 大多数情况下它会基于最新内容继续编辑，不会覆盖

### 冲突发生后的修复流程（30 秒搞定）

```
方法 1 — 让 Claude 修（最简单）：
  "这个文件有合并冲突，帮我看看两边的修改，合并一下"

方法 2 — 暂存一个（稳妥）：
  git stash          # 暂存当前窗口的修改
  # 让另一个窗口先提交
  git stash pop      # 恢复暂存，手动合并

方法 3 — 回退单个文件（最坏情况）：
  git diff 文件名     # 先看看改了什么
  git checkout -- 文件名  # 回退这一个文件，重新让 Claude 改
```

### 核心心态

Peter 的原话：*"I simply never revert. If something isn't how I like it, I ask the model to change it."*

翻译成你的场景：
- **不要怕犯错** — Git 会告诉你
- **不要手动修冲突** — 让 Claude 修
- **不要过度分析** — 先开两个窗口试试，遇到问题再调整

**你的策略应该是"先干再说"而不是"想清楚再干"。** 这恰好也是 Peter 最核心的方法论转变。

---

## 九、深入讨论：自动化验证改造方案

### 用户问题

> Peter 提到自动化验证的重要性，而我的项目确实这点很不好，结合之前的分析，自动化改造方案详细讲讲。

### 当前现状：零自动化

经过完整扫描，MangaGrow 项目的自动化验证基础设施现状：

| 验证维度 | 状态 | 说明 |
|---------|------|------|
| 单元/集成测试 | ❌ 无 | 无测试文件，无测试框架 |
| ESLint 代码检查 | ❌ 无 | 无配置，无依赖 |
| Prettier 格式化 | ❌ 无 | 无配置 |
| TypeScript 严格模式 | ⚠️ 一半 | 后端 strict:true，前端未开启 |
| Pre-commit hooks | ❌ 无 | 仅有 .sample 文件 |
| CI/CD 流水线 | ❌ 无 | 无 GitHub Actions |
| 代码重复检测 | ❌ 无 | 无 jscpd |
| 死代码检测 | ❌ 无 | 无 knip |

测试工作完全靠 `/tests` 目录下的手动文档（QA-Report.md、Test-Cases.md）。

### Peter 的自动化策略

Peter 的方法不是"传统 CI/CD 全家桶"，而是**用最小的自动化获得最大的保护**：

1. **ast-grep 作为 Git hook**（他最强调的）：
   > *"If you don't know or don't use ast-grep as codebase linter, stop here and ask your model to set this up as a git hook to block commits"*

2. **TypeScript 类型检查**：编译时自动发现类型错误

3. **ESLint + React 编译器插件**：自动发现 React 反模式

4. **在同一上下文中写测试**：
   > *"Ask the model to write tests after each feature/fix is done. Use the same context. This will lead to far better tests, and likely uncover a bug in your implementation."*

5. **选择性测试**：*"Bigger changes always get tests"*，小改动不强求

### 为你设计的自动化改造方案（4 个阶段）

#### 阶段 1：TypeScript 编译守门（1 小时搞定，收益最大）

**做什么**：让 TypeScript 成为你的第一道自动防线。

```
步骤 1：前端开启 strict 模式
  修改 comic-growth-record/tsconfig.json，加入 "strict": true
  让 Claude 修复所有类型错误

步骤 2：在 package.json 中加入 typecheck 脚本
  根目录 package.json：
  "scripts": {
    "typecheck": "cd comic-growth-record && npx tsc --noEmit && cd ../server && npx tsc --noEmit"
  }

步骤 3：每次让 Claude 改完代码后，跑一下
  npm run typecheck
```

**为什么最优先**：类型错误是 AI 代码中最常见的 bug 来源。strict 模式能自动捕获 null/undefined、隐式 any、错误的函数调用等问题。**投入产出比最高。**

#### 阶段 2：Pre-commit 自动拦截（30 分钟搞定）

**做什么**：提交代码时自动检查，防止坏代码入库。

```
步骤 1：安装工具
  npm install -D husky lint-staged

步骤 2：配置 husky
  npx husky init
  # 在 .husky/pre-commit 中写入：
  npx lint-staged

步骤 3：配置 lint-staged（package.json）
  "lint-staged": {
    "comic-growth-record/**/*.{ts,tsx}": ["npx tsc --noEmit --project comic-growth-record/tsconfig.json"],
    "server/**/*.ts": ["npx tsc --noEmit --project server/tsconfig.json"]
  }
```

**效果**：每次 git commit 时自动做类型检查。如果有类型错误，提交会被拦截。这对并行工作尤其重要 — 两个窗口的 Claude 各自提交时都会被自动检查。

#### 阶段 3：ESLint 基础规则（1 小时搞定）

**做什么**：自动捕获常见代码问题。

```
步骤 1：安装
  cd comic-growth-record && npm install -D eslint @eslint/js typescript-eslint
  cd ../server && npm install -D eslint @eslint/js typescript-eslint

步骤 2：让 Claude 生成配置
  "帮我配置 ESLint flat config，规则保持最小：
   - 不要加太多规则，只用 recommended
   - 加入 no-unused-vars（warn）
   - 加入 no-console（warn，允许 warn 和 error）"

步骤 3：加入 lint-staged
  "*.{ts,tsx}": ["eslint --fix", "tsc --noEmit"]
```

**Peter 的原则**：不要一次性加 100 条规则。从 recommended 开始，遇到反复出现的 bug 再加针对性规则。

#### 阶段 4：关键路径测试（按需渐进）

**做什么**：不追求覆盖率，只给最关键的逻辑加测试。

```
步骤 1：安装 Vitest（前端）
  cd comic-growth-record && npm install -D vitest

步骤 2：安装测试框架（后端）
  cd server && npm install -D vitest

步骤 3：只给这些写测试（优先级排序）
  ① server/services/gemini.ts    — withRetry 重试逻辑
  ② server/services/storyPipeline.ts — 4 步管线的顺序和降级
  ③ server/services/imageStorage.ts  — 文件路径和命名逻辑
  ④ comic-growth-record/utils/imageUtils.ts — 图片压缩/解析
```

**Peter 的做法**：
> *"Ask the model to write tests after each feature/fix is done. Use the same context."*

翻译成你的操作方式：每次让 Claude 完成一个功能后，紧接着说：
```
"帮这个功能写测试，重点测试边界情况和降级逻辑"
```

**不要单独开会话写测试**。在同一个上下文中写，Claude 知道刚才改了什么，测试质量会好得多。

### 你不需要的（避免过度工程化）

| 不需要 | 为什么 |
|--------|--------|
| E2E 测试（Playwright/Cypress） | 你是个人项目，手动点一下更快 |
| 100% 测试覆盖率 | Peter 说 "UI tweaks may not warrant tests" |
| 复杂 CI/CD 流水线 | 你是直接 commit to main 的工作方式 |
| SonarQube 等重型工具 | 杀鸡用牛刀 |
| 每个函数都写测试 | 只测关键路径和容易出 bug 的地方 |

### 实施路线图

```
第 1 天（立刻做）：
  ✅ 前端开启 TypeScript strict 模式
  ✅ 加 npm run typecheck 脚本
  → 效果：编译时自动发现 60%+ 的低级错误

第 2 天（趁手热做）：
  ✅ 安装 husky + lint-staged
  ✅ pre-commit 跑 tsc --noEmit
  → 效果：每次提交自动拦截类型错误，并行工作时也有保护

第 1 周内（有空就做）：
  ✅ 加 ESLint recommended 规则
  ✅ 把 eslint --fix 加入 lint-staged
  → 效果：自动修复简单问题，发现潜在 bug

按需（新功能或修 bug 时顺手做）：
  ✅ 给关键服务写测试（gemini.ts, storyPipeline.ts）
  ✅ 每次让 Claude 完成功能后，同一上下文中追加测试
  → 效果：逐步积累测试覆盖，不额外花时间

不做（至少现在不做）：
  ❌ E2E 测试
  ❌ GitHub Actions CI
  ❌ 测试覆盖率报告
```

### 自动化与并行工作的关系

自动化验证让并行工作更安全：

```
没有自动化时：
  窗口 A 改了代码 → 手动检查 → 可能漏掉问题
  窗口 B 改了代码 → 手动检查 → 可能漏掉问题
  两边合在一起 → 可能有隐藏 bug

有 pre-commit hook 后：
  窗口 A 改了代码 → git commit → 自动 typecheck → 通过才入库 ✅
  窗口 B 改了代码 → git commit → 自动 typecheck → 类型冲突被拦截 🛑
  → 每个窗口的产出都经过了自动验证
```

**这就是 Peter 强调 ast-grep git hook 的原因** — 它是并行工作的"质量守门员"，让你不用操心每个窗口的代码质量。

---

## 十、深入讨论：TypeScript strict、Lint、Hook 到底是什么？

### 用户问题

> 我其实不懂前端 TypeScript，lint 和 hook 这些具体是什么意思，Peter 确实强调了这些，能帮忙详细解释下，然后再确认下我的项目是否都需要？

### 用大白话解释这三样东西

#### 1. TypeScript Strict 模式 — "严格的语法检查老师"

**类比**：写作文时，"宽松老师"只看你写没写完；"严格老师"还会检查你有没有错别字、语句是否通顺、前后是否矛盾。

**具体做什么**：你的代码是用 TypeScript 写的（一种带"类型标注"的 JavaScript）。Strict 模式就是让 TypeScript 编译器更严格地检查代码。

**举例 — 没有 strict 时能通过的代码**：
```typescript
function getUser(id) {          // id 是什么类型？不知道，但不报错
  return users.find(u => u.id === id)  // 找不到时返回 undefined
}

const name = getUser(123).name   // 如果 getUser 返回 undefined，这里会崩溃！
                                  // 但没有 strict，编译器不警告你
```

**开启 strict 后**：
```typescript
function getUser(id) {           // ❌ 报错：参数 id 没有类型标注
  return users.find(u => u.id === id)
}

const user = getUser(123)        // TypeScript 知道这可能是 undefined
const name = user.name           // ❌ 报错：user 可能是 undefined，你得先判断
const name = user?.name          // ✅ 安全写法：如果 user 是 undefined 就返回 undefined
```

**对你的价值**：AI 生成的代码经常忘记处理 null/undefined 的情况。strict 模式能**在代码保存的瞬间**就告诉你"这里有隐患"，而不是等运行时崩溃了才发现。

**你的项目现状**：后端已开启 strict，前端没有。意味着**前端代码缺少这层保护**。

---

#### 2. ESLint — "代码规范巡逻员"

**类比**：TypeScript strict 检查的是"语法有没有错"（会不会崩溃）。ESLint 检查的是"写法有没有问题"（会不会埋坑）。就像交警：不只抓违法的，还管你有没有压线、有没有打转向灯。

**具体做什么**：自动扫描代码，找出"不会报错但可能有问题"的写法。

**举例**：
```typescript
// ESLint 会警告的问题：

const x = 5                      // ⚠️ 定义了变量但从没用过（no-unused-vars）
console.log("debug info")         // ⚠️ 生产代码里留了 console.log（no-console）
if (a = 5) { ... }               // ⚠️ 你可能想写 === 而不是 =（no-cond-assign）

// ESLint 能自动修复的问题（--fix）：
const a = "hello"                 // 自动改成统一的引号风格
import { unused } from './mod'    // 自动删除未使用的导入
```

**对你的价值**：Claude 写代码时经常留下未使用的变量、多余的 import、console.log 调试语句。ESLint 能自动清理这些"垃圾"，**保持代码干净**。

**你的项目现状**：完全没有 ESLint。所有代码规范靠 Claude 自觉和你的 dev-constraints.md 文字约束。

---

#### 3. Git Hook（Pre-commit）— "提交代码前的安检门"

**类比**：你坐飞机要过安检。Git hook 就是代码世界的安检 — 你每次 `git commit` 提交代码时，它会自动运行一些检查，**通过了才允许提交，不通过就拦住你**。

**具体做什么**：

```
你平时的流程：
  写代码 → git commit → 代码入库 ✅（无论代码好坏）

加了 pre-commit hook 后：
  写代码 → git commit → 【自动安检】→ 通过 → 代码入库 ✅
                          ↓
                        不通过 → 提交被拦截 🛑（告诉你哪里有问题）
```

**安检里可以放什么**：
- TypeScript 类型检查（代码有没有类型错误？）
- ESLint 检查（代码有没有规范问题？）
- 你想放什么都行

**对你的价值**：特别是在并行工作时。两个窗口的 Claude 各自改代码、各自提交，**每次提交都会过安检**。哪个窗口写出了有问题的代码，安检会自动拦住，不让坏代码进入代码库。

**你的项目现状**：完全没有 hook。Claude 提交代码时不经过任何自动检查。

---

#### 4. 自动化测试（Vitest）— "模拟用户点击的机器人"

**类比**：你每次改完代码都会手动打开网页试一下，看看功能是否正常。自动化测试就是写一段代码，让机器代替你做这件事。

**举例**：
```typescript
// 你手动测试的过程：
// 1. 传入一张图片
// 2. 看看压缩后的大小有没有变小
// 3. 看看格式是不是对的

// 自动化测试用代码模拟这个过程：
test('图片压缩后尺寸应该缩小', () => {
  const original = 读取一张1MB的测试图片()
  const compressed = compressImage(original, { maxWidth: 800, quality: 0.6 })
  expect(compressed.size).toBeLessThan(original.size)
})

test('withRetry 应该重试 3 次', () => {
  let callCount = 0
  const failTwice = () => {
    callCount++
    if (callCount < 3) throw new Error('API 超时')
    return '成功'
  }
  const result = withRetry(failTwice, 3)
  expect(result).toBe('成功')
  expect(callCount).toBe(3)
})
```

**对你的价值**：你改了 `gemini.ts` 的重试逻辑后，不用手动触发 API 调用来验证，跑一下测试就知道改对没改对。

**你的项目现状**：零测试。所有验证靠手动操作 + 截图记录在 /tests 目录。

---

### 这四样东西的关系

```
                    你写代码（或 Claude 写代码）
                              ↓
    ┌─────────────────────────────────────────┐
    │  TypeScript Strict                       │
    │  "这行代码有类型错误！"                     │  ← 写代码时实时提示
    │  相当于：Word 的拼写检查红色波浪线            │
    └─────────────────────────────────────────┘
                              ↓
    ┌─────────────────────────────────────────┐
    │  ESLint                                  │
    │  "这个变量定义了但没用到"                    │  ← 写代码时实时提示
    │  "这里 console.log 忘删了"                 │
    │  相当于：Word 的语法检查蓝色波浪线            │
    └─────────────────────────────────────────┘
                              ↓
                         git commit
                              ↓
    ┌─────────────────────────────────────────┐
    │  Pre-commit Hook（安检门）                 │
    │  自动跑 TypeScript + ESLint 检查           │  ← 提交时自动拦截
    │  不通过 → 🛑 拒绝提交                      │
    │  通过   → ✅ 允许入库                      │
    │  相当于：发邮件前的"确认收件人"弹窗           │
    └─────────────────────────────────────────┘
                              ↓
    ┌─────────────────────────────────────────┐
    │  自动化测试                                │
    │  "压缩函数结果对不对？重试逻辑正常吗？"       │  ← 手动或定期运行
    │  相当于：出厂前的产品抽检                     │
    └─────────────────────────────────────────┘
```

### 你的项目到底需要哪些？

| 工具 | 是否需要 | 理由 |
|------|---------|------|
| **TypeScript strict** | **必须** | 你的前端没开，这是防 bug 的最低成本方式。Claude 写的代码经常有 null 隐患，strict 能自动抓出来。1 小时搞定。 |
| **Pre-commit hook** | **强烈建议** | 尤其你要开始并行工作，这是自动安检门。没有它，两个 Claude 窗口提交的代码没人检查。30 分钟搞定。 |
| **ESLint** | **建议但不急** | 锦上添花。能自动清理 Claude 留下的垃圾代码（未使用变量、多余 import）。可以第二周再加。 |
| **自动化测试** | **按需** | 不用专门花时间写。以后每次让 Claude 做完功能，顺口说"帮这个写个测试"就行，逐步积累。 |

### 最终建议：先做 2 件事就够了

```
今天做：
  告诉 Claude："帮我前端开启 TypeScript strict 模式，修复所有报错"
  → 效果：以后 Claude 写出有类型隐患的代码，编辑器会实时标红

明天做：
  告诉 Claude："帮我配置 husky pre-commit hook，提交时自动跑 tsc 类型检查"
  → 效果：以后 git commit 时自动过安检，坏代码进不了代码库
```

其他的以后再说。Peter 的核心原则也是**最小化** — 不要一次搞太多。

**用户确认**：四样都需要，一次性改造到位。

---

## 十一、完整改造方案（修改前 vs 修改后对比）

### 用户问题

> 这四点我都需要，整合给出修改方案，需要明确标识出修改前和修改后的对比分析。

### 总览：要改什么

| 文件 | 操作 | 修改内容 |
|------|------|---------|
| `.claude/CLAUDE.md` | 编辑 | 简化流程、去角色扮演、增加自动化指令 |
| `.claude/rules/dev-constraints.md` | 编辑 | 精简规则、删废弃约束、增加自动化和并行章节 |
| `comic-growth-record/tsconfig.json` | 编辑 | 加 `"strict": true` |
| `comic-growth-record/package.json` | 编辑 | 加 typecheck/lint/test 脚本 + eslint/vitest 依赖 |
| `server/package.json` | 编辑 | 加 typecheck/lint/test 脚本 + eslint/vitest 依赖 |
| `package.json`（根目录） | 编辑 | 加 typecheck/lint 脚本 + husky/lint-staged 依赖 |
| `comic-growth-record/eslint.config.js` | **新增** | 前端 ESLint 配置 |
| `server/eslint.config.js` | **新增** | 后端 ESLint 配置 |
| `.husky/pre-commit` | **新增** | Pre-commit hook 脚本 |
| 前端所有 .ts/.tsx 文件 | 编辑 | 修复 strict 模式产生的类型错误 |

### 当前配置体量 vs 改造后

```
修改前：2940 行配置（CLAUDE.md 149 行 + dev-constraints 91 行 + 15 个 skill 文件 2700 行）
修改后：~2830 行配置（CLAUDE.md ~120 行 + dev-constraints ~80 行 + skill 文件不变 2700 行）
        + 自动化工具链（TypeScript strict + ESLint + Husky + Vitest）

区别：配置行数略减，但增加了机器自动验证替代人工文档审查。
```

---

### 对比 1：CLAUDE.md 开发流程

```
═══ 修改前 ═══

[SDD 流程 - Spec-Driven Development]
    任何功能变更都必须走以下流程，不允许跳步：

    Layer 1: 需求（Product-Spec.md）→ 用户审批
    Layer 2: 架构设计（Architecture.md）→ 用户审批
    Layer 3: 任务拆分（Tasks.md）→ 用户审批
    Layer 4: 代码实现（/code）
    Layer 5: 验证（/qa）

═══ 修改后 ═══

[开发流程 - 按改动大小选择]

    小改动（bug 修复、UI 调整、提示词优化、单文件修改）：
        → 直接改代码，遵守 dev-constraints.md
        → 改完跑 npm run typecheck 验证

    中改动（新增 API、新组件、修改数据流）：
        → 先说明要改什么、影响哪些文件
        → 用户确认后改代码

    大改动（新功能模块、架构变更、数据库 schema）：
        → 更新 Product-Spec.md + Architecture.md
        → 用户确认后改代码
```

### 对比 2：CLAUDE.md 角色与初始化

```
═══ 修改前 ═══

[角色]
    你是 Merry，MangaGrow 的开发协调者。
    你的职责是确保开发流程被正确遵守：需求先想清楚，架构先设计好，代码才开始写。
    始终使用中文交流。

[初始化]
    "👋 我是 Merry，MangaGrow 的开发协调者。
    这个项目采用 SDD（Spec-Driven Development）流程：
    需求 → 架构设计 → 任务拆分 → 代码实现 → 验证
    每一步都需要你审批通过才能进入下一步。
    💡 输入 /help 查看所有指令"

═══ 修改后 ═══

[角色]
    始终使用中文交流。

[初始化]
    执行 [项目状态检测与路由]
```

### 对比 3：CLAUDE.md Skill 调用规则

```
═══ 修改前（20 行）═══

[Skill 调用规则]
    - **product-spec-builder**（自动触发）：
        • 用户表达想要开发产品、应用、工具时
        • 用户描述产品想法、功能需求时
        • 用户表达要修改 UI、改界面、增加功能、改需求时

    - **architect**（自动触发）：
        • Product-Spec.md 更新完成后
        • 用户提出技术方案相关问题时
        • 用户输入 /arch 时

    - **coder**（手动触发）：
        • 用户输入 /code 或 /code T-XX 时

    - **qa**（手动触发）：
        • 用户输入 /qa 时

    - **api-tester**（手动触发）：
        • 用户输入 /api-test 时
        • 需要诊断 API 连通性问题时
        • 检测代理配置、模型可用性、网络连通性

═══ 修改后（5 行）═══

[Skill 调用]
    /prd → product-spec-builder（需求变更时）
    /arch → architect（架构/任务变更时）
    /code [T-XX] → coder（代码实现）
    /qa → qa（质量验证）
    /api-test → api-tester（API 诊断）
```

### 对比 4：CLAUDE.md 指令集

```
═══ 修改前（11 条）═══

    /prd, /arch, /tasks, /code, /qa, /api-test,
    /check, /run, /stop, /status, /help

═══ 修改后（14 条，新增 3 条）═══

    新增：
    /typecheck — 运行前后端 TypeScript 类型检查
    /lint — 运行 ESLint 代码检查
    /test — 运行自动化测试
```

### 对比 5：dev-constraints.md 文档优先规则

```
═══ 修改前 ═══

## 文档优先
- 修改代码前，先确认该修改符合 Architecture.md 中的技术方案
- 如果 Architecture.md 中没有覆盖该修改，先更新 Architecture.md 再写代码
- 新增 service 文件必须先在 Architecture.md 的模块设计中定义

═══ 修改后 ═══

## 文档同步
- 新增 service 文件或 API 端点时，在 Architecture.md 中记录
- 小改动（bug 修复、提示词优化）无需更新文档
```

### 对比 6：dev-constraints.md 删除废弃约束

```
═══ 修改前（保留废弃注释）═══

- 不存在 PUT /api/stories/:id，禁止任何 debounce 同步逻辑（C28 已废除）
- 历史记录严格只读，不支持将历史故事加载到创作面板（C33 已废除 v1.8）
- C32（侧边栏约束）已废除

═══ 修改后 ═══

（直接删除这三行，不留痕迹）
```

### 对比 7：dev-constraints.md 新增自动化和并行章节

```
═══ 修改前 ═══

（无此章节）

═══ 修改后（新增两个章节）═══

## 自动化验证
- 代码修改后必须通过 npm run typecheck（前后端类型检查）
- 提交前 pre-commit hook 会自动运行类型检查和 ESLint
- 新功能完成后，在同一上下文中追加关键路径测试

## 并行工作安全
禁止并行编辑的枢纽文件（多窗口时同一时间只能有一个窗口修改）：
- comic-growth-record/types.ts
- server/types.ts
- server/services/gemini.ts
- server/db/index.ts
- server/index.ts

安全并行的功能领地：
- 领地 A（故事管线）：storyPipeline, imageGenerator, DisplayPanel
- 领地 B（角色系统）：characterAnalyzer, routes/characters, CharacterLibrary
- 领地 C（输入分析）：inputAnalyzer, videoAnalyzer, InputPanel
- 领地 D（历史/PDF）：routes/stories, HistoryPanel, GrowthAlbum
```

### 对比 8：前端 tsconfig.json

```json
// ═══ 修改前 ═══
{
  "compilerOptions": {
    "target": "ES2022",
    // ... 其他配置 ...
    "noEmit": true
    // 没有 strict，没有任何严格检查
  }
}

// ═══ 修改后 ═══
{
  "compilerOptions": {
    "target": "ES2022",
    // ... 其他配置 ...
    "noEmit": true,
    "strict": true     // ← 新增这一行
  }
}
```

### 对比 9：根目录 package.json

```json
// ═══ 修改前 ═══
{
  "scripts": {
    "dev": "concurrently ...",
    "dev:frontend": "...",
    "dev:backend": "...",
    "install:all": "..."
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}

// ═══ 修改后 ═══
{
  "scripts": {
    "dev": "concurrently ...",
    "dev:frontend": "...",
    "dev:backend": "...",
    "install:all": "...",
    "typecheck": "cd comic-growth-record && npx tsc --noEmit && cd ../server && npx tsc --noEmit",
    "lint": "cd comic-growth-record && npx eslint . && cd ../server && npx eslint .",
    "lint:fix": "cd comic-growth-record && npx eslint --fix . && cd ../server && npx eslint --fix .",
    "prepare": "husky"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  },
  "lint-staged": {
    "comic-growth-record/**/*.{ts,tsx}": ["eslint --fix"],
    "server/**/*.ts": ["eslint --fix"]
  }
}
```

### 对比 10：前端 package.json

```json
// ═══ 修改前 ═══
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    // 现有依赖...
  }
}

// ═══ 修改后 ═══
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "test": "vitest run"
  },
  "devDependencies": {
    // 现有依赖...
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 对比 11：后端 package.json

```json
// ═══ 修改前 ═══
{
  "scripts": {
    "dev": "node --no-warnings=ExperimentalWarning --import tsx index.ts",
    "dev:watch": "tsx watch index.ts"
  },
  "devDependencies": {
    // 现有依赖...
  }
}

// ═══ 修改后 ═══
{
  "scripts": {
    "dev": "node --no-warnings=ExperimentalWarning --import tsx index.ts",
    "dev:watch": "tsx watch index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "test": "vitest run"
  },
  "devDependencies": {
    // 现有依赖...
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 对比 12：新增文件

```
═══ 修改前：不存在 ═══

═══ 修改后：3 个新文件 ═══

1. comic-growth-record/eslint.config.js — 前端 ESLint 配置（最小规则集）
2. server/eslint.config.js — 后端 ESLint 配置（最小规则集）
3. .husky/pre-commit — 提交前自动运行类型检查 + lint
```

### 实施顺序

```
Phase 1 — 基础设施搭建：
  ① 根目录 package.json 加脚本和 husky/lint-staged 依赖
  ② npm install
  ③ npx husky init，配置 .husky/pre-commit

Phase 2 — TypeScript strict（工作量最大）：
  ④ 前端 tsconfig.json 加 strict: true
  ⑤ 运行 tsc --noEmit 查看所有类型错误
  ⑥ 逐文件修复类型错误

Phase 3 — ESLint：
  ⑦ 两端安装 eslint 依赖
  ⑧ 创建 eslint.config.js
  ⑨ eslint --fix 自动修复 + 手动修复剩余问题

Phase 4 — 测试框架：
  ⑩ 两端安装 vitest
  ⑪ 加 test 脚本（暂不写测试，以后逐步积累）

Phase 5 — 流程文档更新：
  ⑫ 重写 CLAUDE.md
  ⑬ 精简 dev-constraints.md

Phase 6 — 验证：
  ⑭ npm run typecheck — 通过
  ⑮ npm run lint — 通过
  ⑯ 改一个文件 → git commit → 确认 hook 拦截生效
```
