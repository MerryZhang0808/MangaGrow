# Gemini API 诊断报告

**诊断时间**: 2026-03-05
**诊断工具**: `server/test-api-diagnosis.ts`

---

## 🔍 诊断结果

### 测试 1: 环境变量 ✅
| 项目 | 状态 | 详情 |
|-----|------|-----|
| GEMINI_API_KEY | ✅ 已设置 | 长度: 39, 前缀: AIzaSyBvVK... |

### 测试 2: DNS 解析 ✅
| 域名 | 状态 | IP |
|-----|------|-----|
| generativelanguage.googleapis.com | ✅ 成功 | 142.250.69.170, 142.251.45.138... |

### 测试 3: 代理环境变量 ⚠️
| 变量 | 状态 |
|-----|------|
| HTTPS_PROXY | ❌ 未设置 |
| HTTP_PROXY | ❌ 未设置 |

### 测试 4: 本地代理检测 ✅
| 代理 | 端口 | 状态 |
|-----|------|------|
| v2rayN | 127.0.0.1:10809 | ✅ 开放 |
| V2Ray | 127.0.0.1:10808 | ✅ 开放 |

### 测试 5: 直接连接 ❌
```
错误: fetch failed (10777ms)
错误代码: UND_ERR_CONNECT_TIMEOUT
```

### 测试 6: 使用代理连接 ✅
```
代理: http://127.0.0.1:10809
结果: 成功! (3182ms)
响应: "Great! How can I help you today?"
```

### 测试 7: 模型可用性
| 模型 | 状态 |
|-----|------|
| gemini-2.5-flash | ✅ 可用 |
| gemini-2.5-flash-lite-preview-09-2025 | ✅ 可用 |
| gemini-2.0-flash | ❌ 不再可用 |

---

## 🚨 发现的问题

### 问题 1: 缺少代理配置 (严重)
**现象**: Node.js 无法直接连接 Google API
**原因**: 浏览器使用系统代理，但 Node.js 不会自动使用
**影响**: 所有 AI 功能不可用

### 问题 2: 模型名称错误 (严重)
**当前配置**:
```typescript
// server/services/gemini.ts
export const TEXT_MODEL = 'gemini-3-flash-preview';      // ❌ 不存在
export const IMAGE_MODEL = 'gemini-3-pro-image-preview'; // ❌ 不存在
```

**可用模型**:
```typescript
export const TEXT_MODEL = 'gemini-2.5-flash';                     // ✅ 可用
export const IMAGE_MODEL = 'gemini-2.5-flash-image-preview-10-2025'; // ✅ 可用 (需要验证)
```

---

## 🔧 解决方案

### 步骤 1: 更新 .env 文件

在 `server/../.env` 添加:
```env
HTTPS_PROXY=http://127.0.0.1:10809
HTTP_PROXY=http://127.0.0.1:10809
```

### 步骤 2: 更新 server/services/gemini.ts

```typescript
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// 配置代理 (解决网络连接问题)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log('[Gemini] Using proxy:', proxyUrl);
}

// C04: Model name constants - 更新为可用模型
export const TEXT_MODEL = 'gemini-2.5-flash';
export const IMAGE_MODEL = 'gemini-2.5-flash-image-preview-10-2025';

// ... 其余代码不变
```

### 步骤 3: 安装 undici (如果未安装)

```bash
cd server
npm install undici
```

### 步骤 4: 重启后端服务

```bash
npm run dev
```

---

## 📝 验证步骤

1. 运行诊断测试:
   ```bash
   cd server && npx tsx test-api-diagnosis.ts
   ```

2. 测试生成功能:
   - 打开浏览器访问 http://localhost:3000
   - 输入测试故事
   - 点击 "Generate Comic"

---

## 🎯 总结

| 问题 | 严重程度 | 解决方案 |
|-----|---------|---------|
| 代理未配置 | 🔴 严重 | 添加 HTTPS_PROXY 环境变量 + undici ProxyAgent |
| 模型名称错误 | 🔴 严重 | 更新为 gemini-2.5-flash |

**修复后预期**: 所有 AI 功能正常工作
