import { GenerateContentResponse } from '@google/genai';
import { VideoAnalysis, VideoKeyFrame } from '../types.js';
import { getAiClient, withRetry, SAFETY_SETTINGS, TEXT_MODEL, IMAGE_MODEL } from './gemini.js';
import { saveImage } from './imageStorage.js';

/**
 * v2.0: Analyze video content and extract key frames.
 * C03: withRetry wrapper, C04: model constants, C11: JSON.parse validation
 * C48: only save key frame images to disk, not the video file
 * C49: caller sets 120s timeout on the route level
 *
 * Two-step process:
 *   Step 1: TEXT_MODEL analyzes video → content description + key moment timestamps
 *   Step 2: IMAGE_MODEL extracts key frame images at those moments
 */
export async function analyzeVideo(
  videoBase64: string,
  mimeType: string
): Promise<VideoAnalysis> {
  // Step 1: Analyze video content with TEXT_MODEL
  const contentAnalysis = await analyzeVideoContent(videoBase64, mimeType);

  // Step 2: Extract key frame images with IMAGE_MODEL
  const keyFrames = await extractKeyFrames(videoBase64, mimeType, contentAnalysis);

  // Save key frame images to disk (C48: only save frames, not video)
  for (const frame of keyFrames) {
    const imagePath = saveImage('scenes' as any, frame.imageData, frame.mimeType);
    frame.imageUrl = `/api/images/${imagePath}`;
  }

  return {
    contentDescription: contentAnalysis.contentDescription,
    keyFrames
  };
}

interface ContentAnalysisResult {
  contentDescription: string;
  keyMoments: Array<{
    timestamp: string;
    description: string;
  }>;
}

/**
 * Step 1: Use TEXT_MODEL to understand video content and identify key moments.
 */
async function analyzeVideoContent(
  videoBase64: string,
  mimeType: string
): Promise<ContentAnalysisResult> {
  const ai = getAiClient();

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: videoBase64
          }
        },
        {
          text: `分析这段视频，这是一位家长拍摄的孩子成长记录视频。

请完成以下任务：
1. 用一段话总结视频的内容（场景、人物、动作、情绪）
2. 选出 2-4 个最适合转化为漫画分镜的关键时刻，标注时间戳和画面描述

输出 JSON 格式:
{
  "contentDescription": "视频内容总结...",
  "keyMoments": [
    { "timestamp": "00:05", "description": "画面描述..." },
    { "timestamp": "00:15", "description": "画面描述..." }
  ]
}

注意：
- keyMoments 数量为 2-4 个，选择最有故事性和情感表达的瞬间
- timestamp 格式为 MM:SS
- description 要详细描述画面中的人物动作、表情、场景`
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      safetySettings: SAFETY_SETTINGS
    }
  }));

  const text = response.text?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}';
  // C11: JSON.parse validation
  const parsed = JSON.parse(text);

  return {
    contentDescription: parsed.contentDescription || '视频内容分析完成。',
    keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments.slice(0, 4) : []
  };
}

/**
 * Step 2: Use IMAGE_MODEL to generate key frame images from text descriptions.
 * IMAGE_MODEL does not support video input, so we generate images purely from
 * the text descriptions produced by Step 1.
 */
async function extractKeyFrames(
  _videoBase64: string,
  _mimeType: string,
  contentAnalysis: ContentAnalysisResult
): Promise<VideoKeyFrame[]> {
  const ai = getAiClient();
  const keyFrames: VideoKeyFrame[] = [];

  // Generate key frame images one by one based on text descriptions
  for (let i = 0; i < contentAnalysis.keyMoments.length; i++) {
    const moment = contentAnalysis.keyMoments[i];
    try {
      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [
            {
              text: `生成一张真实感照片风格的图片，画面内容如下：

场景背景：${contentAnalysis.contentDescription}

具体画面（时间点 ${moment.timestamp}）：${moment.description}

要求：
- 真实感摄影风格，不要卡通或插画
- 画面清晰，色彩自然
- 表现出人物的动作和表情
- 16:9 横版构图`
            }
          ]
        },
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          safetySettings: SAFETY_SETTINGS
        }
      }));

      // Extract image from response
      const parts = response.candidates?.[0]?.content?.parts || [];
      let imageFound = false;
      for (const part of parts) {
        if (part.inlineData?.data) {
          keyFrames.push({
            index: i,
            timestamp: moment.timestamp,
            description: moment.description,
            imageData: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png'
          });
          imageFound = true;
          break;
        }
      }

      if (!imageFound) {
        console.warn(`[VideoAnalyzer] No image returned for key moment ${i} at ${moment.timestamp}`);
      }
    } catch (e: any) {
      console.warn(`[VideoAnalyzer] Failed to generate key frame ${i} at ${moment.timestamp}:`, e.message);
    }
  }

  // If no key frames were generated at all, throw to let the route handle the error
  if (keyFrames.length === 0) {
    throw new Error('Failed to generate any key frames from the video');
  }

  return keyFrames;
}
