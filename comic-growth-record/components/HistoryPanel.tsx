import React, { useState, useEffect } from 'react';
import { X, Trash2, BookOpen } from 'lucide-react';
import { getStories, deleteStory } from '../services/apiClient';

// C32: Interaction pattern must match CharacterLibrary (folding sidebar, close button, animation)

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStory: (storyId: string) => void;
  currentStoryId: string | null;
}

interface StorySummaryItem {
  id: string;
  title: string | null;
  inputSummary: string;
  createdAt: number;
  thumbnailUrl: string | null;
  scenes: any[];
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  isOpen, onClose, onSelectStory, currentStoryId
}) => {
  const [stories, setStories] = useState<StorySummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch stories when panel opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getStories()
        .then((data: any[]) => {
          setStories(data);
        })
        .catch(e => console.error('[HistoryPanel] Failed to load stories:', e))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除这个故事吗？')) return;
    try {
      await deleteStory(id);
      setStories(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('[HistoryPanel] Delete failed:', err);
      alert('删除失败，请重试');
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide Panel — same pattern as CharacterLibrary */}
      <div className={`fixed inset-y-0 left-0 w-[350px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} border-r border-gray-100`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
            <h2 className="text-xl font-bold text-gray-900">History</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            ) : stories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                  <BookOpen size={32} />
                </div>
                <p className="text-gray-500 font-medium">还没有创作记录</p>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px]">开始你的第一个故事吧！</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stories.map(story => (
                  <div
                    key={story.id}
                    onClick={() => onSelectStory(story.id)}
                    className={`group flex items-center gap-3 p-3 rounded-2xl bg-white border shadow-sm hover:shadow-md transition-all cursor-pointer ${
                      currentStoryId === story.id
                        ? 'border-primary-300 bg-primary-50/50'
                        : 'border-gray-100 hover:border-primary-200'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                      {story.thumbnailUrl ? (
                        <img src={story.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <BookOpen size={20} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate text-sm">
                        {story.title || story.inputSummary?.slice(0, 15) || '未命名故事'}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{formatDate(story.createdAt)}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{story.scenes?.length || 0} 分镜</span>
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={(e) => handleDelete(story.id, e)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
