import React from 'react';
import { ComicStyle, AspectRatio } from '../types';
import { Button } from './Button';

interface OptionsPanelProps {
  style: ComicStyle;
  setStyle: (s: ComicStyle) => void;
  ratio: AspectRatio;
  setRatio: (r: AspectRatio) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  style, setStyle, ratio, setRatio, onGenerate, isGenerating
}) => {
  return (
    <div className="h-full bg-gray-50 p-6 border-r border-gray-200 flex flex-col">
      <h2 className="text-lg font-bold text-gray-800 mb-6">⚙️ 选项设置</h2>

      {/* Style */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-3">漫画风格</label>
        <div className="space-y-2">
          {Object.values(ComicStyle).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                style === s 
                  ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium ring-1 ring-primary-500' 
                  : 'bg-white border-gray-200 text-gray-600 hover:border-primary-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Ratio */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-3">图片比例</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(AspectRatio).map((r) => (
            <button
              key={r}
              onClick={() => setRatio(r)}
              className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                ratio === r
                  ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-primary-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <Button 
          onClick={onGenerate} 
          variant="secondary" 
          size="lg" 
          className="w-full shadow-lg shadow-secondary-200"
          isLoading={isGenerating}
        >
          {isGenerating ? '生成中...' : '开始生成 ✨'}
        </Button>
      </div>
    </div>
  );
};