import { StoryInput, StoryOutput } from '../types';
import { postAi } from './apiClient';

// Thin wrapper: calls backend 4-step story pipeline
export async function generateStory(input: StoryInput): Promise<StoryOutput> {
  return postAi<StoryOutput>('generate-story', input);
}
