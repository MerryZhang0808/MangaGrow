import React, { useState, useEffect } from 'react';
import { InputPanel } from './components/InputPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { CharacterLibrary } from './components/CharacterLibrary';
import { Button } from './components/Button';
import { ComicStyle, AspectRatio, Scene, Character, KeyObject } from './types';
import { analyzeImages } from './services/inputService';
import { generateStory } from './services/storyService';
import { generateSceneImage } from './services/imageService';
import { getCharacterReferences } from './services/characterService';
import { BookOpen, User, Plus, KeyRound } from 'lucide-react';

const LOCAL_STORAGE_KEY_CHARS = 'comic_app_characters';

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
  const [storyCharacters, setStoryCharacters] = useState<KeyObject[]>([]); // Contains MERGED list of Library + Temp
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");

  // State: Sidebar
  const [isCharLibOpen, setIsCharLibOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);

  // State: Auth
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  // Initialize
  useEffect(() => {
    const init = async () => {
      // Load Chars
      const savedChars = localStorage.getItem(LOCAL_STORAGE_KEY_CHARS);
      if (savedChars) {
        setCharacters(JSON.parse(savedChars));
      }

      // Check Key
      const win = window as any;
      if (win.aistudio) {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for dev environments without the bridge
        setHasApiKey(true);
      }
      setIsCheckingKey(false);
    };
    init();
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_CHARS, JSON.stringify(characters));
  }, [characters]);

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      await win.aistudio.openSelectKey();
    }
    // Race condition mitigation: assume success
    setHasApiKey(true);
  };

  // Main Generation Logic — uses storyService pipeline + imageService
  const handleGenerate = async () => {
    if (!inputText && inputImages.length === 0) return;
    setIsGenerating(true);
    setGenerationStage("分析输入内容...");
    setScenes([]);
    setKeyObjects([]);
    setStoryCharacters([]);

    try {
      // 1. Analyze Images via inputService
      let imageAnalysis: import('./types').ImageAnalysis[] = [];
      if (inputImages.length > 0) {
        setGenerationStage("分析照片内容...");
        try {
          imageAnalysis = await analyzeImages(inputImages);
        } catch (e) {
          console.error("Image analysis failed, proceeding with text only", e);
        }
      }

      // 2. Generate Story via storyService (5-step pipeline)
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
          console.log(`Adding new temporary character: ${char.name}`);
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

      // 3. Generate Images via imageService (streaming effect)
      let previousGeneratedImage: string | null = null;

      for (let i = 0; i < initialScenes.length; i++) {
        const scene = initialScenes[i];

        // 1:1 mapping: scene i uses input image i (if available)
        const specificInputImage = (inputImages && inputImages[i]) ? [inputImages[i]] : [];

        // Continuity: use previous scene image if no user photo for this scene
        const continuityReference: string[] = [];
        if (i > 0 && previousGeneratedImage && specificInputImage.length === 0) {
          continuityReference.push(previousGeneratedImage);
        }

        try {
          // Get relevant character references via characterService
          const sortedRefChars = getCharacterReferences(characters, scene.script);

          const referenceImages = specificInputImage.length > 0 ? specificInputImage : continuityReference;

          setGenerationStage(`绘制第 ${i + 1}/${initialScenes.length} 幅画面...`);

          const imageUrl = await generateSceneImage({
            script: scene.script,
            style,
            ratio,
            characterContext,
            objectContext,
            referenceChars: sortedRefChars.map(r => {
              const full = characters.find(c => c.name === r.name);
              return full || { id: '', name: r.name, avatarUrl: r.avatarUrl, description: r.description, originalPhotoUrls: [], createdAt: 0 };
            }),
            sceneReferenceImages: referenceImages,
            isUserPhoto: specificInputImage.length > 0
          });

          previousGeneratedImage = imageUrl;

          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, imageUrl, isLoading: false } : s
          ));
        } catch (error) {
          console.error(`Failed to generate image for scene ${scene.sceneNumber}`, error);
          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, isLoading: false, error: "Image generation failed" } : s
          ));
        }
      }

    } catch (error) {
      console.error("Workflow failed", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      if (msg.includes("403") || msg.includes("Permission Denied")) {
        alert("API Key权限不足或无效。请尝试重新选择 API Key。");
        setHasApiKey(false);
      } else {
        alert(msg);
      }
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

  if (isCheckingKey) {
    return <div className="flex h-screen w-screen items-center justify-center bg-white text-gray-400">Loading...</div>;
  }

  if (!hasApiKey) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 flex-col gap-6 p-4">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">漫画成长记录</h1>
          <p className="text-gray-500 max-w-md">
             Transform your child's growth moments into heartwarming comic strips using AI.
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full max-w-md">
          <p className="text-sm text-gray-600 mb-4 text-center">
            要使用此应用，您需要选择一个 Google Gemini API Key。<br/>
            请确保该 Key 关联了已开通计费的 Google Cloud 项目。
          </p>
          <Button onClick={handleSelectKey} className="w-full h-12 text-base">
            <KeyRound size={18} className="mr-2" />
            连接 API Key
          </Button>
          <div className="mt-4 text-center">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">
              关于计费说明
            </a>
          </div>
        </div>
      </div>
    );
  }

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
          {/* Settings / Profile */}
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-primary-50 hover:text-primary-600 transition-colors">
            <div className="w-full h-full rounded-full overflow-hidden">
               {/* Placeholder avatar */}
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
          libraryCharacters={characters} // Pass full library for reference lookup
          inputImages={inputImages} // PASS GLOBAL INPUT IMAGES FOR REGENERATION CONTEXT
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