/**
 * Gemini API 诊断测试脚本
 *
 * 用法: cd server && npx tsx test-api-diagnosis.ts
 *
 * 功能:
 * 1. 检查环境变量配置
 * 2. 检测本地代理端口
 * 3. 测试网络连通性（直接/代理）
 * 4. 验证模型可用性
 * 5. 生成诊断报告
 */

import dotenv from 'dotenv';
import dns from 'dns';
import net from 'net';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// 加载环境变量
dotenv.config({ path: '../.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

function section(title: string) {
  console.log('');
  log('cyan', '═'.repeat(60));
  log('cyan', `📋 ${title}`);
  log('cyan', '─'.repeat(60));
}

// ========================================
// 测试 1: 环境变量检查
// ========================================
async function testEnvironment() {
  section('测试 1: 环境变量检查');

  const results: { pass: boolean; message: string }[] = [];

  if (!API_KEY) {
    results.push({ pass: false, message: '❌ GEMINI_API_KEY 未设置' });
  } else {
    results.push({ pass: true, message: `✅ GEMINI_API_KEY 已设置 (长度: ${API_KEY.length}, 前缀: ${API_KEY.substring(0, 10)}...)` });
  }

  if (PROXY_URL) {
    results.push({ pass: true, message: `✅ 代理已配置: ${PROXY_URL}` });
  } else {
    results.push({ pass: false, message: '⚠️ 未配置代理 (HTTPS_PROXY/HTTP_PROXY)' });
  }

  results.forEach(r => console.log(r.message));
  return results.every(r => r.pass);
}

// ========================================
// 测试 2: DNS 解析
// ========================================
async function testDNS() {
  section('测试 2: DNS 解析');

  try {
    const addresses = await new Promise<string[]>((resolve, reject) => {
      dns.resolve4('generativelanguage.googleapis.com', (err, addrs) => {
        if (err) reject(err);
        else resolve(addrs);
      });
    });
    console.log(`✅ DNS 解析成功: ${addresses.slice(0, 3).join(', ')}...`);
    return true;
  } catch (err: any) {
    console.log(`❌ DNS 解析失败: ${err.message}`);
    return false;
  }
}

// ========================================
// 测试 3: 代理端口检测
// ========================================
async function testProxyPorts() {
  section('测试 3: 本地代理端口检测');

  const proxies = [
    { host: '127.0.0.1', port: 7890, name: 'Clash' },
    { host: '127.0.0.1', port: 10809, name: 'v2rayN' },
    { host: '127.0.0.1', port: 10808, name: 'V2Ray' },
    { host: '127.0.0.1', port: 1080, name: 'Shadowsocks' },
  ];

  const openProxies: string[] = [];

  for (const proxy of proxies) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => {
        resolve(true);
        socket.destroy();
      });
      socket.once('error', () => resolve(false));
      socket.connect(proxy.port, proxy.host);
    });

    if (isOpen) {
      console.log(`✅ ${proxy.name} 代理端口开放: ${proxy.host}:${proxy.port}`);
      openProxies.push(`${proxy.host}:${proxy.port}`);
    }
  }

  if (openProxies.length === 0) {
    console.log('⚠️ 未检测到常见代理端口');
  }

  return openProxies;
}

// ========================================
// 测试 4: 直接连接测试
// ========================================
async function testDirectConnection() {
  section('测试 4: 直接连接测试 (无代理)');

  if (!API_KEY) {
    console.log('⏭️ 跳过: API Key 未设置');
    return false;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }] }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - start;

    if (response.ok) {
      console.log(`✅ 直接连接成功! (${elapsed}ms)`);
      return true;
    } else {
      const data = await response.json();
      console.log(`⚠️ HTTP ${response.status}: ${data.error?.message?.substring(0, 80)}`);
      return false;
    }
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ 直接连接失败 (${elapsed}ms): ${err.message}`);
    console.log(`   错误代码: ${err.cause?.code || 'N/A'}`);
    return false;
  }
}

// ========================================
// 测试 5: 代理连接测试
// ========================================
async function testProxyConnection(proxyUrl: string) {
  section('测试 5: 代理连接测试');

  if (!API_KEY) {
    console.log('⏭️ 跳过: API Key 未设置');
    return false;
  }

  console.log(`使用代理: ${proxyUrl}`);

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (err: any) {
    console.log(`❌ 代理配置失败: ${err.message}`);
    return false;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }] })
    });

    const elapsed = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`✅ 代理连接成功! (${elapsed}ms)`);
      console.log(`   响应: ${text.substring(0, 50)}`);
      return true;
    } else {
      const data = await response.json();
      console.log(`⚠️ HTTP ${response.status}: ${data.error?.message?.substring(0, 80)}`);
      return false;
    }
  } catch (err: any) {
    console.log(`❌ 代理连接失败: ${err.message}`);
    return false;
  }
}

// ========================================
// 测试 6: 模型可用性
// ========================================
async function testModels(proxyUrl: string | null) {
  section('测试 6: 模型可用性');

  if (!API_KEY) {
    console.log('⏭️ 跳过: API Key 未设置');
    return;
  }

  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }

  const models = [
    { name: 'gemini-2.5-flash', type: '文本' },
    { name: 'nano-banana-pro-preview', type: '图片' },
    { name: 'gemini-2.5-flash-image', type: '图片(备选)' },
  ];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${API_KEY}`;
    process.stdout.write(`  测试 ${model.name} (${model.type})... `);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }] })
      });

      if (response.ok) {
        console.log('✅ 可用');
      } else {
        const data = await response.json();
        console.log(`❌ ${data.error?.message?.substring(0, 50) || 'Error'}`);
      }
    } catch (err: any) {
      console.log(`❌ ${err.message}`);
    }
  }
}

// ========================================
// 测试 7: 后端 API 健康检查
// ========================================
async function testBackendAPI() {
  section('测试 7: 后端 API 健康检查');

  const endpoints = [
    { url: 'http://localhost:3001/api/health', method: 'GET', name: '健康检查' },
    { url: 'http://localhost:3001/api/characters', method: 'GET', name: '人物列表' },
    { url: 'http://localhost:3001/api/stories', method: 'GET', name: '故事列表' },
  ];

  for (const ep of endpoints) {
    process.stdout.write(`  ${ep.name}... `);
    try {
      const response = await fetch(ep.url, { method: ep.method });
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${data.success ? 'OK' : 'Error'}`);
      } else {
        console.log(`❌ HTTP ${response.status}`);
      }
    } catch (err: any) {
      console.log(`❌ ${err.message}`);
    }
  }
}

// ========================================
// 主函数
// ========================================
async function main() {
  console.log('');
  log('bold', '═'.repeat(60));
  log('bold', '🔍 Gemini API 诊断测试');
  log('bold', '═'.repeat(60));
  console.log('');

  // 测试 1: 环境变量
  await testEnvironment();

  // 测试 2: DNS
  await testDNS();

  // 测试 3: 代理端口
  const openProxies = await testProxyPorts();

  // 测试 4: 直接连接
  await testDirectConnection();

  // 测试 5: 代理连接
  const proxyUrl = PROXY_URL || (openProxies.length > 0 ? `http://${openProxies[0]}` : null);
  if (proxyUrl) {
    await testProxyConnection(proxyUrl);
  }

  // 测试 6: 模型可用性
  await testModels(proxyUrl);

  // 测试 7: 后端 API
  await testBackendAPI();

  // 总结
  console.log('');
  log('bold', '═'.repeat(60));
  log('bold', '📝 诊断总结');
  log('bold', '═'.repeat(60));
  console.log('');

  if (proxyUrl) {
    console.log('✅ 检测到代理:', proxyUrl);
    console.log('');
    console.log('🔧 解决方案: 在 .env 中确保已配置:');
    console.log(`   HTTPS_PROXY=${proxyUrl}`);
    console.log(`   HTTP_PROXY=${proxyUrl}`);
  } else {
    console.log('⚠️ 未检测到代理');
    console.log('');
    console.log('如果在中国大陆，请启动代理软件后重新运行测试');
  }

  console.log('');
}

main().catch(console.error);
