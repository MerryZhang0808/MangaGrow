import React, { useState, useRef } from 'react';
import { Mic, Image as ImageIcon, X, SlidersHorizontal, Plus, ChevronDown, Wand2, Video, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { transcribeAudio } from '../services/inputService';
import { Character, ComicStyle, AspectRatio, VideoAnalysis } from '../types';

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
  // v2.0: Video props
  videoAnalysis: VideoAnalysis | null;
  isVideoAnalyzing: boolean;
  videoError: string | null;
  onVideoUpload: (file: File) => void;
  onVideoRetry: () => void;
  onRemoveVideo: () => void;
  onRemoveKeyFrame: (index: number) => void;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  text, setText, images, setImages, onGenerate, isGenerating,
  openCharLib, onCharacterClick, characters, style, setStyle, ratio, setRatio,
  videoAnalysis, isVideoAnalyzing, videoError, onVideoUpload, onVideoRetry, onRemoveVideo, onRemoveKeyFrame
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  // v2.0: Video upload with C44 validation
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = '';

    // C44: Format validation
    const validTypes = ['video/mp4', 'video/quicktime'];
    if (!validTypes.includes(file.type)) {
      alert('仅支持 MP4/MOV 格式的视频');
      return;
    }

    // C44: Size validation (500MB)
    if (file.size > 500 * 1024 * 1024) {
      alert('视频大小不能超过 500MB');
      return;
    }

    // C44: Only 1 video allowed
    if (videoAnalysis || isVideoAnalyzing) {
      alert('每次最多上传 1 段视频，请先删除当前视频');
      return;
    }

    // C44: Duration validation (3 min) — async via video element
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(videoEl.src);
      if (videoEl.duration > 180) {
        alert('视频时长不能超过 3 分钟');
        return;
      }
      // C45: Trigger analysis immediately
      onVideoUpload(file);
    };
    videoEl.onerror = () => {
      URL.revokeObjectURL(videoEl.src);
      alert('无法读取视频信息，请检查文件格式');
    };
    videoEl.src = URL.createObjectURL(file);
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

        {/* Reference Media */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reference Media</h3>
          <div className="flex flex-wrap gap-3">
            {/* Photo thumbnails */}
            {images.map((img, idx) => (
              <div key={`photo-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 group shadow-sm">
                <img src={img} alt="upload" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-0 right-0 bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-lg"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* v2.0: Video analysis states */}
            {isVideoAnalyzing && (
              <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-primary-200 bg-primary-50 flex flex-col items-center justify-center shadow-sm">
                <Loader2 size={20} className="text-primary-500 animate-spin" />
                <span className="text-[10px] text-primary-600 mt-1">AI 分析中</span>
              </div>
            )}

            {videoError && !isVideoAnalyzing && (
              <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-red-200 bg-red-50 flex flex-col items-center justify-center shadow-sm">
                <span className="text-[10px] text-red-500 text-center px-1">分析失败</span>
                <button onClick={onVideoRetry} className="mt-1 p-1 text-red-500 hover:text-red-700">
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={onRemoveVideo}
                  className="absolute top-0 right-0 bg-black/50 text-white p-1 rounded-bl-lg"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Key frame thumbnails (after analysis complete) */}
            {videoAnalysis?.keyFrames.map((frame) => (
              <div key={`frame-${frame.index}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-blue-200 group shadow-sm">
                <img src={frame.imageUrl} alt={`关键帧 ${frame.timestamp}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-white text-[9px] text-center py-0.5">
                  {frame.timestamp}
                </div>
                <button
                  onClick={() => onRemoveKeyFrame(frame.index)}
                  className="absolute top-0 right-0 bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-lg"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Action buttons */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-full text-sm font-medium transition-colors border border-gray-200"
            >
              <ImageIcon size={16} />
              Add Photo
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={isVideoAnalyzing || !!videoAnalysis}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-full text-sm font-medium transition-colors border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Video size={16} />
              Add Video
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
          <input
            type="file"
            ref={videoInputRef}
            className="hidden"
            accept="video/mp4,video/quicktime"
            onChange={handleVideoSelect}
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
          disabled={(!text && images.length === 0 && !videoAnalysis?.keyFrames?.length) || isGenerating || isVideoAnalyzing}
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