import { Character, CharacterRef } from '../types';
import { createCharacterApi, updateCharacterApi, deleteCharacterApi, getCharacters, postAi } from './apiClient';

// === API-backed functions ===

export { getCharacters } from './apiClient';

export async function createCharacter(name: string, photoDataUri: string): Promise<Character> {
  // Extract base64 and mimeType from data URI
  const matches = photoDataUri.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = matches?.[1] || 'image/jpeg';
  const photoBase64 = matches?.[2] || photoDataUri;

  return createCharacterApi({ name, photoBase64, mimeType });
}

export async function deleteCharacter(id: string): Promise<void> {
  return deleteCharacterApi(id);
}

export async function updateCharacter(id: string, data: Record<string, any>): Promise<Character> {
  return updateCharacterApi(id, data);
}

export async function regenerateAvatar(
  characterId: string,
  name: string,
  photoDataUri: string,
  description: string,
  gender?: string,
  ageGroup?: string,
  specificAge?: string
): Promise<string> {
  const matches = photoDataUri.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = matches?.[1] || 'image/jpeg';
  const imageData = matches?.[2] || photoDataUri;

  const result = await postAi<{ avatarUrl: string }>('generate-avatar', {
    characterId,
    name,
    imageData,
    mimeType,
    description,
    gender,
    ageGroup,
    specificAge
  });
  return result.avatarUrl;
}

// === Pure frontend functions (no backend call needed) ===

// C19: Update description format with gender/age info
export function updateCharacterDescription(
  character: Character,
  gender: string,
  ageGroup: string,
  specificAge?: string
): string {
  const genderText = gender || '未知性别';
  const ageText = ageGroup || '未知年龄段';
  const specificAgeText = specificAge ? `（具体${specificAge}）` : '';

  let features = character.description;
  features = features.replace(/^[男女]孩?[，,]\s*/, '');
  features = features.replace(/^(婴儿|幼儿|儿童|少儿|成人)[，,]\s*/, '');
  features = features.replace(/^[^\u4e00-\u9fa5]*岁[）)][，,]\s*/, '');

  return `${genderText}，${ageText}${specificAgeText}，${features}`;
}

// Filter and sort character references relevant to a scene script
// Returns characters mentioned in the script first, then others as fallback
export function getCharacterReferences(
  characters: Character[],
  sceneScript: string
): CharacterRef[] {
  const scriptLower = sceneScript.toLowerCase();

  const withAvatar = characters.filter(c => c.avatarUrl);

  // Split into: mentioned in script vs not mentioned
  const mentioned = withAvatar.filter(c => scriptLower.includes(c.name.toLowerCase()));
  const notMentioned = withAvatar.filter(c => !scriptLower.includes(c.name.toLowerCase()));

  // Only pass characters actually mentioned in the scene script
  // Passing unmentioned characters causes them to appear in the panel (legs, partial figures, etc.)
  return mentioned.map(c => ({
    name: c.name,
    description: c.description,
    avatarUrl: c.avatarUrl,
    referenceSheetUrl: c.referenceSheetUrl
  }));
}
