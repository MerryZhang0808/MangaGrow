import { GenerateContentResponse } from "@google/genai";
import { ImageAnalysis } from "../types";
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL } from "./aiClient";
import { parseDataUri, compressImage } from "../utils/imageUtils";

// Transcribe audio to text
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const ai = getAiClient();
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64Audio = (reader.result as string).split(',')[1];
        const cleanMimeType = audioBlob.type.split(';')[0];

        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
          model: TEXT_MODEL,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType || 'audio/webm',
                  data: base64Audio
                }
              },
              {
                text: "将这段语音转录为文字。这是一位家长在描述孩子的成长瞬间。请准确转录所有内容，保留口语化风格。"
              }
            ]
          },
          config: {
            safetySettings: SAFETY_SETTINGS
          }
        }));
        resolve(response.text || "");
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};

// Analyze multiple images and return structured results
export const analyzeImages = async (imageUris: string[]): Promise<ImageAnalysis[]> => {
  if (imageUris.length === 0) return [];

  const results: ImageAnalysis[] = [];

  for (let i = 0; i < imageUris.length; i++) {
    const originalUri = imageUris[i];

    // Add delay between requests
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      const compressedUri = await compressImage(originalUri);
      const { mimeType, data } = parseDataUri(compressedUri);

      const ai = getAiClient();

      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: TEXT_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType, data } },
            {
              text: `分析这张图片。
              提取：场景、人物动作、关键物品、情绪氛围。

              输出 JSON 格式: { "description": "一段详细的画面描述..." }`
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          safetySettings: SAFETY_SETTINGS
        }
      }), 4);

      const text = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || "{}";
      try {
        const parsed = JSON.parse(text);
        results.push({
          index: i,
          description: parsed.description || `图${i + 1}: 分析完成。`
        });
      } catch {
        results.push({
          index: i,
          description: text
        });
      }
    } catch (e: any) {
      const errMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      console.warn(`Failed to analyze image ${i} (will use fallback):`, errMsg);
      results.push({
        index: i,
        description: `图${i + 1}: [图片分析不可用] 请根据上下文和人物性格创作画面。`
      });
    }
  }

  return results;
};
