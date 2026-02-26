import React, { useState, useRef } from 'react';
import { Mic, Image as ImageIcon, X, SlidersHorizontal, Plus, ChevronDown, Wand2 } from 'lucide-react';
import { Button } from './Button';
import { transcribeAudio } from '../services/inputService';
import { Character, ComicStyle, AspectRatio } from '../types';

interface InputPanelProps {
  text: string;
  setText: (text: string) => void;
  images: string[];
  setImages: React.Dispatch<React.SetStateAction<string[]>>;
  onGenerate: () => void;
  isGenerating: boolean;
  openCharLib: () => void;
  onCharacterClick: (id: string) => void;
  characters: Character[];
  style: ComicStyle;
  setStyle: (s: ComicStyle) => void;
  ratio: AspectRatio;
  setRatio: (r: AspectRatio) => void;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  text, setText, images, setImages, onGenerate, isGenerating,
  openCharLib, onCharacterClick, characters, style, setStyle, ratio, setRatio
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Date formatting
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setIsTranscribing(true);
        try {
          const transText = await transcribeAudio(blob);
          setText(text ? text + '\n' + transText : transText);
        } catch (error) {
          console.error("Transcription failed", error);
          alert("语音识别失败，请重试");
        } finally {
          setIsTranscribing(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error", err);
      alert("无法访问麦克风");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Store full Data URL to preserve mime type
        const result = reader.result as string;
        setImages(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">New Memory</h1>
          <p className="text-sm text-gray-400">{dateStr}</p>
        </div>

        {/* Text Input */}
        <div className="mb-8 relative group">
          <textarea
            className="w-full min-h-[200px] text-lg leading-relaxed text-gray-700 placeholder-gray-300 resize-none outline-none border-none bg-transparent"
            placeholder="念念抽屉里翻出一个头发夹子..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
           {/* Voice Button Floating */}
           <button
            className={`absolute bottom-2 right-2 p-2 rounded-full transition-all ${
              isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-300 hover:text-primary-500'
            }`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            title="Hold to record"
          >
            <Mic size={20} />
          </button>
        </div>

        {/* Reference Photo */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reference Photo</h3>
          <div className="flex flex-wrap gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 group shadow-sm">
                <img src={img} alt="upload" className="w-full h-full object-cover" />
                <button 
                  onClick={() => removeImage(idx)}
                  className="absolute top-0 right-0 bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-lg"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-full text-sm font-medium transition-colors border border-gray-200"
            >
              <ImageIcon size={16} />
              Add Photo
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            multiple 
            onChange={handleImageUpload} 
          />
        </div>

        {/* Who is in this story? */}
        <div className="mb-8">
          <div className="flex justify-between items-end mb-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Who is in this story?</h3>
            <button onClick={openCharLib} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Manage</button>
          </div>
          {(() => {
            const matched = text.trim()
              ? characters.filter(c => text.toLowerCase().includes(c.name.toLowerCase()))
              : [];
            return (
              <div className="flex flex-wrap gap-4">
                {matched.map(char => (
                  <div
                    key={char.id}
                    className="flex flex-col items-center gap-1 group cursor-pointer"
                    title={char.name}
                    onClick={() => onCharacterClick(char.id)}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-transparent group-hover:border-primary-400 transition-colors shadow-sm">
                      <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xs text-gray-500">{char.name}</span>
                  </div>
                ))}
                {matched.length === 0 && text.trim() && (
                  <p className="text-xs text-gray-300 italic self-center">No matched characters</p>
                )}
                <button
                  onClick={openCharLib}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-primary-300 group-hover:text-primary-500 transition-colors bg-gray-50">
                    <Plus size={20} />
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-primary-500">Add</span>
                </button>
              </div>
            );
          })()}
        </div>

        {/* Settings Toggle Area (Collapsible) */}
        {showSettings && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100 animate-in fade-in slide-in-from-top-2">
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Style</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(ComicStyle).map(s => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      style === s ? 'bg-white border-primary-500 text-primary-600 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Ratio</label>
              <div className="flex gap-2">
                 {Object.values(AspectRatio).map(r => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      ratio === r ? 'bg-white border-primary-500 text-primary-600 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Action Bar */}
      <div className="p-4 border-t border-gray-100 bg-white flex items-center gap-3">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-3 rounded-xl border transition-all ${showSettings ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          title="Settings"
        >
          <SlidersHorizontal size={20} />
        </button>
        
        <Button 
          onClick={onGenerate} 
          disabled={(!text && images.length === 0) || isGenerating}
          isLoading={isGenerating}
          className="flex-1 h-12 rounded-xl text-base shadow-lg shadow-primary-100 flex items-center justify-center gap-2"
        >
           {!isGenerating && <Wand2 size={18} />}
           {isGenerating ? 'Creating Magic...' : 'Generate Comic'}
        </Button>
      </div>
    </div>
  );
};