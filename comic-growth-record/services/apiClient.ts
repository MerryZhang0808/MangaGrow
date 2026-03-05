// C20: Frontend does not store API Key. All AI calls go through backend /api/* endpoints.
// C26: Frontend services do not import @google/genai.

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Base fetch wrapper with standard error handling.
 * C03: Simple retry 1 time on 5xx errors.
 */
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  const doFetch = async (): Promise<T> => {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}: ${res.statusText}`);
    }

    const json: ApiResponse<T> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Unknown server error');
    }
    return json.data as T;
  };

  try {
    return await doFetch();
  } catch (e: any) {
    // Retry once on 5xx or network errors
    if (e.message?.includes('5') || e.name === 'TypeError') {
      console.warn(`[apiClient] Retrying ${path} after error:`, e.message);
      return await doFetch();
    }
    throw e;
  }
}

/**
 * POST to /api/ai/{endpoint}
 */
export async function postAi<T>(endpoint: string, body: object): Promise<T> {
  return fetchApi<T>(`/ai/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

// === Character CRUD ===

import type { Character } from '../types';

export async function getCharacters(): Promise<Character[]> {
  return fetchApi<Character[]>('/characters');
}

export async function createCharacterApi(data: { name: string; photoBase64: string; mimeType?: string }): Promise<Character> {
  return fetchApi<Character>('/characters', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateCharacterApi(id: string, data: Record<string, any>): Promise<Character> {
  return fetchApi<Character>(`/characters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function deleteCharacterApi(id: string): Promise<void> {
  return fetchApi<void>(`/characters/${id}`, {
    method: 'DELETE'
  });
}

// === Story CRUD ===

export async function getStories(): Promise<any[]> {
  return fetchApi<any[]>('/stories');
}

export async function saveStory(data: Record<string, any>): Promise<any> {
  return fetchApi<any>('/stories', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function getStory(id: string): Promise<any> {
  return fetchApi<any>(`/stories/${id}`);
}

export async function deleteStory(id: string): Promise<void> {
  return fetchApi<void>(`/stories/${id}`, {
    method: 'DELETE'
  });
}

// === AI helpers ===

export interface SummaryStoryItem {
  title: string;
  inputText: string;
}

/**
 * Generate a yearly summary text from a list of story items.
 * C40: Falls back to fixed text on any error — never rejects.
 */
export async function generateYearlySummary(stories: SummaryStoryItem[]): Promise<string> {
  try {
    const result = await postAi<{ summary: string }>('generate-summary', { stories });
    return result.summary;
  } catch (e) {
    console.warn('[apiClient] generateYearlySummary failed, using fallback:', e);
    return `这一段时间里，记录了 ${stories.length} 个成长故事。`;
  }
}
