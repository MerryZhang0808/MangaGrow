import React, { useState } from 'react';
import { Scene, ComicStyle, AspectRatio, KeyObject, Character } from '../types';
import { Button } from './Button';
import { RefreshCw, Download, Edit2 } from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { generateSceneImage } from '../services/imageService';
import { getCharacterReferences } from '../services/characterService';

interface DisplayPanelProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  keyObjects: KeyObject[];
  storyCharacters: KeyObject[]; // Defines WHO is in the story (Name + Text Description)
  libraryCharacters?: Character[]; // Contains the actual IMAGES (AvatarUrl) of known characters
  inputImages?: string[]; // Original user uploaded scene photos
  isGenerating: boolean;
  generationStage?: string;
  style: ComicStyle;
  ratio: AspectRatio;
  onReset: () => void;
}

export const DisplayPanel: React.FC<DisplayPanelProps> = ({
  scenes, setScenes, keyObjects, storyCharacters, libraryCharacters = [], inputImages = [], isGenerating, generationStage = "", style, ratio, onReset
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScript, setEditScript] = useState("");

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

      // Get sorted character references via characterService
      const sortedRefChars = getCharacterReferences(libraryCharacters, scriptToUse);

      // Select specific input image if available for this scene (1:1 mapping)
      let specificRefImage: string[] = [];
      if (inputImages.length > 0 && sceneToUpdate) {
        const index = sceneToUpdate.sceneNumber - 1;
        if (index >= 0 && index < inputImages.length) {
          specificRefImage = [inputImages[index]];
        }
      }

      // Continuity: use previous scene's image if no user photo for this scene
      const continuityReference: string[] = [];
      if (specificRefImage.length === 0 && sceneToUpdate && sceneToUpdate.sceneNumber > 1) {
        const prevScene = scenes.find(s => s.sceneNumber === sceneToUpdate.sceneNumber - 1);
        if (prevScene && prevScene.imageUrl) {
          continuityReference.push(prevScene.imageUrl);
        }
      }

      const sceneReferenceImages = specificRefImage.length > 0 ? specificRefImage : continuityReference;

      const newImageUrl = await generateSceneImage({
        script: scriptToUse,
        style,
        ratio,
        characterContext,
        objectContext,
        referenceChars: sortedRefChars.map(r => {
          const full = libraryCharacters.find(c => c.name === r.name);
          return full || { id: '', name: r.name, avatarUrl: r.avatarUrl, description: r.description, originalPhotoUrls: [], createdAt: 0 };
        }),
        sceneReferenceImages,
        isUserPhoto: specificRefImage.length > 0
      });

      setScenes(prev => prev.map(s =>
        s.id === id ? { ...s, isLoading: false, imageUrl: newImageUrl } : s
      ));
    } catch (e) {
      console.error(e);
      setScenes(prev => prev.map(s => s.id === id ? { ...s, isLoading: false, error: "Failed to regenerate" } : s));
    }
  };

  const handleExport = async () => {
    const zip = new JSZip();
    scenes.forEach((scene, i) => {
      if (scene.imageUrl) {
        const base64Data = scene.imageUrl.split(',')[1];
        const mime = scene.imageUrl.split(';')[0].split(':')[1];
        const ext = mime.split('/')[1];
        zip.file(`scene_${i + 1}.${ext}`, base64Data, { base64: true });
      }
    });
    const fullScript = scenes.map((s, i) => `Scene ${i+1}: ${s.script}`).join('\n\n');
    zip.file('story_script.txt', fullScript);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `comic_story_${Date.now()}.zip`);
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

  // Pipeline progress view: show when generating but no scenes yet
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
    <div className="h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
      {/* Comic Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-6xl mx-auto pb-32">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="group relative flex flex-col h-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1">
            
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
              ) : (
                <span className="text-gray-400 text-xs uppercase tracking-widest">Error</span>
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

            {/* Text Area */}
            <div className="p-4 flex-1 flex flex-col justify-center bg-white min-h-[100px]">
              {editingId === scene.id ? (
                <div className="flex flex-col h-full">
                  <textarea 
                    className="flex-1 w-full p-2 text-sm border-2 border-gray-200 focus:border-black outline-none resize-none bg-gray-50 mb-2 font-mono"
                    value={editScript}
                    onChange={(e) => setEditScript(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={handleEditCancel} className="text-xs uppercase font-bold text-gray-500 hover:text-black">Cancel</button>
                    <button onClick={() => handleRegenerateScene(scene.id, editScript)} className="text-xs uppercase font-bold text-primary-600 hover:text-primary-800">Save & Redraw</button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-900 font-medium text-sm md:text-base leading-snug text-center font-[Comic_Sans_MS,sans-serif]">
                  {scene.script}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Action Bar */}
      {scenes.length > 0 && (
        <div className="fixed bottom-6 right-6 flex gap-3 z-50">
           <Button variant="secondary" onClick={() => scenes.forEach(s => handleRegenerateScene(s.id))} className="shadow-xl border-2 border-white">
             <RefreshCw size={18} className="mr-2" /> Redraw All
           </Button>
           <Button onClick={handleExport} disabled={scenes.some(s => s.isLoading)} className="shadow-xl border-2 border-white bg-black hover:bg-gray-800 text-white">
             <Download size={18} className="mr-2" /> Export
           </Button>
        </div>
      )}
    </div>
  );
};
