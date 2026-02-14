import { postAi } from './apiClient';

interface GenerateImageParams {
  script: string;
  style: string;
  ratio: string;
  characterContext: string;
  objectContext: string;
  referenceCharIds: string[];
  sceneReferenceImages: string[]; // data URIs or server URLs (/api/images/...)
  isUserPhoto?: boolean;
}

// Thin wrapper: calls backend imageGenerator, returns image URL
export async function generateSceneImage(params: GenerateImageParams): Promise<string> {
  const result = await postAi<{ imageUrl: string }>('generate-image', params);
  return result.imageUrl;
}
