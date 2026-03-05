import React, { useState, useEffect } from 'react';
import { X, Trash2, BookOpen } from 'lucide-react';
import { getStories, getStory, deleteStory } from '../services/apiClient';

// C43: Dual-column read-only history panel. No editing or redraw controls.
// C41: Full-screen overlay, mutually exclusive with GrowthAlbum.

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StorySummary {
  id: string;
  title: string | null;
  createdAt: number;
  posterUrl: string | null;
  inputText: string | null;
}

interface StoryDetail {
  id: string;
  title: string | null;
  createdAt: number;
  posterUrl: string | null;
  inputText: string | null;
  inputPhotos: string[];
  style: string | null;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose }) => {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Load story list when panel opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingList(true);
    getStories()
      .then((data: any[]) => {
        const summaries: StorySummary[] = data;
        setStories(summaries);
        // Default: select first (latest) story
        if (summaries.length > 0) {
          setSelectedId(prev => prev ?? summaries[0].id);
        }
      })
      .catch(e => console.error('[HistoryPanel] Failed to load stories:', e))
      .finally(() => setIsLoadingList(false));
  }, [isOpen]);

  // Load detail when selected story changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setIsLoadingDetail(true);
    getStory(selectedId)
      .then((data: any) => setDetail(data))
      .catch(e => console.error('[HistoryPanel] Failed to load detail:', e))
      .finally(() => setIsLoadingDetail(false));
  }, [selectedId]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个故事吗？此操作不可撤销。')) return;
    try {
      await deleteStory(id);
      const remaining = stories.filter(s => s.id !== id);
      setStories(remaining);
      // Auto-select adjacent story after delete
      if (selectedId === id) {
        const deletedIndex = stories.findIndex(s => s.id === id);
        const next = remaining[deletedIndex] || remaining[deletedIndex - 1] || null;
        setSelectedId(next?.id ?? null);
        if (!next) setDetail(null);
      }
    } catch (err) {
      console.error('[HistoryPanel] Delete failed:', err);
      alert('删除失败，请重试');
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'numeric', day: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-gray-100 flex items-center px-6 flex-shrink-0 bg-white">
        <button
          onClick={onClose}
          className="mr-4 p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="关闭"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-bold text-gray-900">历史记录</h2>
        {stories.length > 0 && (
          <span className="ml-2 text-sm text-gray-400">({stories.length})</span>
        )}
      </div>

      {/* Body: left list + right detail (C43) */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left column: 280px fixed, vertically scrollable */}
        <div className="w-[280px] flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50/50">
          {isLoadingList ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <BookOpen size={32} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">还没有创作记录</p>
              <p className="text-xs text-gray-400 mt-1">开始你的第一个故事吧！</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {stories.map(story => (
                <div
                  key={story.id}
                  onClick={() => setSelectedId(story.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedId === story.id
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-gray-100 bg-white hover:border-primary-200 hover:shadow-sm'
                  }`}
                >
                  {/* Poster thumbnail */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {story.posterUrl ? (
                      <img src={story.posterUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <BookOpen size={18} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {story.title || story.inputText?.slice(0, 12) || '未命名故事'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(story.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: read-only detail (C43) */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-gray-200">
              <BookOpen size={48} />
            </div>
          ) : isLoadingDetail ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : detail ? (
            <div className="max-w-2xl mx-auto p-8">
              {/* Title + delete */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {detail.title || '未命名故事'}
                  </h1>
                  <p className="text-sm text-gray-400 mt-1">{formatDate(detail.createdAt)}</p>
                </div>
                <button
                  onClick={() => handleDelete(detail.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="删除故事"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Poster large image */}
              {detail.posterUrl && (
                <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-6">
                  <img src={detail.posterUrl} alt="故事海报" className="w-full" />
                </div>
              )}

              {/* Original input text */}
              {detail.inputText && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    原始记录
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {detail.inputText}
                  </p>
                </div>
              )}

              {/* Input photos (if any) */}
              {detail.inputPhotos.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    参考照片
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {detail.inputPhotos.map((url, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img src={url} alt={`照片 ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
