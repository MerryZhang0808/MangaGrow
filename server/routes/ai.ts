import { Router, Request, Response } from 'express';
import { transcribeAudio, analyzeImages } from '../services/inputAnalyzer.js';
import { generateStory, generateYearlySummary } from '../services/storyPipeline.js';
import { generateSceneImage, CharacterImageRef } from '../services/imageGenerator.js';
import { analyzeCharacter, detectGenderAge, generateAvatar } from '../services/characterAnalyzer.js';
import { saveImage } from '../services/imageStorage.js';
import { readImageAsBase64, parseDataUri } from '../utils/imageUtils.js';
import { getDb } from '../db/index.js';

const router = Router();

// POST /api/ai/transcribe-audio
router.post('/transcribe-audio', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'audioBase64 is required' });
    }
    const text = await transcribeAudio(audioBase64, mimeType || 'audio/webm');
    res.json({ success: true, data: { text } });
  } catch (e: any) {
    console.error('[AI Route] transcribe-audio failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/analyze-images
router.post('/analyze-images', async (req: Request, res: Response) => {
  try {
    const { images } = req.body; // Array<{ data: string; mimeType: string }>
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ success: false, error: 'images array is required' });
    }
    const results = await analyzeImages(images);
    res.json({ success: true, data: results });
  } catch (e: any) {
    console.error('[AI Route] analyze-images failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/generate-story
router.post('/generate-story', async (req: Request, res: Response) => {
  try {
    const result = await generateStory(req.body);
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error('[AI Route] generate-story failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/generate-image
router.post('/generate-image', async (req: Request, res: Response) => {
  try {
    const { script, style, ratio, characterContext, objectContext, referenceCharIds, sceneReferenceImages, isUserPhoto } = req.body;

    // Resolve referenceCharIds to actual image data from DB + disk
    const referenceChars: CharacterImageRef[] = [];
    if (referenceCharIds && referenceCharIds.length > 0) {
      const db = getDb();
      for (const charId of referenceCharIds) {
        const row = db.prepare('SELECT name, avatar_path, reference_sheet_path, original_photo_paths FROM characters WHERE id = ?').get(charId) as any;
        if (row && row.avatar_path) {
          try {
            const { getImageFullPath } = await import('../services/imageStorage.js');
            const avatar = readImageAsBase64(getImageFullPath(row.avatar_path));
            const ref: CharacterImageRef = {
              name: row.name,
              avatarData: avatar.data,
              avatarMimeType: avatar.mimeType
            };
            // Load reference sheet if available
            if (row.reference_sheet_path) {
              try {
                const sheet = readImageAsBase64(getImageFullPath(row.reference_sheet_path));
                ref.referenceSheetData = sheet.data;
                ref.referenceSheetMimeType = sheet.mimeType;
              } catch { /* reference sheet not available */ }
            }
            // Load original photo (first one) for real feature reference
            if (row.original_photo_paths) {
              try {
                const photoPaths: string[] = JSON.parse(row.original_photo_paths);
                if (photoPaths.length > 0) {
                  const photo = readImageAsBase64(getImageFullPath(photoPaths[0]));
                  ref.originalPhotoData = photo.data;
                  ref.originalPhotoMimeType = photo.mimeType;
                }
              } catch { /* original photo not available */ }
            }
            referenceChars.push(ref);
          } catch (err: any) {
            console.warn(`[AI Route] Failed to read avatar for char ${charId}:`, err.message);
          }
        }
      }
    }

    // Parse sceneReferenceImages: could be data URIs, server paths, or { data, mimeType } objects
    const parsedSceneRefs: Array<{ data: string; mimeType: string }> = [];
    if (sceneReferenceImages && sceneReferenceImages.length > 0) {
      for (const img of sceneReferenceImages) {
        if (typeof img === 'string') {
          if (img.startsWith('/api/images/')) {
            // Server image path - read from disk
            try {
              const relativePath = img.replace('/api/images/', '');
              const { getImageFullPath } = await import('../services/imageStorage.js');
              parsedSceneRefs.push(readImageAsBase64(getImageFullPath(relativePath)));
            } catch (err: any) {
              console.warn('[AI Route] Failed to read scene reference from disk:', err.message);
            }
          } else {
            // Data URI
            parsedSceneRefs.push(parseDataUri(img));
          }
        } else if (img.data) {
          parsedSceneRefs.push(img);
        }
      }
    }

    const result = await generateSceneImage({
      script,
      style,
      ratio,
      characterContext: characterContext || '',
      objectContext: objectContext || '',
      referenceChars,
      sceneReferenceImages: parsedSceneRefs,
      isUserPhoto
    });

    // Save generated image to disk (scenes/ is transient session storage; TODO: review in T-40)
    const imagePath = saveImage('scenes' as any, result.data, result.mimeType);
    res.json({ success: true, data: { imageUrl: `/api/images/${imagePath}` } });
  } catch (e: any) {
    console.error('[AI Route] generate-image failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/analyze-character
router.post('/analyze-character', async (req: Request, res: Response) => {
  try {
    const { name, imageData, mimeType } = req.body;
    if (!name || !imageData) {
      return res.status(400).json({ success: false, error: 'name and imageData are required' });
    }
    const description = await analyzeCharacter(name, imageData, mimeType || 'image/jpeg');
    res.json({ success: true, data: { description } });
  } catch (e: any) {
    console.error('[AI Route] analyze-character failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/generate-avatar
router.post('/generate-avatar', async (req: Request, res: Response) => {
  try {
    let { name, imageData, mimeType, description, gender, ageGroup, specificAge, characterId } = req.body;
    if (!name || !imageData || !description) {
      return res.status(400).json({ success: false, error: 'name, imageData, and description are required' });
    }

    // If imageData is a server image path (e.g. /api/images/...), read from disk
    if (typeof imageData === 'string' && imageData.startsWith('/api/images/')) {
      try {
        const relativePath = imageData.replace('/api/images/', '');
        const { getImageFullPath } = await import('../services/imageStorage.js');
        const read = readImageAsBase64(getImageFullPath(relativePath));
        imageData = read.data;
        mimeType = read.mimeType;
      } catch (err: any) {
        console.warn('[AI Route] Failed to read imageData from disk, using as-is:', err.message);
      }
    }

    const result = await generateAvatar(
      name, imageData, mimeType || 'image/jpeg', description,
      gender, ageGroup, specificAge
    );

    // Save avatar to disk
    const avatarPath = saveImage('avatars', result.data, result.mimeType);

    // If characterId provided, update the character's avatar in DB
    if (characterId) {
      const db = getDb();
      const old = db.prepare('SELECT avatar_path FROM characters WHERE id = ?').get(characterId) as any;
      db.prepare('UPDATE characters SET avatar_path = ?, updated_at = ? WHERE id = ?')
        .run(avatarPath, Date.now(), characterId);

      // Delete old avatar file
      if (old && old.avatar_path) {
        try {
          const { deleteImage } = await import('../services/imageStorage.js');
          deleteImage(old.avatar_path);
        } catch { /* ignore */ }
      }
    }

    res.json({ success: true, data: { avatarUrl: `/api/images/${avatarPath}` } });
  } catch (e: any) {
    console.error('[AI Route] generate-avatar failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/detect-gender-age
router.post('/detect-gender-age', async (req: Request, res: Response) => {
  try {
    const { imageData, mimeType } = req.body;
    if (!imageData) {
      return res.status(400).json({ success: false, error: 'imageData is required' });
    }
    const result = await detectGenderAge(imageData, mimeType || 'image/jpeg');
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error('[AI Route] detect-gender-age failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/ai/generate-summary (v1.7)
// C24: standard response  C40: on failure returns { success: false, error } — frontend uses fallback text
router.post('/generate-summary', async (req: Request, res: Response) => {
  try {
    const { stories } = req.body;
    if (!stories || !Array.isArray(stories) || stories.length === 0) {
      return res.status(400).json({ success: false, error: 'stories array is required and must not be empty' });
    }
    const summary = await generateYearlySummary(stories);
    res.json({ success: true, data: { summary } });
  } catch (e: any) {
    // C40: never return 500 — frontend will use degraded fallback text
    console.error('[AI Route] generate-summary failed:', e.message);
    res.json({ success: false, error: e.message });
  }
});

export default router;
