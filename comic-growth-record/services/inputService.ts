import { ImageAnalysis } from '../types';
import { postAi } from './apiClient';
import { parseDataUri } from '../utils/imageUtils';

// Transcribe audio to text via backend
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Audio = (reader.result as string).split(',')[1];
        const cleanMimeType = audioBlob.type.split(';')[0];
        const result = await postAi<{ text: string }>('transcribe-audio', {
          audioBase64: base64Audio,
          mimeType: cleanMimeType || 'audio/webm'
        });
        resolve(result.text);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};

// Analyze multiple images via backend
export const analyzeImages = async (imageUris: string[]): Promise<ImageAnalysis[]> => {
  if (imageUris.length === 0) return [];

  // Convert data URIs to { data, mimeType } for backend
  const images = imageUris.map(uri => parseDataUri(uri));

  return postAi<ImageAnalysis[]>('analyze-images', { images });
};
