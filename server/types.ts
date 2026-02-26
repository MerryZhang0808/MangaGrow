// Backend types - mirrors frontend types.ts for backend independence

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

export interface ImageAnalysis {
  index: number;
  description: string;
}

export interface StoryInput {
  text: string;
  imageAnalysis: ImageAnalysis[];
  characters: CharacterData[];
  style: ComicStyle;
  imageCount: number;
}

export interface SceneScript {
  sceneNumber: number;
  description: string;
  caption: string;
  emotionalBeat: string;
}

export interface KeyObject {
  name: string;
  description: string;
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
  title: string;               // v1.6: 与 Step4 并行生成，随脚本一起返回
}

export interface CharacterData {
  id: string;
  name: string;
  avatarPath: string | null;
  description: string;
  originalPhotoPaths: string | null; // JSON array
  referenceSheetPath: string | null;
  gender: string | null;
  ageGroup: string | null;
  specificAge: string | null;
  createdAt: number;
  updatedAt: number | null;
}

export interface SceneImageParams {
  script: string;
  style: string;
  ratio: string;
  characterContext: string;
  objectContext: string;
  referenceCharIds: string[];
  sceneReferenceImages: string[]; // base64 data URIs
  isUserPhoto?: boolean;
}
