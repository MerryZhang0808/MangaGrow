import React, { useState, useEffect, useMemo } from 'react';
import { X, BookOpen, FileDown, ChevronDown, ChevronUp, Loader2, ChevronRight } from 'lucide-react';
import { getStories, getStory, generateYearlySummary, SummaryStoryItem } from '../services/apiClient';
import { generateStoryBookPdf } from '../utils/pdfGenerator';
import { Character } from '../types';

// C41: GrowthAlbum is mutually exclusive with HistoryPanel — enforced in App.tsx

interface StorySummary {
  id: string;
  title: string | null;
  inputText: string | null;
  createdAt: number;
  posterUrl: string | null;
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

type DatePreset = 'month' | 'half' | 'year' | 'custom';

interface DateRange {
  preset: DatePreset;
  from: number;  // timestamp ms
  to: number;    // timestamp ms
}

interface GrowthAlbumProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function presetToRange(preset: Exclude<DatePreset, 'custom'>): { from: number; to: number } {
  const now = Date.now();
  const MS_MONTH = 30 * 24 * 60 * 60 * 1000;
  switch (preset) {
    case 'month': return { from: now - MS_MONTH, to: now };
    case 'half':  return { from: now - 6 * MS_MONTH, to: now };
    case 'year':  return { from: now - 12 * MS_MONTH, to: now };
  }
}

function tsToInputDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function inputDateToTs(str: string): number {
  return new Date(str).getTime();
}

function formatDateLabel(from: number, to: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  return `${fmt(from)} - ${fmt(to)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const GrowthAlbum: React.FC<GrowthAlbumProps> = ({
  isOpen, onClose, characters,
}) => {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Read-only detail panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // PDF panel state
  const [isPdfPanelOpen, setIsPdfPanelOpen] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const { from, to } = presetToRange('month');
    return { preset: 'month', from, to };
  });

  // Fetch every time the album opens (no cache — always fresh)
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getStories()
        .then((data: any[]) => setStories(data))
        .catch(e => console.error('[GrowthAlbum] Failed to load stories:', e))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  // Load full detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setIsLoadingDetail(true);
    getStory(selectedId)
      .then((data: any) => setDetail(data))
      .catch(e => console.error('[GrowthAlbum] Failed to load detail:', e))
      .finally(() => setIsLoadingDetail(false));
  }, [selectedId]);

  // Client-side grouping by year, descending order
  const groupedByYear = useMemo(() => {
    const map = new Map<number, StorySummary[]>();
    [...stories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach(s => {
        const year = new Date(s.createdAt).getFullYear();
        if (!map.has(year)) map.set(year, []);
        map.get(year)!.push(s);
      });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [stories]);

  // Stories within the selected date range
  const filteredStories = useMemo(() =>
    stories.filter(s => s.createdAt >= dateRange.from && s.createdAt <= dateRange.to),
    [stories, dateRange]
  );

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

  // ── Preset selector ──

  const handlePresetChange = (preset: Exclude<DatePreset, 'custom'>) => {
    const { from, to } = presetToRange(preset);
    setDateRange({ preset, from, to });
  };

  const handleCustomFrom = (val: string) => {
    setDateRange(prev => ({ ...prev, preset: 'custom', from: inputDateToTs(val) }));
  };

  const handleCustomTo = (val: string) => {
    setDateRange(prev => ({ ...prev, preset: 'custom', to: inputDateToTs(val) }));
  };

  // ── PDF generation ──

  const handleGeneratePdf = async () => {
    if (filteredStories.length === 0 || isPdfGenerating) return;

    setIsPdfGenerating(true);
    try {
      // C40: generateYearlySummary already handles fallback internally
      const summaryItems: SummaryStoryItem[] = filteredStories.map(s => ({
        title: s.title || s.inputText?.slice(0, 20) || '未命名故事',
        inputText: s.inputText || '',
      }));
      const yearlySummary = await generateYearlySummary(summaryItems);

      const characterName = characters.length > 0 ? characters[0].name : '成长故事书';
      const dateLabel = formatDateLabel(dateRange.from, dateRange.to);

      const blob = await generateStoryBookPdf({
        dateLabel,
        characterName,
        yearlySummary,
        stories: filteredStories.map(s => ({
          title: s.title || s.inputText?.slice(0, 20) || '未命名故事',
          createdAt: s.createdAt,
          posterUrl: s.posterUrl,
          inputText: s.inputText,
        })),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `成长故事书_${dateLabel}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[GrowthAlbum] PDF generation failed:', e);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  if (!isOpen) return null;

  const PRESETS: { key: Exclude<DatePreset, 'custom'>; label: string }[] = [
    { key: 'month', label: '最近一个月' },
    { key: 'half',  label: '最近半年' },
    { key: 'year',  label: '最近一年' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">成长相册</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPdfPanelOpen(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <FileDown size={16} />
            生成 PDF 故事书
            {isPdfPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-800 transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── PDF Configuration Panel ── */}
      {isPdfPanelOpen && (
        <div className="flex-shrink-0 px-8 py-5 bg-purple-50 border-b border-purple-100">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-gray-700 mb-3">选择故事日期范围</p>

            {/* Preset buttons */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    dateRange.preset === key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setDateRange(prev => ({ ...prev, preset: 'custom' }))}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  dateRange.preset === 'custom'
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                }`}
              >
                自定义
              </button>
            </div>

            {/* Custom date pickers */}
            {dateRange.preset === 'custom' && (
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="date"
                  value={tsToInputDate(dateRange.from)}
                  onChange={e => handleCustomFrom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary-400"
                />
                <span className="text-gray-400 text-sm">至</span>
                <input
                  type="date"
                  value={tsToInputDate(dateRange.to)}
                  onChange={e => handleCustomTo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary-400"
                />
              </div>
            )}

            {/* Story count + generate button */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                已选 <span className="font-semibold text-primary-600">{filteredStories.length}</span> 个故事
              </span>
              <button
                onClick={handleGeneratePdf}
                disabled={filteredStories.length === 0 || isPdfGenerating}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
              >
                {isPdfGenerating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <FileDown size={15} />
                    生成 PDF
                  </>
                )}
              </button>
              {filteredStories.length === 0 && (
                <span className="text-xs text-gray-400">所选时间段内无故事</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Body: grid + read-only detail panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: scrollable story grid */}
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-gray-50/30">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : groupedByYear.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                <BookOpen size={32} />
              </div>
              <p className="text-gray-500 font-medium">还没有保存的故事，去创作第一个吧！</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {groupedByYear.map(([year, yearStories]) => (
                <div key={year} className="mb-12">
                  {/* Year header */}
                  <div className="flex items-center gap-4 mb-5">
                    <h2 className="text-2xl font-bold text-gray-800 flex-shrink-0">{year} 年</h2>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-sm text-gray-400 flex-shrink-0">{yearStories.length} 个故事</span>
                  </div>

                  {/* Story cards grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {yearStories.map(story => (
                      <div
                        key={story.id}
                        onClick={() => setSelectedId(story.id)}
                        className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group ${
                          selectedId === story.id
                            ? 'border-primary-300 ring-2 ring-primary-200'
                            : 'border-gray-100 hover:border-primary-200'
                        }`}
                      >
                        {/* Poster thumbnail (v1.8) */}
                        <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                          {story.posterUrl ? (
                            <img
                              src={story.posterUrl}
                              alt={story.title || ''}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-200">
                              <BookOpen size={32} />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm text-gray-900 truncate">
                              {story.title || story.inputText?.slice(0, 12) || '未命名故事'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{formatDate(story.createdAt)}</p>
                          </div>
                          {selectedId === story.id && (
                            <ChevronRight size={14} className="text-primary-500 flex-shrink-0 ml-1" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: read-only detail panel (shown when a story is selected) */}
        {selectedId && (
          <div className="w-[420px] flex-shrink-0 border-l border-gray-100 overflow-y-auto bg-white">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            ) : detail ? (
              <div className="p-6">
                {/* Close detail button */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{detail.title || '未命名故事'}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {new Date(detail.createdAt).toLocaleDateString('zh-CN', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                    title="关闭详情"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Poster large image */}
                {detail.posterUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm mb-5">
                    <img src={detail.posterUrl} alt="故事海报" className="w-full" />
                  </div>
                )}

                {/* Original input text */}
                {detail.inputText && (
                  <div className="mb-5">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      原始记录
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {detail.inputText}
                    </p>
                  </div>
                )}

                {/* Input photos */}
                {detail.inputPhotos.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      参考照片
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
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
        )}
      </div>
    </div>
  );
};
