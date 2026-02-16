import { StoryInput, StoryOutput, ImageAnalysis } from '../types';
import { postAi } from './apiClient';

// Thin wrapper: calls backend 4-step story pipeline
export async function generateStory(input: StoryInput): Promise<StoryOutput> {
  return postAi<StoryOutput>('generate-story', input);
}

// C31: title generation with fallback
export async function generateTitle(text: string, imageAnalysis?: ImageAnalysis[]): Promise<string> {
  try {
    const result = await postAi<{ title: string }>('generate-title', { text, imageAnalysis });
    return result.title;
  } catch (e) {
    console.warn('[storyService] generateTitle failed, using fallback:', e);
    return (text || '未命名故事').slice(0, 15) + ((text || '').length > 15 ? '...' : '');
  }
}
