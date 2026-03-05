import { postAi } from './apiClient';

export type CharacterStyleMode = 'full' | 'head-only';

interface GenerateImageParams {
  script: string;
  style: string;
  ratio: string;
  characterContext: string;
  objectContext: string;
  referenceCharIds: string[];
  sceneReferenceImages: string[]; // data URIs or server URLs (/api/images/...)
  characterSnapshots?: string[]; // v1.9: 角色快照 URLs（已生成分镜中该角色的最佳参考）
  characterStyleMode?: CharacterStyleMode; // v1.9: 服装策略
  isUserPhoto?: boolean;
}

// Thin wrapper: calls backend imageGenerator, returns image URL
export async function generateSceneImage(params: GenerateImageParams): Promise<string> {
  const result = await postAi<{ imageUrl: string }>('generate-image', params);
  return result.imageUrl;
}
