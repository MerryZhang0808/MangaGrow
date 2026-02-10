import { Character, ComicStory } from "../types";

const KEY_CHARACTERS = 'comic_app_characters';
const KEY_HISTORY = 'comic_app_history';

export const loadCharacters = (): Character[] => {
  try {
    const saved = localStorage.getItem(KEY_CHARACTERS);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveCharacters = (characters: Character[]): void => {
  localStorage.setItem(KEY_CHARACTERS, JSON.stringify(characters));
};

export const loadHistory = (): ComicStory[] => {
  try {
    const saved = localStorage.getItem(KEY_HISTORY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveHistory = (history: ComicStory[]): void => {
  localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
};
