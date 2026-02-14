import React, { useState, useEffect } from 'react';
import { InputPanel } from './components/InputPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { CharacterLibrary } from './components/CharacterLibrary';
import { Button } from './components/Button';
import { ComicStyle, AspectRatio, Scene, Character, KeyObject } from './types';
import { analyzeImages } from './services/inputService';
import { generateStory } from './services/storyService';
import { generateSceneImage } from './services/imageService';
import { getCharacterReferences, getCharacters } from './services/characterService';
import { BookOpen, User, Plus } from 'lucide-react';

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

  // State: Sidebar
  const [isCharLibOpen, setIsCharLibOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);

  // Initialize: load characters from backend API
  useEffect(() => {
    getCharacters()
      .then(chars => setCharacters(chars))
      .catch(e => console.error('[App] Failed to load characters:', e));
  }, []);

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

      // Create Scene objects (loading state)
      const initialScenes: Scene[] = scriptScenes.map((s) => ({
        id: Math.random().toString(36).substr(2, 9),
        sceneNumber: s.sceneNumber,
        script: s.description,
        isLoading: true
      }));

      setScenes(initialScenes);
      setGenerationStage("生成漫画图片...");

      // Prepare contexts
      const characterContext = mergedCharacters.map((c: KeyObject) =>
        `[人物: ${c.name}]\n外貌特征: ${c.description}`
      ).join('\n\n');

      const objectContext = generatedKeyObjects.map((o: KeyObject) =>
        `[物品: ${o.name}] ${o.description}`
      ).join('\n');

      // 3. Generate Images via imageService (→ backend, conditional parallel)
      const hasUserPhotos = inputImages.length > 0 && inputImages.length >= initialScenes.length;

      // Helper: build params and generate one scene image
      const generateOne = async (scene: Scene, sceneIndex: number, sceneRefImages: string[], isPhoto: boolean) => {
        const sortedRefChars = getCharacterReferences(characters, scene.script);
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
        setGenerationStage(`并行绘制 ${initialScenes.length} 幅画面...`);
        await Promise.all(
          initialScenes.map((scene, i) =>
            generateOne(scene, i, [inputImages[i]], true)
          )
        );
      } else {
        // Sequential: use previous generated image URL for environment consistency
        let previousGeneratedImage: string | null = null;
        for (let i = 0; i < initialScenes.length; i++) {
          const scene = initialScenes[i];
          const continuityRef = (i > 0 && previousGeneratedImage) ? [previousGeneratedImage] : [];
          setGenerationStage(`绘制第 ${i + 1}/${initialScenes.length} 幅画面...`);
          const result = await generateOne(scene, i, continuityRef, false);
          if (result) previousGeneratedImage = result;
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
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-gray-900">
      {/* 1. Left Navigation Rail */}
      <div className="w-16 flex flex-col items-center py-6 border-r border-gray-100 bg-white z-30">
        <div className="mb-8 p-2 bg-primary-50 text-primary-600 rounded-xl">
          <BookOpen size={24} />
        </div>

        <div className="flex-1 flex flex-col gap-6 w-full items-center">
          <button
            onClick={() => setIsCharLibOpen(true)}
            className="p-3 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
            title="人物库"
          >
            <User size={24} />
          </button>

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
        onClose={() => setIsCharLibOpen(false)}
        characters={characters}
        setCharacters={setCharacters}
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
          openCharLib={() => setIsCharLibOpen(true)}
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
        />
      </div>
    </div>
  );
};

export default App;
