import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

dotenv.config({ path: '../.env' });
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:10809'));

const apiKey = process.env.GEMINI_API_KEY;

// 根据 API 返回的可用模型
const models = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite-preview-09-2025',
  'gemini-1.5-flash-latest',
  'gemini-2.5-flash-image-preview-10-2025'
];

async function testModels() {
  console.log('🔍 测试 Gemini 模型可用性 (使用代理)\n');
  console.log('='.repeat(50));

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    console.log('\n测试模型:', model);

    try {
      const start = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "OK"' }] }]
        })
      });

      const elapsed = Date.now() - start;
      const data = await response.json();

      if (response.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text';
        console.log(`  ✅ 成功! (${elapsed}ms)`);
        console.log(`  响应: ${text.substring(0, 100)}`);
        return model;
      } else {
        console.log(`  ❌ HTTP ${response.status}: ${(data.error?.message || 'Unknown').substring(0, 80)}`);
      }
    } catch (err) {
      console.log(`  ❌ 错误: ${err.message}`);
    }
  }
  return null;
}

const workingModel = await testModels();

console.log('\n' + '='.repeat(50));
if (workingModel) {
  console.log(`✅ 推荐使用的模型: ${workingModel}`);
} else {
  console.log('❌ 没有找到可用的模型');
}
