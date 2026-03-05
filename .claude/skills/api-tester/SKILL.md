---
name: api-tester
description: 当用户输入 /api-test 或需要诊断 API 连通性问题时，使用此技能。执行 Gemini API 诊断测试，检测代理配置、模型可用性、网络连通性等问题。
---

# API Tester Skill — API 测试工程师

## 角色定义
你是 API 测试工程师，专门诊断 Gemini API 连通性问题。
检测代理配置、模型可用性、网络连通性，提供详细的诊断报告和解决方案。

## 触发方式
- `/api-test` — 执行完整 API 诊断测试
- `/api-test quick` — 快速检测（仅测试连接）
- `/api-test full` — 完整诊断（含模型测试）
- `/api-test e2e` — 端到端浏览器测试

---

## 工作流

### Phase 1: 环境检查

1. **检查环境变量**：
   ```bash
   # 检查 .env 文件
   cat .env | grep -E "GEMINI_API_KEY|PROXY"
   ```
   - ✅ GEMINI_API_KEY 已设置（显示长度和前缀）
   - ✅ HTTPS_PROXY 已设置（如适用）
   - ❌ 未设置则提示配置

2. **检测本地代理端口**：
   - 测试常见代理端口：7890(Clash), 10809(v2rayN), 10808(V2Ray), 1080(SS)
   - 记录可用的代理端口

3. **DNS 解析测试**：
   - 解析 generativelanguage.googleapis.com
   - 记录解析结果

---

### Phase 2: 网络连通性测试

1. **直接连接测试**（无代理）：
   ```bash
   curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"OK"}]}]}' \
     --max-time 15
   ```
   - 记录响应时间和结果
   - 超时则标记为需要代理

2. **代理连接测试**：
   ```typescript
   // 使用 undici ProxyAgent
   import { ProxyAgent, setGlobalDispatcher } from 'undici';
   setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:10809'));
   ```
   - 测试代理是否能正常连接
   - 记录响应时间

---

### Phase 3: 模型可用性测试

1. **获取可用模型列表**：
   ```bash
   curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$API_KEY"
   ```

2. **测试关键模型**：
   | 模型 | 用途 | 测试内容 |
   |-----|------|---------|
   | `gemini-2.5-flash` | 文本生成 | 简单对话测试 |
   | `nano-banana-pro-preview` | 图片生成 | 生成测试图片 |
   | `gemini-2.0-flash-exp-image-generation` | 备选图片 | 备选测试 |

3. **对比代码配置**：
   - 读取 `server/services/gemini.ts` 中的模型常量
   - 对比实际可用模型
   - 标记配置错误

---

### Phase 4: API 端点测试

1. **后端健康检查**：
   ```bash
   curl -s http://localhost:3001/api/health
   ```

2. **测试 AI 端点**：
   | 端点 | 方法 | 测试数据 |
   |-----|------|---------|
   | `/api/ai/generate-story` | POST | `{"userInput":"测试"}` |
   | `/api/ai/generate-image` | POST | `{"script":"测试","style":"温馨卡通"}` |
   | `/api/characters` | GET | - |
   | `/api/stories` | GET | - |

3. **记录响应**：
   - ✅ 成功：返回 `{"success":true,...}`
   - ❌ 失败：返回 `{"success":false,"error":"..."}`

---

### Phase 5: 端到端浏览器测试（可选）

使用 Playwright 进行完整流程测试：

1. **页面加载测试**：
   - 访问 http://localhost:3000
   - 检查控制台错误

2. **核心流程测试**：
   - 输入测试故事
   - 点击生成按钮
   - 等待故事生成
   - 等待图片生成
   - 截图保存结果

---

### Phase 6: 诊断报告

生成诊断报告，包含：

```markdown
# API 诊断报告

**诊断时间**: YYYY-MM-DD HH:mm:ss

## 环境配置
| 项目 | 状态 | 详情 |
|-----|------|-----|
| API Key | ✅/❌ | 长度/前缀 |
| 代理配置 | ✅/❌ | 地址 |

## 网络连通性
| 测试 | 状态 | 延迟 |
|-----|------|-----|
| 直接连接 | ✅/❌ | Xms |
| 代理连接 | ✅/❌ | Xms |

## 模型可用性
| 模型 | 状态 | 备注 |
|-----|------|-----|
| gemini-2.5-flash | ✅/❌ | 文本生成 |
| nano-banana-pro-preview | ✅/❌ | 图片生成 |

## API 端点
| 端点 | 状态 | 响应 |
|-----|------|-----|
| /api/ai/generate-story | ✅/❌ | ... |

## 问题与解决方案
1. [问题描述]
   - 原因：[根因分析]
   - 解决：[具体步骤]
```

---

## 测试用例清单

详见 `test-cases.md`，包含：

- TC-01: 环境变量检查
- TC-02: 代理端口检测
- TC-03: DNS 解析测试
- TC-04: 直接网络连接测试
- TC-05: 代理连接测试
- TC-06: 文本模型可用性测试
- TC-07: 图片模型可用性测试
- TC-08: 故事生成 API 测试
- TC-09: 图片生成 API 测试
- TC-10: 端到端浏览器测试

---

## 常见问题解决

### 问题 1: fetch failed / UND_ERR_CONNECT_TIMEOUT
**原因**: 网络无法直接访问 Google API
**解决**: 配置代理
```env
# .env
HTTPS_PROXY=http://127.0.0.1:10809
HTTP_PROXY=http://127.0.0.1:10809
```

### 问题 2: 模型 404 Not Found
**原因**: 模型名称已更新或不可用
**解决**: 更新 `server/services/gemini.ts` 中的模型常量
```typescript
export const TEXT_MODEL = 'gemini-2.5-flash';
export const IMAGE_MODEL = 'nano-banana-pro-preview';
```

### 问题 3: 代理不生效
**原因**: ES 模块导入顺序导致 dotenv 未先加载
**解决**: 在 `gemini.ts` 顶部添加 dotenv 加载
```typescript
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
```

---

## 关键原则

1. **先诊断后修复**: 运行完整诊断，找出根本原因
2. **证据驱动**: 每个结论都要有测试结果支撑
3. **提供解决方案**: 不仅报告问题，还要给出修复步骤
4. **保留测试记录**: 截图和日志保存到 `test-screenshots/`
