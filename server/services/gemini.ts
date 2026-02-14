import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// C04: Model name constants - all backend services must reference these
export const TEXT_MODEL = 'gemini-3-flash-preview';
export const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// C01: API Key from server-side .env only
export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('[Gemini] GEMINI_API_KEY not set in .env');
  }
  return new GoogleGenAI({ apiKey });
}

// Common safety settings
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * C03: Retry wrapper with exponential backoff + jitter (3 retries).
 * 4xx errors don't retry (except 429).
 */
export async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      const errMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      console.warn(`[Gemini] API call failed (attempt ${i + 1}/${retries}):`, errMsg);

      // 4xx errors (client error) don't retry, except 429 (rate limit)
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw e;
      }

      // Exponential backoff + jitter
      const baseDelay = 1000 * Math.pow(2, i);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError;
}
