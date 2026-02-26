import React, { useState } from 'react';
import { Scene, ComicStyle, AspectRatio, KeyObject, Character } from '../types';
import { Button } from './Button';
import { RefreshCw, Download, Edit2, ChevronDown, Check, Loader2, ImagePlus } from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { generateSceneImage } from '../services/imageService';
import { getCharacterReferences } from '../services/characterService';
import { generatePoster } from '../utils/posterGenerator';

interface DisplayPanelProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  keyObjects: KeyObject[];
  storyCharacters: KeyObject[];
  libraryCharacters?: Character[];
  inputImages?: string[];
  isGenerating: boolean;
  generationStage?: string;
  style: ComicStyle;
  ratio: AspectRatio;
  onReset: () => void;
  storyTitle?: string;
  onTitleChange?: (title: string) => void;
  saveStatus?: 'idle' | 'saving' | 'saved';
  storyCreatedAt?: number | null;
  onScenesChange?: (scenes: Scene[]) => void;
}

export const DisplayPanel: React.FC<DisplayPanelProps> = ({
  scenes, setScenes, keyObjects, storyCharacters, libraryCharacters = [], inputImages = [],
  isGenerating, generationStage = "", style, ratio, onReset,
  storyTitle = '', onTitleChange, saveStatus = 'idle', storyCreatedAt, onScenesChange
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScript, setEditScript] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isContinueGenerating, setIsContinueGenerating] = useState(false);

  // Check if there are pending scenes (no image, not loading, no error)
  const pendingScenes = scenes.filter(s => !s.imageUrl && !s.isLoading && !s.error);
  const hasPendingScenes = pendingScenes.length > 0;

  // Continue generating remaining scenes
  const handleContinueGenerate = async () => {
    if (isContinueGenerating) return;
    setIsContinueGenerating(true);

    try {
      const characterContext = storyCharacters.map(c =>
        `[人物: ${c.name}]\n外貌特征: ${c.description}`
      ).join('\n\n');

      const objectContext = keyObjects.map(o =>
        `[物品: ${o.name}] ${o.description}`
      ).join('\n');

      // Mark pending scenes as loading
      setScenes(prev => prev.map(s =>
        (!s.imageUrl && !s.isLoading && !s.error) ? { ...s, isLoading: true } : s
      ));

      // Find the last scene with an image for continuity reference
      const scenesWithImages = scenes.filter(s => s.imageUrl);
      let previousGeneratedImage = scenesWithImages.length > 0
        ? scenesWithImages[scenesWithImages.length - 1].imageUrl || null
        : null;

      for (const scene of pendingScenes) {
        const sortedRefChars = getCharacterReferences(libraryCharacters, scene.script);
        const referenceCharIds = sortedRefChars
          .map(r => libraryCharacters.find(c => c.name === r.name)?.id)
          .filter(Boolean) as string[];

        const continuityRef = previousGeneratedImage ? [previousGeneratedImage] : [];

        try {
          const newImageUrl = await generateSceneImage({
            script: scene.script,
            style,
            ratio,
            characterContext,
            objectContext,
            referenceCharIds,
            sceneReferenceImages: continuityRef,
            isUserPhoto: false
          });

          setScenes(prev => {
            const updated = prev.map(s =>
              s.id === scene.id ? { ...s, isLoading: false, imageUrl: newImageUrl } : s
            );
            onScenesChange?.(updated);
            return updated;
          });
          if (newImageUrl) previousGeneratedImage = newImageUrl;
        } catch (e) {
          console.error(`Failed to generate image for scene ${scene.sceneNumber}`, e);
          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, isLoading: false, error: "Failed to generate" } : s
          ));
        }
      }
    } finally {
      setIsContinueGenerating(false);
    }
  };

  const handleEditStart = (scene: Scene) => {
    setEditingId(scene.id);
    setEditScript(scene.script);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditScript("");
  };

  const handleRegenerateScene = async (id: string, newScript?: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isLoading: true, script: newScript || s.script } : s));
    setEditingId(null);

    try {
      const sceneToUpdate = scenes.find(s => s.id === id);
      const scriptToUse = newScript || sceneToUpdate?.script || "";

      const characterContext = storyCharacters.map(c =>
        `[人物: ${c.name}]\n外貌特征: ${c.description}`
      ).join('\n\n');

      const objectContext = keyObjects.map(o =>
        `[物品: ${o.name}] ${o.description}`
      ).join('\n');

      const sortedRefChars = getCharacterReferences(libraryCharacters, scriptToUse);

      let specificRefImage: string[] = [];
      if (inputImages.length > 0 && sceneToUpdate) {
        const index = sceneToUpdate.sceneNumber - 1;
        if (index >= 0 && index < inputImages.length) {
          specificRefImage = [inputImages[index]];
        }
      }

      const continuityReference: string[] = [];
      if (specificRefImage.length === 0 && sceneToUpdate && sceneToUpdate.sceneNumber > 1) {
        const prevScene = scenes.find(s => s.sceneNumber === sceneToUpdate.sceneNumber - 1);
        if (prevScene && prevScene.imageUrl) {
          continuityReference.push(prevScene.imageUrl);
        }
      }

      const sceneReferenceImages = specificRefImage.length > 0 ? specificRefImage : continuityReference;

      const referenceCharIds = sortedRefChars
        .map(r => libraryCharacters.find(c => c.name === r.name)?.id)
        .filter(Boolean) as string[];

      const newImageUrl = await generateSceneImage({
        script: scriptToUse,
        style,
        ratio,
        characterContext,
        objectContext,
        referenceCharIds,
        sceneReferenceImages,
        isUserPhoto: specificRefImage.length > 0
      });

      setScenes(prev => {
        const updated = prev.map(s =>
          s.id === id ? { ...s, isLoading: false, imageUrl: newImageUrl } : s
        );
        // C28: sync after redraw
        onScenesChange?.(updated);
        return updated;
      });
    } catch (e) {
      console.error(e);
      setScenes(prev => prev.map(s => s.id === id ? { ...s, isLoading: false, error: "Failed to regenerate" } : s));
    }
  };

  // Script edit + redraw triggers sync
  const handleSaveAndRedraw = (id: string, newScript: string) => {
    handleRegenerateScene(id, newScript);
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const zip = new JSZip();
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (scene.imageUrl) {
          try {
            const response = await fetch(scene.imageUrl);
            const blob = await response.blob();
            const ext = blob.type.includes('png') ? 'png' : 'jpg';
            zip.file(`scene_${i + 1}.${ext}`, blob);
          } catch (e) {
            console.warn(`Failed to fetch scene ${i + 1} image for export`, e);
          }
        }
      }
      const fullScript = scenes.map((s, i) => `Scene ${i+1}: ${s.script}`).join('\n\n');
      zip.file('story_script.txt', fullScript);
      const content = await zip.generateAsync({ type: 'blob' });
      const filename = storyTitle ? `${storyTitle}.zip` : `comic_story_${Date.now()}.zip`;
      saveAs(content, filename);
    } finally {
      setIsExporting(false);
    }
  };

  // C29, C30: Poster export via native Canvas
  const handleExportPoster = async () => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const posterScenes = scenes
        .filter(s => s.imageUrl && !s.isLoading)
        .map(s => ({ imageUrl: s.imageUrl!, caption: s.caption || s.script.slice(0, 30) + '...' }));

      if (posterScenes.length === 0) {
        alert('没有可用的图片来生成海报');
        return;
      }

      const dateStr = storyCreatedAt
        ? new Date(storyCreatedAt).toLocaleDateString('zh-CN')
        : new Date().toLocaleDateString('zh-CN');

      const blob = await generatePoster({
        title: storyTitle || '未命名故事',
        date: dateStr,
        scenes: posterScenes
      });

      const filename = storyTitle ? `${storyTitle}_poster.png` : `comic_poster_${Date.now()}.png`;
      saveAs(blob, filename);
    } catch (e) {
      console.error('Poster generation failed:', e);
      alert('海报生成失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  const handleTitleClick = () => {
    if (onTitleChange) {
      setIsEditingTitle(true);
      setEditTitleValue(storyTitle);
    }
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
    if (editTitleValue !== storyTitle) {
      onTitleChange?.(editTitleValue);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  if (scenes.length === 0 && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300">
        <div className="w-32 h-32 border-4 border-dashed border-gray-200 rounded-xl flex items-center justify-center mb-4">
          <span className="text-6xl grayscale opacity-20">🖼️</span>
        </div>
        <p className="font-medium text-gray-400">Waiting for your story...</p>
      </div>
    );
  }

  // Pipeline progress view
  if (scenes.length === 0 && isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-lg font-semibold text-gray-700">{generationStage || "准备中..."}</p>
          <p className="text-sm text-gray-400">AI 正在创作你的故事，请稍候</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {/* Top Info Bar — title + date + save status */}
      {(storyTitle || storyCreatedAt) && (
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-8 py-5">
          <div className="flex flex-col items-center">
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-primary-500 outline-none px-0 py-1 min-w-[200px] text-center"
                autoFocus
              />
            ) : (
              <h2
                onClick={handleTitleClick}
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-primary-600 transition-colors"
                title="点击编辑标题"
              >
                {storyTitle || '未命名故事'}
              </h2>
            )}
            <div className="flex items-center gap-3 mt-1">
              {storyCreatedAt && (
                <span className="text-sm text-gray-400">
                  {formatDate(storyCreatedAt)}
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> 保存中...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-sm text-green-500">
                  <Check size={14} /> 已保存
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comic Grid */}
      <div className="p-4 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-6xl mx-auto pb-32">
          {scenes.map((scene, index) => (
            <div key={scene.id} className="group relative flex flex-col bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1">

              {/* Number Badge */}
              <div className="absolute top-0 left-0 bg-black text-white text-xs font-bold px-2 py-1 z-10">
                {index + 1}
              </div>

              {/* Image Area */}
              <div className="aspect-[4/3] w-full bg-gray-100 relative overflow-hidden flex items-center justify-center border-b-2 border-black">
                {scene.isLoading ? (
                   <div className="flex flex-col items-center text-gray-400 animate-pulse">
                     <RefreshCw className="animate-spin mb-2" size={24} />
                     <span className="text-xs font-bold tracking-widest uppercase">Drawing...</span>
                   </div>
                ) : scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={`Scene ${index + 1}`} className="w-full h-full object-cover" />
                ) : scene.error ? (
                  <span className="text-gray-400 text-xs uppercase tracking-widest">Error</span>
                ) : (
                  <div className="flex flex-col items-center text-gray-300">
                    <ImagePlus size={32} className="mb-2" />
                    <span className="text-xs font-medium text-gray-400">待生成</span>
                  </div>
                )}

                {/* Action Overlay */}
                {!scene.isLoading && !editingId && (
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button
                      onClick={() => handleRegenerateScene(scene.id)}
                      className="bg-white text-black border border-black p-1.5 hover:bg-black hover:text-white transition-colors"
                      title="Redraw"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => handleEditStart(scene)}
                      className="bg-white text-black border border-black p-1.5 hover:bg-black hover:text-white transition-colors"
                      title="Edit Script"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Edit Script Bubble (popup when editing) */}
              {editingId === scene.id && (
                <div className="absolute inset-x-0 bottom-0 z-20 mx-2 mb-2">
                  <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-lg p-3">
                    {/* Bubble arrow */}
                    <div className="absolute -top-2 right-8 w-4 h-2 overflow-hidden">
                      <div className="w-3 h-3 bg-white border-l-2 border-t-2 border-black rotate-45 translate-y-1 translate-x-0.5" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Edit Script</p>
                    <textarea
                      className="w-full p-2 text-xs border border-gray-200 focus:border-black outline-none resize-none bg-gray-50 font-mono leading-relaxed"
                      rows={5}
                      value={editScript}
                      onChange={(e) => setEditScript(e.target.value)}
                      autoFocus
                    />
                    <div className="flex justify-end gap-3 mt-2">
                      <button onClick={handleEditCancel} className="text-xs font-bold text-gray-400 hover:text-black transition-colors">Cancel</button>
                      <button onClick={() => handleSaveAndRedraw(scene.id, editScript)} className="text-xs font-bold text-primary-600 hover:text-primary-800 transition-colors">Save & Redraw</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Caption Area */}
              <div className="px-4 py-3 bg-white border-t-2 border-black">
                <p className="text-gray-700 text-sm leading-relaxed text-center">
                  {scene.caption || scene.script.slice(0, 30) + (scene.script.length > 30 ? '...' : '')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Action Bar */}
      {scenes.length > 0 && (
        <div className="fixed bottom-6 right-6 flex gap-3 z-50">
           {hasPendingScenes && (
             <Button
               onClick={handleContinueGenerate}
               disabled={isContinueGenerating}
               className="shadow-xl border-2 border-white bg-primary-600 hover:bg-primary-700 text-white"
             >
               {isContinueGenerating ? (
                 <Loader2 size={18} className="mr-2 animate-spin" />
               ) : (
                 <ImagePlus size={18} className="mr-2" />
               )}
               继续生成 ({pendingScenes.length})
             </Button>
           )}
           <Button variant="secondary" onClick={() => scenes.forEach(s => handleRegenerateScene(s.id))} className="shadow-xl border-2 border-white">
             <RefreshCw size={18} className="mr-2" /> Redraw All
           </Button>

           {/* Export Dropdown */}
           <div className="relative">
             <Button
               onClick={() => setShowExportMenu(!showExportMenu)}
               disabled={scenes.some(s => s.isLoading) || isExporting}
               className="shadow-xl border-2 border-white bg-black hover:bg-gray-800 text-white"
             >
               {isExporting ? (
                 <Loader2 size={18} className="mr-2 animate-spin" />
               ) : (
                 <Download size={18} className="mr-2" />
               )}
               Export
               <ChevronDown size={14} className="ml-1" />
             </Button>

             {showExportMenu && (
               <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden min-w-[160px]">
                 <button
                   onClick={handleExportPoster}
                   className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                 >
                   导出海报
                 </button>
                 <button
                   onClick={handleExportZip}
                   className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                 >
                   导出 ZIP
                 </button>
               </div>
             )}
           </div>
        </div>
      )}
    </div>
  );
};
