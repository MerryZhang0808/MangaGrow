// C39: All Chinese text must be rendered via Canvas fillText, not jsPDF.text (avoids font issues)
// C40: yearlySummary fallback to fixed text when AI fails — enforced in GrowthAlbum.tsx caller
// jsPDF is only imported here — do not import jspdf anywhere else in the project

import { jsPDF } from 'jspdf';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoryBookOptions {
  dateLabel: string;        // e.g. "2025年7月 - 2026年2月"
  characterName: string;    // Cover title (e.g. "念念"), fallback "成长故事书"
  yearlySummary: string;    // AI-generated or fallback summary text
  stories: Array<{
    title: string;
    createdAt: number;
    posterUrl: string | null;   // v1.8: full-page poster image
    inputText: string | null;   // v1.8: original input text
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// A4 at 72 dpi: 794 × 1123 px
const PAGE_W = 794;
const PAGE_H = 1123;

const COLORS = {
  bg: '#ffffff',
  title: '#1a1a1a',
  sub: '#555555',
  date: '#888888',
  caption: '#333333',
  watermark: '#cccccc',
  border: '#000000',
  placeholder: '#f0f0f0',
  placeholderText: '#aaaaaa',
  summaryTitle: '#1a1a1a',
  summaryBody: '#333333',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap text into lines fitting maxWidth (character-by-character, supports CJK) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Create an off-screen Canvas of A4 size */
function createA4Canvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  return canvas;
}

/** Convert canvas to JPEG data URL */
function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Load an image URL into ImageBitmap (returns null on failure) */
async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Draw a grey placeholder box */
function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = COLORS.placeholder;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.placeholderText;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('图片加载失败', x + w / 2, y + h / 2);
}

// ── Cover Page ────────────────────────────────────────────────────────────────

function renderCoverCanvas(characterName: string, dateLabel: string): HTMLCanvasElement {
  const canvas = createA4Canvas();
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Decorative top bar
  ctx.fillStyle = '#f5f0ff';
  ctx.fillRect(0, 0, PAGE_W, 180);

  // Main title — character name
  ctx.fillStyle = COLORS.title;
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(characterName, PAGE_W / 2, PAGE_H / 2 - 60);

  // Sub title
  ctx.fillStyle = COLORS.sub;
  ctx.font = '28px sans-serif';
  ctx.fillText('成长故事书', PAGE_W / 2, PAGE_H / 2);

  // Date range
  ctx.fillStyle = COLORS.date;
  ctx.font = '22px sans-serif';
  ctx.fillText(dateLabel, PAGE_W / 2, PAGE_H / 2 + 60);

  // Divider line
  ctx.strokeStyle = '#e0d8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAGE_W / 2 - 150, PAGE_H / 2 + 90);
  ctx.lineTo(PAGE_W / 2 + 150, PAGE_H / 2 + 90);
  ctx.stroke();

  // Brand watermark
  ctx.fillStyle = COLORS.watermark;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('MangaGrow', PAGE_W / 2, PAGE_H - 60);

  return canvas;
}

// ── Story Page (v1.8: poster full-page) ──────────────────────────────────────

async function renderStoryCanvas(story: StoryBookOptions['stories'][0]): Promise<HTMLCanvasElement> {
  const canvas = createA4Canvas();
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // ── Header: title + date ──
  const PADDING = 40;
  const HEADER_H = 100;
  const WATERMARK_H = 40;

  const dateStr = new Date(story.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  ctx.fillStyle = COLORS.title;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(story.title || '未命名故事', PAGE_W / 2, PADDING + 36);

  ctx.fillStyle = COLORS.date;
  ctx.font = '16px sans-serif';
  ctx.fillText(dateStr, PAGE_W / 2, PADDING + 68);

  // ── Poster: full-page below header (C39: Canvas drawImage) ──
  const posterTop = HEADER_H;
  const posterAreaW = PAGE_W - PADDING * 2;
  const posterAreaH = PAGE_H - HEADER_H - WATERMARK_H - 8;

  if (story.posterUrl) {
    const img = await loadImage(story.posterUrl);
    if (img) {
      // Fit poster into area preserving aspect ratio (letterbox)
      const imgAspect = img.width / img.height;
      const areaAspect = posterAreaW / posterAreaH;
      let drawW: number, drawH: number, drawX: number, drawY: number;
      if (imgAspect > areaAspect) {
        drawW = posterAreaW;
        drawH = drawW / imgAspect;
        drawX = PADDING;
        drawY = posterTop + (posterAreaH - drawH) / 2;
      } else {
        drawH = posterAreaH;
        drawW = drawH * imgAspect;
        drawX = (PAGE_W - drawW) / 2;
        drawY = posterTop;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      drawPlaceholder(ctx, PADDING, posterTop, posterAreaW, posterAreaH);
    }
  } else {
    drawPlaceholder(ctx, PADDING, posterTop, posterAreaW, posterAreaH);
  }

  // Brand
  ctx.fillStyle = COLORS.watermark;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MangaGrow', PAGE_W / 2, PAGE_H - 18);

  return canvas;
}

// ── Summary Page ──────────────────────────────────────────────────────────────

function renderSummaryCanvas(yearlySummary: string): HTMLCanvasElement {
  const canvas = createA4Canvas();
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Decorative top bar
  ctx.fillStyle = '#f5f0ff';
  ctx.fillRect(0, 0, PAGE_W, 120);

  const PADDING = 60;
  const TEXT_MAX_W = PAGE_W - PADDING * 2;

  // Section title
  ctx.fillStyle = COLORS.summaryTitle;
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('成长记录', PAGE_W / 2, 80);

  // Divider
  ctx.strokeStyle = '#e0d8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, 140);
  ctx.lineTo(PAGE_W - PADDING, 140);
  ctx.stroke();

  // Summary body text — wrap at 28px line height
  ctx.fillStyle = COLORS.summaryBody;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  const LINE_H = 28;
  const lines = wrapText(ctx, yearlySummary, TEXT_MAX_W);
  let y = 180;
  for (const line of lines) {
    if (y + LINE_H > PAGE_H - 80) break; // guard overflow
    ctx.fillText(line, PADDING, y);
    y += LINE_H;
  }

  // Brand
  ctx.fillStyle = COLORS.watermark;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MangaGrow', PAGE_W / 2, PAGE_H - 40);

  return canvas;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a PDF story book Blob.
 * Structure: Cover → Story pages → Summary page
 * C39: All text rendered via Canvas fillText (never jsPDF.text for Chinese)
 */
export async function generateStoryBookPdf(options: StoryBookOptions): Promise<Blob> {
  const { dateLabel, characterName, yearlySummary, stories } = options;

  // A4 portrait in mm (jsPDF coordinate system)
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();   // 210 mm
  const pdfH = pdf.internal.pageSize.getHeight();  // 297 mm

  // ── Cover page ──
  const coverCanvas = renderCoverCanvas(characterName, dateLabel);
  const coverJpeg = canvasToJpeg(coverCanvas);
  pdf.addImage(coverJpeg, 'JPEG', 0, 0, pdfW, pdfH);

  // ── Story pages ──
  for (const story of stories) {
    const storyCanvas = await renderStoryCanvas(story);
    const storyJpeg = canvasToJpeg(storyCanvas);
    pdf.addPage();
    pdf.addImage(storyJpeg, 'JPEG', 0, 0, pdfW, pdfH);
  }

  // ── Summary page ──
  const summaryCanvas = renderSummaryCanvas(yearlySummary);
  const summaryJpeg = canvasToJpeg(summaryCanvas);
  pdf.addPage();
  pdf.addImage(summaryJpeg, 'JPEG', 0, 0, pdfW, pdfH);

  return pdf.output('blob');
}
