import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

dotenv.config({ path: '../.env' });
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:10809'));

const apiKey = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log('🔍 获取可用 Gemini 模型列表...\n');

const response = await fetch(url);
const data = await response.json();

if (data.models) {
  console.log('支持 generateContent 的模型:');
  console.log('='.repeat(50));
  data.models.forEach((m: any) => {
    if (m.supportedGenerationMethods?.includes('generateContent')) {
      console.log(`  - ${m.name}`);
    }
  });
} else {
  console.log('错误:', JSON.stringify(data, null, 2));
}
