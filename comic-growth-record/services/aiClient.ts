import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Model constants - all services must reference these, no hardcoding
export const TEXT_MODEL = 'gemini-3-flash-preview';
export const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// Get fresh AI client instance
export const getAiClient = () => {
  return new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
};

// Common safety settings to prevent over-blocking on innocent content
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Retry wrapper for API calls with exponential backoff + jitter
export async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      const errMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      console.warn(`API call failed (attempt ${i + 1}/${retries}):`, errMsg);

      // If it's a 4xx error (client error), generally don't retry unless it's 429 (Too Many Requests)
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw e;
      }

      // Wait before retrying (exponential backoff + jitter)
      const baseDelay = 1000 * Math.pow(2, i);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError;
}
