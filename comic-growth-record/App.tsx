import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InputPanel } from './components/InputPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { CharacterLibrary } from './components/CharacterLibrary';
import { HistoryPanel } from './components/HistoryPanel';
import { Button } from './components/Button';
import { ComicStyle, AspectRatio, Scene, Character, KeyObject } from './types';
import { analyzeImages } from './services/inputService';
import { generateStory, generateTitle } from './services/storyService';
import { generateSceneImage } from './services/imageService';
import { getCharacterReferences, getCharacters } from './services/characterService';
import { saveStory, updateStory, getStory } from './services/apiClient';
import { BookOpen, User, Plus, Clock } from 'lucide-react';

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

  // State: Story persistence (C27, C28)
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [storyCreatedAt, setStoryCreatedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State: Sidebar
  const [isCharLibOpen, setIsCharLibOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);

  // Initialize: load characters from backend API
  useEffect(() => {
    getCharacters()
      .then(chars => setCharacters(chars))
      .catch(e => console.error('[App] Failed to load characters:', e));
  }, []);

  // C28: Debounce sync — 1 second after last edit
  const debouncedSync = useCallback((storyId: string, data: Record<string, any>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        await updateStory(storyId, data);
        setSaveStatus('saved');
      } catch (e) {
        console.error('[App] Sync failed:', e);
        setSaveStatus('idle');
      }
    }, 1000);
  }, []);

  // Handle title change (editable title)
  const handleTitleChange = useCallback((newTitle: string) => {
    setStoryTitle(newTitle);
    if (currentStoryId) {
      debouncedSync(currentStoryId, { title: newTitle });
    }
  }, [currentStoryId, debouncedSync]);

  // Handle scene edit or redraw — sync scenes to backend
  const syncScenes = useCallback((updatedScenes: Scene[]) => {
    if (!currentStoryId) return;
    const scenesData = updatedScenes.map(s => ({
      sceneNumber: s.sceneNumber,
      script: s.script,
      imagePath: s.imageUrl || null,
      emotionalBeat: ''
    }));
    debouncedSync(currentStoryId, { scenes: scenesData });
  }, [currentStoryId, debouncedSync]);

  // Load a history story into the display
  const loadStory = useCallback(async (storyId: string) => {
    try {
      const story = await getStory(storyId);
      const loadedScenes: Scene[] = (story.scenes || []).map((s: any) => ({
        id: s.id || Math.random().toString(36).substr(2, 9),
        sceneNumber: s.sceneNumber,
        script: s.script,
        imageUrl: s.imageUrl || null,
        isLoading: false
      }));
      setScenes(loadedScenes);
      setStoryTitle(story.title || '');
      setCurrentStoryId(storyId);
      setStoryCreatedAt(story.createdAt);
      setSaveStatus('saved');
      setIsHistoryOpen(false);
    } catch (e) {
      console.error('[App] Failed to load story:', e);
      alert('加载故事失败，请重试');
    }
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

      // Create Scene objects
      // First batch (up to 4) starts loading, rest are pending (no image yet)
      const AUTO_GENERATE_COUNT = 6;
      const initialScenes: Scene[] = scriptScenes.map((s, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        sceneNumber: s.sceneNumber,
        script: s.description,
        isLoading: i < AUTO_GENERATE_COUNT
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

      // 3. Generate Images — only first batch auto-generated
      const hasUserPhotos = inputImages.length > 0 && inputImages.length >= initialScenes.length;
      const firstBatch = initialScenes.slice(0, AUTO_GENERATE_COUNT);

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
        setGenerationStage(`并行绘制 ${firstBatch.length} 幅画面...`);
        await Promise.all(
          firstBatch.map((scene, i) =>
            generateOne(scene, i, [inputImages[i]], true)
          )
        );
      } else {
        // Sequential: use previous generated image URL for environment consistency
        let previousGeneratedImage: string | null = null;
        for (let i = 0; i < firstBatch.length; i++) {
          const scene = firstBatch[i];
          const continuityRef = (i > 0 && previousGeneratedImage) ? [previousGeneratedImage] : [];
          setGenerationStage(`绘制第 ${i + 1}/${initialScenes.length} 幅画面...`);
          const result = await generateOne(scene, i, continuityRef, false);
          if (result) previousGeneratedImage = result;
        }
      }

      // 4. Generate title (C31: failure fallback)
      setGenerationStage("生成故事标题...");
      const title = await generateTitle(inputText, imageAnalysis);
      setStoryTitle(title);

      // 5. Auto-save (C27: mandatory post-generation save)
      setGenerationStage("保存故事...");
      setSaveStatus('saving');
      try {
        // Collect final scene data from state
        const finalScenes = initialScenes.map(s => {
          // The scenes state may have been updated with imageUrls by now
          return s;
        });

        const savedStory = await saveStory({
          title,
          inputSummary: inputText,
          style,
          aspectRatio: ratio,
          storyOutline: storyResult.storyOutline || '',
          scenes: finalScenes.map((s, i) => ({
            sceneNumber: s.sceneNumber,
            script: s.script,
            emotionalBeat: scriptScenes[i]?.emotionalBeat || ''
          }))
        });

        setCurrentStoryId(savedStory.id);
        setStoryCreatedAt(savedStory.createdAt);
        setSaveStatus('saved');

        // Sync images (scenes may have gotten images after initial save)
        // We'll do a delayed sync to capture any remaining images
        setTimeout(async () => {
          try {
            // Re-read current scenes from React state via a closure-safe approach
            setScenes(prev => {
              const scenesWithImages = prev.map(s => ({
                sceneNumber: s.sceneNumber,
                script: s.script,
                imagePath: s.imageUrl || null,
                emotionalBeat: ''
              }));
              if (scenesWithImages.some(s => s.imagePath)) {
                updateStory(savedStory.id, { scenes: scenesWithImages }).catch(e =>
                  console.warn('[App] Image sync failed:', e)
                );
              }
              return prev; // Don't modify state
            });
          } catch { /* ignore */ }
        }, 2000);
      } catch (e) {
        console.error('[App] Auto-save failed:', e);
        setSaveStatus('idle');
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
    setCurrentStoryId(null);
    setStoryTitle('');
    setSaveStatus('idle');
    setStoryCreatedAt(null);
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
            onClick={() => { setIsCharLibOpen(true); setIsHistoryOpen(false); }}
            className={`p-3 rounded-xl transition-all ${isCharLibOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
            title="人物库"
          >
            <User size={24} />
          </button>

          <button
            onClick={() => { setIsHistoryOpen(true); setIsCharLibOpen(false); }}
            className={`p-3 rounded-xl transition-all ${isHistoryOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
            title="历史记录"
          >
            <Clock size={24} />
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

      {/* Sidebar Overlay (History Panel) */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectStory={loadStory}
        currentStoryId={currentStoryId}
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
          storyTitle={storyTitle}
          onTitleChange={handleTitleChange}
          saveStatus={saveStatus}
          storyCreatedAt={storyCreatedAt}
          onScenesChange={syncScenes}
        />
      </div>
    </div>
  );
};

export default App;
