import { GenerateContentResponse } from '@google/genai';
import { ImageAnalysis } from '../types.js';
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL } from './gemini.js';
import { parseDataUri } from '../utils/imageUtils.js';

/**
 * Transcribe audio to text.
 * Receives base64 audio data (not a Blob, since this is server-side).
 */
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const ai = getAiClient();

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: audioBase64
          }
        },
        {
          text: '将这段语音转录为文字。这是一位家长在描述孩子的成长瞬间。请准确转录所有内容，保留口语化风格。'
        }
      ]
    },
    config: {
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return response.text || '';
}

/**
 * Analyze multiple images in parallel. Single failure returns fallback.
 * C12: Images should be pre-compressed by frontend before sending.
 */
export async function analyzeImages(imageBase64s: Array<{ data: string; mimeType: string }>): Promise<ImageAnalysis[]> {
  if (imageBase64s.length === 0) return [];

  const analyzeOne = async (img: { data: string; mimeType: string }, i: number): Promise<ImageAnalysis> => {
    try {
      const ai = getAiClient();

      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: TEXT_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType: img.mimeType, data: img.data } },
            {
              text: `分析这张图片。
              提取：场景、人物动作、关键物品、情绪氛围。

              输出 JSON 格式: { "description": "一段详细的画面描述..." }`
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          safetySettings: SAFETY_SETTINGS
        }
      }), 4);

      const text = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}';
      try {
        const parsed = JSON.parse(text);
        return { index: i, description: parsed.description || `图${i + 1}: 分析完成。` };
      } catch {
        return { index: i, description: text };
      }
    } catch (e: any) {
      console.warn(`[InputAnalyzer] Failed to analyze image ${i}:`, e.message);
      return { index: i, description: `图${i + 1}: [图片分析不可用] 请根据上下文和人物性格创作画面。` };
    }
  };

  const results = await Promise.all(imageBase64s.map((img, i) => analyzeOne(img, i)));
  return results.sort((a, b) => a.index - b.index);
}
