# API 测试用例

## 测试环境准备

### 前置条件
- Node.js 已安装
- 项目依赖已安装 (`npm run install:all`)
- 代理软件（如 v2rayN）已启动（如需要）

### 测试文件位置
- 诊断脚本: `server/test-api-diagnosis.ts`
- 模型测试: `server/test-models.ts`
- 模型列表: `server/list-models.ts`
- 截图目录: `test-screenshots/`

---

## TC-01: 环境变量检查

### 目的
验证 .env 文件配置是否正确

### 前置条件
- 项目根目录存在 .env 文件

### 测试步骤
```bash
# 检查 API Key
cat .env | grep GEMINI_API_KEY

# 检查代理配置
cat .env | grep PROXY
```

### 预期结果
| 检查项 | 预期 |
|-------|------|
| GEMINI_API_KEY | 存在且长度 ≥ 30 |
| HTTPS_PROXY | 如需要代理，应配置 |

### 实际结果
- [ ] 通过
- [ ] 失败：__________

---

## TC-02: 代理端口检测

### 目的
检测本地代理服务是否运行

### 测试步骤
```bash
# 运行诊断脚本
cd server && npx tsx test-api-diagnosis.ts
```

### 预期结果
```
✅ v2rayN 代理端口开放: 127.0.0.1:10809
```
或
```
✅ Clash 代理端口开放: 127.0.0.1:7890
```

### 常见代理端口
| 软件 | 默认端口 |
|-----|---------|
| Clash | 7890 |
| v2rayN | 10809 |
| V2Ray | 10808 |
| Shadowsocks | 1080 |

### 实际结果
- [ ] 通过：检测到代理端口 _______
- [ ] 失败：未检测到代理

---

## TC-03: DNS 解析测试

### 目的
验证 DNS 能否解析 Google API 域名

### 测试步骤
```bash
# Windows
nslookup generativelanguage.googleapis.com

# Linux/Mac
dig generativelanguage.googleapis.com
```

### 预期结果
```
✅ DNS 解析成功: 142.250.xx.xx, 142.251.xx.xx...
```

### 实际结果
- [ ] 通过
- [ ] 失败：__________

---

## TC-04: 直接网络连接测试

### 目的
测试能否直接访问 Gemini API（无代理）

### 测试步骤
```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"OK"}]}]}' \
  --max-time 15
```

### 预期结果
- 中国大陆：**预期失败**（需要代理）
- 海外服务器：**预期成功**

### 实际结果
- [ ] 通过：直接连接成功
- [ ] 预期失败：需要代理（正常）
- [ ] 意外失败：__________

---

## TC-05: 代理连接测试

### 目的
验证通过代理能否访问 Gemini API

### 测试步骤
```typescript
// 使用 undici ProxyAgent
import { ProxyAgent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:10809'));

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: 'OK' }] }]
  })
});
```

或运行：
```bash
cd server && npx tsx test-models.ts
```

### 预期结果
```
✅ 代理连接成功! (3135ms)
响应: Great! How can I help you today?
```

### 实际结果
- [ ] 通过：响应正常
- [ ] 失败：__________

---

## TC-06: 文本模型可用性测试

### 目的
验证文本生成模型是否可用

### 测试步骤
```bash
# 获取可用模型列表
cd server && npx tsx list-models.ts

# 测试文本模型
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Say OK"}]}]}' \
  | head -c 200
```

### 预期结果
```
{
  "candidates": [{
    "content": {
      "parts": [{"text": "OK"}]
    }
  }]
}
```

### 验证代码配置
```bash
# 检查代码中的模型配置
grep TEXT_MODEL server/services/gemini.ts
```

预期：`export const TEXT_MODEL = 'gemini-2.5-flash';`

### 实际结果
- [ ] 通过
- [ ] 失败：模型名称需更新为 _______

---

## TC-07: 图片模型可用性测试

### 目的
验证图片生成模型是否可用

### 测试步骤
```bash
# 测试图片生成
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Draw a cute cat"}]}]}' \
  | head -c 300
```

### 预期结果
返回包含图片数据的响应

### 验证代码配置
```bash
grep IMAGE_MODEL server/services/gemini.ts
```

预期：`export const IMAGE_MODEL = 'nano-banana-pro-preview';`

### 可用图片模型
| 模型 | 状态 |
|-----|------|
| nano-banana-pro-preview | ✅ 推荐 |
| gemini-2.5-flash-image | ✅ 备选 |
| gemini-3-pro-image-preview | ✅ 备选 |

### 实际结果
- [ ] 通过
- [ ] 失败：模型名称需更新为 _______

---

## TC-08: 故事生成 API 测试

### 目的
验证后端故事生成接口

### 前置条件
- 后端服务运行中 (`npm run dev:backend`)

### 测试步骤
```bash
curl -s -X POST http://localhost:3001/api/ai/generate-story \
  -H "Content-Type: application/json" \
  -d '{"userInput":"念念今天很开心"}' \
  | head -c 500
```

### 预期结果
```json
{
  "success": true,
  "data": {
    "totalScenes": 3,
    "currentBatch": [
      {
        "sceneNumber": 1,
        "description": "..."
      }
    ]
  }
}
```

### 失败情况
| 错误 | 原因 | 解决 |
|-----|------|-----|
| `fetch failed` | 代理未配置 | 配置 HTTPS_PROXY |
| `404 Not Found` | 模型不可用 | 更新 TEXT_MODEL |

### 实际结果
- [ ] 通过
- [ ] 失败：__________

---

## TC-09: 图片生成 API 测试

### 目的
验证后端图片生成接口

### 前置条件
- 后端服务运行中
- 代理已配置（如需要）

### 测试步骤
```bash
curl -s -X POST http://localhost:3001/api/ai/generate-image \
  -H "Content-Type: application/json" \
  -d '{"script":"可爱的小女孩在微笑","style":"温馨卡通","ratio":"4:3"}'
```

### 预期结果
```json
{
  "success": true,
  "data": {
    "imageUrl": "/api/images/scenes/xxx.jpg"
  }
}
```

### 失败情况
| 错误 | 原因 | 解决 |
|-----|------|-----|
| `Image generation failed: 404` | 模型不可用 | 更新 IMAGE_MODEL |
| `fetch failed` | 代理未配置 | 配置 HTTPS_PROXY |

### 实际结果
- [ ] 通过
- [ ] 失败：__________

---

## TC-10: 端到端浏览器测试

### 目的
通过浏览器进行完整流程测试

### 前置条件
- 前后端服务运行中
- Playwright 可用

### 测试步骤

#### Step 1: 页面加载
```typescript
await page.goto('http://localhost:3000');
// 检查控制台错误
```

#### Step 2: 输入故事
```typescript
await page.getByRole('textbox').fill('念念今天第一次自己拿勺子吃饭，虽然弄得满脸都是米饭，但她一直笑得很开心。');
```

#### Step 3: 生成漫画
```typescript
await page.getByRole('button', { name: 'Generate Comic' }).click();
```

#### Step 4: 等待生成
```typescript
// 等待故事生成 (约 10-30 秒)
await page.waitForSelector('text="未保存"');

// 等待图片生成 (每张约 30-60 秒)
await page.waitForSelector('img[alt="Scene 4"]');
```

#### Step 5: 截图保存
```typescript
await page.screenshot({
  path: 'test-screenshots/e2e-result.png',
  fullPage: true
});
```

### 预期结果
- 页面标题变为故事标题（如"念念第一次吃饭"）
- 显示 4 个分镜场景
- 每个场景有图片和文字描述
- "保存故事"按钮可用

### 验收标准
| 检查项 | 预期 |
|-------|------|
| 故事生成 | ✅ 成功 |
| 图片生成 | ✅ 4张全部成功 |
| 无 JS 错误 | ✅ 控制台无红色错误 |

### 实际结果
- [ ] 通过
- [ ] 部分通过：__________
- [ ] 失败：__________

---

## 测试报告模板

```markdown
# API 测试报告

**测试日期**: YYYY-MM-DD
**测试人员**: [姓名]
**测试环境**: [本地/CI/生产]

## 测试结果汇总

| 用例 | 状态 | 备注 |
|-----|------|-----|
| TC-01 环境变量 | ✅/❌ | |
| TC-02 代理端口 | ✅/❌ | |
| TC-03 DNS 解析 | ✅/❌ | |
| TC-04 直接连接 | ✅/❌ | |
| TC-05 代理连接 | ✅/❌ | |
| TC-06 文本模型 | ✅/❌ | |
| TC-07 图片模型 | ✅/❌ | |
| TC-08 故事 API | ✅/❌ | |
| TC-09 图片 API | ✅/❌ | |
| TC-10 端到端 | ✅/❌ | |

## 问题列表

### 问题 1: [标题]
- **严重程度**: P0/P1/P2
- **重现步骤**: ...
- **预期结果**: ...
- **实际结果**: ...
- **解决方案**: ...

## 截图附件
- test-screenshots/01-xxx.png
- test-screenshots/02-xxx.png

## 结论
- [ ] 所有测试通过，可以发布
- [ ] 存在问题，需要修复后重新测试
```

---

## 快速诊断命令

```bash
# 一键运行完整诊断
cd server && npx tsx test-api-diagnosis.ts

# 快速测试 API 连通性
curl -s http://localhost:3001/api/health && echo " 后端OK"

# 测试故事生成
curl -s -X POST http://localhost:3001/api/ai/generate-story \
  -H "Content-Type: application/json" \
  -d '{"userInput":"测试"}' | jq '.success'

# 测试图片生成
curl -s -X POST http://localhost:3001/api/ai/generate-image \
  -H "Content-Type: application/json" \
  -d '{"script":"测试","style":"温馨卡通"}' | jq '.success'
```
