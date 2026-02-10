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
  referenceSheetUrl?: string; // Multi-angle reference sheet (POC-01, optional)
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

// === inputService types ===
export interface ImageAnalysis {
  index: number;
  description: string;
}

// === storyService types ===
export interface StoryInput {
  text: string;
  imageAnalysis: ImageAnalysis[];
  characters: Character[];
  style: ComicStyle;
  imageCount: number;
}

export interface SceneScript {
  sceneNumber: number;
  description: string;
  emotionalBeat: string;
}

export interface CharacterDef {
  name: string;
  description: string;
}

export interface StoryOutput {
  totalScenes: number;
  currentBatch: SceneScript[];
  hasMore: boolean;
  keyObjects: KeyObject[];
  characterDefinitions: CharacterDef[];
  storyOutline: string;
}

// === characterService types ===
export interface ReferenceSheet {
  imageUrl: string;
  views: string[];
}

export interface CharacterRef {
  name: string;
  description: string;
  avatarUrl: string;
  referenceSheetUrl?: string;
}

// === imageService types ===
export interface SceneImageParams {
  script: string;
  style: ComicStyle;
  ratio: AspectRatio;
  characterContext: string;
  objectContext: string;
  referenceChars: Character[];
  sceneReferenceImages: string[];
  isUserPhoto?: boolean; // true = user uploaded photo, false = previous scene continuity
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