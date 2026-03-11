import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock all service dependencies before importing the router
vi.mock('../../services/inputAnalyzer.js', () => ({
  transcribeAudio: vi.fn(),
  analyzeImages: vi.fn(),
}));

vi.mock('../../services/videoAnalyzer.js', () => ({
  analyzeVideo: vi.fn(),
}));

vi.mock('../../services/storyPipeline.js', () => ({
  generateStory: vi.fn(),
  generateYearlySummary: vi.fn(),
}));

vi.mock('../../services/imageGenerator.js', () => ({
  generateSceneImage: vi.fn(),
}));

vi.mock('../../services/characterAnalyzer.js', () => ({
  analyzeCharacter: vi.fn(),
  detectGenderAge: vi.fn(),
  generateAvatar: vi.fn(),
}));

vi.mock('../../services/imageStorage.js', () => ({
  saveImage: vi.fn(() => 'avatars/test-uuid.png'),
  getImageFullPath: vi.fn((p: string) => `/data/images/${p}`),
}));

vi.mock('../../utils/imageUtils.js', () => ({
  readImageAsBase64: vi.fn(() => ({ data: 'base64data', mimeType: 'image/png' })),
  parseDataUri: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => null),
      run: vi.fn(),
    })),
  })),
}));

import aiRouter from '../../routes/ai.js';
import { transcribeAudio, analyzeImages } from '../../services/inputAnalyzer.js';
import { analyzeVideo } from '../../services/videoAnalyzer.js';
import { generateStory, generateYearlySummary } from '../../services/storyPipeline.js';
import { analyzeCharacter, detectGenderAge, generateAvatar } from '../../services/characterAnalyzer.js';

// Helper: create an Express app with the AI router and make a request
function createApp() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/ai', aiRouter);
  return app;
}

async function post(app: express.Express, path: string, body: unknown) {
  // Use Node's built-in fetch (available in Node 18+)
  const server = app.listen(0);
  const addr = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

describe('AI Routes — 参数校验', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // --- transcribe-audio ---
  it('POST /api/ai/transcribe-audio — 缺 audioBase64 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/transcribe-audio', {});
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('audioBase64');
  });

  it('POST /api/ai/transcribe-audio — 正常请求返回标准格式', async () => {
    vi.mocked(transcribeAudio).mockResolvedValue('转录文本');
    const { status, body } = await post(app, '/api/ai/transcribe-audio', {
      audioBase64: 'dGVzdA==',
      mimeType: 'audio/webm',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { text: '转录文本' } });
  });

  it('POST /api/ai/transcribe-audio — service 异常返回 500', async () => {
    vi.mocked(transcribeAudio).mockRejectedValue(new Error('API 超时'));
    const { status, body } = await post(app, '/api/ai/transcribe-audio', {
      audioBase64: 'dGVzdA==',
    });
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('API 超时');
  });

  // --- analyze-images ---
  it('POST /api/ai/analyze-images — 缺 images 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-images', {});
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-images — images 非数组返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-images', { images: 'not-array' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-images — 正常请求', async () => {
    const mockResults = [{ index: 0, description: '一个孩子在玩耍' }];
    vi.mocked(analyzeImages).mockResolvedValue(mockResults);
    const { status, body } = await post(app, '/api/ai/analyze-images', {
      images: [{ data: 'base64', mimeType: 'image/jpeg' }],
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: mockResults });
  });

  // --- generate-story ---
  it('POST /api/ai/generate-story — service 异常返回 500', async () => {
    vi.mocked(generateStory).mockRejectedValue(new Error('生成失败'));
    const { status, body } = await post(app, '/api/ai/generate-story', { text: '测试' });
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });

  // --- analyze-character ---
  it('POST /api/ai/analyze-character — 缺 name 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-character', { imageData: 'x' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-character — 缺 imageData 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-character', { name: '小明' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-character — 正常请求', async () => {
    vi.mocked(analyzeCharacter).mockResolvedValue('黑头发的小男孩');
    const { status, body } = await post(app, '/api/ai/analyze-character', {
      name: '小明',
      imageData: 'base64data',
      mimeType: 'image/jpeg',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { description: '黑头发的小男孩' } });
  });

  // --- detect-gender-age ---
  it('POST /api/ai/detect-gender-age — 缺 imageData 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/detect-gender-age', {});
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/detect-gender-age — 正常请求', async () => {
    const mockResult = { gender: '男', ageGroup: '儿童', specificAge: 5 };
    vi.mocked(detectGenderAge).mockResolvedValue(mockResult);
    const { status, body } = await post(app, '/api/ai/detect-gender-age', {
      imageData: 'base64data',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: mockResult });
  });

  // --- generate-avatar ---
  it('POST /api/ai/generate-avatar — 缺必要字段返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/generate-avatar', { name: '小明' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  // --- generate-summary ---
  it('POST /api/ai/generate-summary — 缺 stories 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/generate-summary', {});
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/generate-summary — service 失败不返回 500（C40 降级）', async () => {
    vi.mocked(generateYearlySummary).mockRejectedValue(new Error('AI 生成失败'));
    const { status, body } = await post(app, '/api/ai/generate-summary', {
      stories: [{ id: 1, title: '测试故事' }],
    });
    // C40: generate-summary 失败时返回 200 + success: false，前端用降级文字
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('AI 生成失败');
  });

  // --- analyze-video ---
  it('POST /api/ai/analyze-video — 缺 videoBase64 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-video', { mimeType: 'video/mp4' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-video — 缺 mimeType 返回 400', async () => {
    const { status, body } = await post(app, '/api/ai/analyze-video', { videoBase64: 'data' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST /api/ai/analyze-video — service 异常返回 500', async () => {
    vi.mocked(analyzeVideo).mockRejectedValue(new Error('视频分析超时'));
    const { status, body } = await post(app, '/api/ai/analyze-video', {
      videoBase64: 'data',
      mimeType: 'video/mp4',
    });
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('视频分析超时');
  });
});
