export enum ComicStyle {
  CARTOON = '温馨卡通',
  WATERCOLOR = '柔和水彩',
  FLAT = '简约扁平',
  DOODLE = '手绘涂鸦',
}

export enum AspectRatio {
  RATIO_4_3 = '4:3',
  RATIO_16_9 = '16:9',
  RATIO_1_1 = '1:1',
  RATIO_9_16 = '9:16',
}

export interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  description: string; // The AI generated text description of the character
  originalPhotoUrls: string[];
  createdAt: number;
}

export interface KeyObject {
  name: string;
  description: string;
}

export interface Scene {
  id: string;
  sceneNumber: number;
  script: string;
  imageUrl?: string;
  isLoading: boolean;
  error?: string;
}

export interface ComicStory {
  id: string;
  timestamp: number;
  scenes: Scene[];
  inputSummary: string;
}

export interface AppState {
  inputText: string;
  inputImages: string[]; // Base64 strings
  comicStyle: ComicStyle;
  aspectRatio: AspectRatio;
  isGenerating: boolean;
  scenes: Scene[];
  characters: Character[];
  history: ComicStory[];
  isCharacterLibOpen: boolean;
}