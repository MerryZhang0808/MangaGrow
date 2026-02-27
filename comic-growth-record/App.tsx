import React, { useState, useEffect, useCallback } from 'react';
import { InputPanel } from './components/InputPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { CharacterLibrary } from './components/CharacterLibrary';
import { HistoryPanel } from './components/HistoryPanel';
import { GrowthAlbum } from './components/GrowthAlbum';
import { ComicStyle, AspectRatio, Scene, Character, KeyObject } from './types';
import { analyzeImages } from './services/inputService';
import { generateStory } from './services/storyService';
import { generateSceneImage } from './services/imageService';
import { getCharacterReferences, getCharacters } from './services/characterService';
import { saveStory } from './services/apiClient';
import { generatePoster } from './utils/posterGenerator';
import { BookOpen, User, Plus, Clock, Images } from 'lucide-react';

const App: React.FC = () => {
  // State: Inputs
  const [inputText, setInputText] = useState("");
  const [inputImages, setInputImages] = useState<string[]>([]);

  // State: Settings
  const [style, setStyle] = useState<ComicStyle>(ComicStyle.CARTOON);
  const [ratio, setRatio] = useState<AspectRatio>(AspectRatio.RATIO_4_3);

  // State: Output
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [keyObjects, setKeyObjects] = useState<KeyObject[]>([]);
  const [storyCharacters, setStoryCharacters] = useState<KeyObject[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");

  // State: Story persistence (C27, C42)
  const [storyTitle, setStoryTitle] = useState<string>('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // State: Sidebar / Panels (C41: GrowthAlbum and HistoryPanel are mutually exclusive)
  const [isCharLibOpen, setIsCharLibOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGrowthAlbumOpen, setIsGrowthAlbumOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string | undefined>(undefined);

  // Initialize: load characters from backend API
  useEffect(() => {
    getCharacters()
      .then(chars => setCharacters(chars))
      .catch(e => console.error('[App] Failed to load characters:', e));
  }, []);

  // Handle title change (editable title)
  const handleTitleChange = useCallback((newTitle: string) => {
    setStoryTitle(newTitle);
  }, []);

  // C27: Manual save — C42: ① generatePoster → ② base64 → ③ POST
  const handleSaveStory = useCallback(async () => {
    if (!scenes.length || isSaved) return;
    setIsSaving(true);
    try {
      // ① Generate poster canvas from scenes
      const scenesWithImages = scenes.filter(s => s.imageUrl).map(s => ({
        imageUrl: s.imageUrl!,
        caption: s.caption || ''
      }));
      const posterBlob = await generatePoster({
        title: storyTitle,
        date: new Date().toLocaleDateString('zh-CN'),
        scenes: scenesWithImages
      });

      // ② Convert poster Blob to base64; collect input photos base64
      const posterBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(posterBlob);
      });
      const inputPhotos = inputImages.map(img =>
        img.startsWith('data:') ? img.split(',')[1] : img
      );

      // ③ POST story to backend
      await saveStory({
        title: storyTitle,
        input_text: inputText,
        input_photos: inputPhotos,
        poster_base64: posterBase64,
        style
      });
      setIsSaved(true);
    } catch (e) {
      console.error('[App] Save failed:', e);
    } finally {
      setIsSaving(false);
    }
  }, [scenes, storyTitle, inputText, inputImages, style, isSaved]);

  // Main Generation Logic — uses storyService pipeline + imageService
  const handleGenerate = async () => {
    if (!inputText && inputImages.length === 0) return;
    setIsGenerating(true);
    setGenerationStage("分析输入内容...");
    setScenes([]);
    setKeyObjects([]);
    setStoryCharacters([]);

    try {
      // 1. Analyze Images via inputService (→ backend)
      let imageAnalysis: import('./types').ImageAnalysis[] = [];
      if (inputImages.length > 0) {
        setGenerationStage("分析照片内容...");
        try {
          imageAnalysis = await analyzeImages(inputImages);
        } catch (e) {
          console.error("Image analysis failed, proceeding with text only", e);
        }
      }

      // 2. Generate Story via storyService (→ backend 4-step pipeline)
      setGenerationStage("构思故事大纲...");
      const storyResult = await generateStory({
        text: inputText,
        imageAnalysis,
        characters,
        style,
        imageCount: inputImages.length
      });

      const scriptScenes = storyResult.currentBatch || [];
      const generatedKeyObjects = storyResult.keyObjects || [];
      const generatedStoryCharsRaw = storyResult.characterDefinitions || [];

      if (scriptScenes.length === 0) {
        throw new Error("AI未能生成有效的故事内容。请尝试增加更详细的描述或检查图片。");
      }

      // Merge character definitions: library characters take priority
      const libraryCharMap = new Map();
      const mergedCharacters: KeyObject[] = [];

      characters.forEach(c => {
        mergedCharacters.push({ name: c.name, description: c.description });
        libraryCharMap.set(c.name.toLowerCase().trim(), true);
      });

      generatedStoryCharsRaw.forEach((char: KeyObject) => {
        const normalizedName = char.name.toLowerCase().trim();
        if (!libraryCharMap.has(normalizedName)) {
          mergedCharacters.push(char);
        }
      });

      setKeyObjects(generatedKeyObjects);
      setStoryCharacters(mergedCharacters);

      // C37: 立即设置标题（早于图片生成），storyResult.title 由管线与 Step4 并行生成
      const title = storyResult.title || '';
      setStoryTitle(title);

      // Create Scene objects
      // First batch (up to 4) starts loading, rest are pending (no image yet)
      const AUTO_GENERATE_COUNT = 6;
      const initialScenes: Scene[] = scriptScenes.map((s, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        sceneNumber: s.sceneNumber,
        script: s.description,
        caption: s.caption || '',
        isLoading: i < AUTO_GENERATE_COUNT
      }));

      setScenes(initialScenes);
      setGenerationStage("生成漫画图片...");

      // Prepare contexts
      // 有头像的库角色：头像管发型/面部，服装跟场景描述走（故事临时服装优先于头像服装）
      const libraryCharNameSet = new Set(characters.map(c => c.name.toLowerCase()));
      const characterContext = mergedCharacters.map((c: KeyObject) => {
        if (libraryCharNameSet.has(c.name.toLowerCase())) {
          return `[人物: ${c.name}] 发型、发色、面部特征严格以上方Q版头像参考图为准；本分镜的服装以[3. 画面描述]中写明的服装为准（若故事有特定着装则以描述为准，若无则参考头像服装）。`;
        }
        return `[人物: ${c.name}]\n外貌特征: ${c.description}`;
      }).join('\n\n');

      const objectContext = generatedKeyObjects.map((o: KeyObject) =>
        `[物品: ${o.name}] ${o.description}`
      ).join('\n');

      // 3. Generate Images — only first batch auto-generated
      const hasUserPhotos = inputImages.length > 0 && inputImages.length >= initialScenes.length;
      const firstBatch = initialScenes.slice(0, AUTO_GENERATE_COUNT);

      // Helper: build params and generate one scene image
      const generateOne = async (scene: Scene, sceneIndex: number, sceneRefImages: string[], isPhoto: boolean) => {
        // 用 script + caption 联合匹配，防止 script 用代词但 caption 有名字时头像丢失
        const sortedRefChars = getCharacterReferences(characters, `${scene.script} ${scene.caption || ''}`);
        const referenceCharIds = sortedRefChars
          .map(r => characters.find(c => c.name === r.name)?.id)
          .filter(Boolean) as string[];

        try {
          const imageUrl = await generateSceneImage({
            script: scene.script,
            style,
            ratio,
            characterContext,
            objectContext,
            referenceCharIds,
            sceneReferenceImages: sceneRefImages,
            isUserPhoto: isPhoto
          });
          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, imageUrl, isLoading: false } : s
          ));
          return imageUrl;
        } catch (error) {
          console.error(`Failed to generate image for scene ${scene.sceneNumber}`, error);
          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, isLoading: false, error: "Image generation failed" } : s
          ));
          return null;
        }
      };

      if (hasUserPhotos) {
        // Parallel: each scene uses its own user photo as reference
        setGenerationStage(`并行绘制 ${firstBatch.length} 幅画面...`);
        await Promise.all(
          firstBatch.map((scene, i) =>
            generateOne(scene, i, [inputImages[i]], true)
          )
        );
      } else {
        // 链式策略 — 每张生成后作为下一张的风格参考，Q版头像负责角色一致性
        let prevImageUrl: string | null = null;
        for (let i = 0; i < firstBatch.length; i++) {
          const scene = firstBatch[i];
          const continuityRef = prevImageUrl ? [prevImageUrl] : [];
          setGenerationStage(`绘制第 ${i + 1}/${initialScenes.length} 幅画面...`);
          const result = await generateOne(scene, i, continuityRef, false);
          if (result) prevImageUrl = result; // 每张成为下一张的参考
        }
      }

    } catch (error) {
      console.error("Workflow failed", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      alert(msg);
    } finally {
      setIsGenerating(false);
      setGenerationStage("");
    }
  };

  const resetApp = () => {
    setInputText("");
    setInputImages([]);
    setScenes([]);
    setKeyObjects([]);
    setStoryCharacters([]);
    setIsGenerating(false);
    setStoryTitle('');
    setIsSaved(false);
    setIsSaving(false);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-gray-900">
      {/* 1. Left Navigation Rail */}
      <div className="w-16 flex flex-col items-center py-6 border-r border-gray-100 bg-white z-30">
        <div className="mb-8 p-2 bg-primary-50 text-primary-600 rounded-xl">
          <BookOpen size={24} />
        </div>

        <div className="flex-1 flex flex-col gap-6 w-full items-center">
          {/* 人物库 */}
          <button
            onClick={() => { setIsCharLibOpen(true); setIsHistoryOpen(false); setIsGrowthAlbumOpen(false); }}
            className={`p-3 rounded-xl transition-all ${isCharLibOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
            title="人物库"
          >
            <User size={24} />
          </button>

          {/* 历史记录 */}
          <button
            onClick={() => { setIsHistoryOpen(true); setIsCharLibOpen(false); setIsGrowthAlbumOpen(false); }}
            className={`p-3 rounded-xl transition-all ${isHistoryOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
            title="历史记录"
          >
            <Clock size={24} />
          </button>

          {/* 成长相册 (C41: mutually exclusive with HistoryPanel) */}
          <button
            onClick={() => { setIsGrowthAlbumOpen(true); setIsHistoryOpen(false); setIsCharLibOpen(false); }}
            className={`p-3 rounded-xl transition-all ${isGrowthAlbumOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
            title="成长相册"
          >
            <Images size={24} />
          </button>

          {/* 新创作 */}
          <button
            onClick={resetApp}
            className="p-3 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
            title="新创作"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="mt-auto">
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-primary-50 hover:text-primary-600 transition-colors">
            <div className="w-full h-full rounded-full overflow-hidden">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 m-auto"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          </button>
        </div>
      </div>

      {/* Sidebar Overlay (Character Library) */}
      <CharacterLibrary
        isOpen={isCharLibOpen}
        onClose={() => { setIsCharLibOpen(false); setActiveCharacterId(undefined); }}
        characters={characters}
        setCharacters={setCharacters}
        initialCharacterId={activeCharacterId}
      />

      {/* Full-screen History Panel (C41: mutually exclusive with GrowthAlbum) */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      {/* Full-screen Growth Album (C41: mutually exclusive with HistoryPanel) */}
      <GrowthAlbum
        isOpen={isGrowthAlbumOpen}
        onClose={() => setIsGrowthAlbumOpen(false)}
        characters={characters}
      />

      {/* 2. Middle Input Column */}
      <div className="w-[400px] flex-shrink-0 h-full border-r border-gray-100 bg-white z-20 flex flex-col">
        <InputPanel
          text={inputText}
          setText={setInputText}
          images={inputImages}
          setImages={setInputImages}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          openCharLib={() => { setActiveCharacterId(undefined); setIsCharLibOpen(true); }}
          onCharacterClick={(id) => { setActiveCharacterId(id); setIsCharLibOpen(true); }}
          characters={characters}
          style={style}
          setStyle={setStyle}
          ratio={ratio}
          setRatio={setRatio}
        />
      </div>

      {/* 3. Right Display Area */}
      <div className="flex-1 h-full bg-gray-50 relative overflow-hidden">
        <DisplayPanel
          scenes={scenes}
          setScenes={setScenes}
          keyObjects={keyObjects}
          storyCharacters={storyCharacters}
          libraryCharacters={characters}
          inputImages={inputImages}
          isGenerating={isGenerating}
          generationStage={generationStage}
          style={style}
          ratio={ratio}
          onReset={resetApp}
          storyTitle={storyTitle}
          onTitleChange={handleTitleChange}
          saveStatus={isSaved ? 'saved' : (isSaving ? 'saving' : 'unsaved')}
          onSaveStory={handleSaveStory}
        />
      </div>
    </div>
  );
};

export default App;
