// C29: Native Canvas API only, no html2canvas
// C30: 2-column grid, odd last row centered, "MangaGrow" watermark

// Wrap text into lines that fit within maxWidth
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

export interface PosterOptions {
  title: string;
  date: string;
  scenes: Array<{
    imageUrl: string;
    caption: string;
  }>;
}

const POSTER_CONFIG = {
  columns: 2,
  padding: 40,
  titleHeight: 120,
  scriptHeight: 90,
  gap: 20,
  watermarkHeight: 60,
  cellWidth: 480, // each cell width
  bgColor: '#ffffff',
  titleFont: 'bold 36px sans-serif',
  dateFont: '18px sans-serif',
  scriptFont: '14px sans-serif',
  watermarkFont: 'bold 16px sans-serif',
  titleColor: '#1a1a1a',
  dateColor: '#999999',
  scriptColor: '#333333',
  watermarkColor: '#cccccc',
};

export async function generatePoster(options: PosterOptions): Promise<Blob> {
  const { title, date, scenes } = options;
  const cfg = POSTER_CONFIG;

  const cols = cfg.columns;
  const rows = Math.ceil(scenes.length / cols);
  const isOddLastRow = scenes.length % cols !== 0;

  // Calculate dimensions
  const contentWidth = cols * cfg.cellWidth + (cols - 1) * cfg.gap;
  const canvasWidth = contentWidth + cfg.padding * 2;

  // Load all images first to determine aspect ratio
  const images: (ImageBitmap | null)[] = await Promise.all(
    scenes.map(async (scene) => {
      try {
        const res = await fetch(scene.imageUrl);
        const blob = await res.blob();
        return await createImageBitmap(blob);
      } catch {
        return null;
      }
    })
  );

  // Use first image's aspect ratio for cell height
  const firstImage = images.find(img => img !== null);
  const imgAspect = firstImage ? firstImage.width / firstImage.height : 4 / 3;
  const cellImageHeight = Math.round(cfg.cellWidth / imgAspect);
  const cellHeight = cellImageHeight + cfg.scriptHeight;

  const canvasHeight = cfg.padding + cfg.titleHeight +
    rows * cellHeight + (rows - 1) * cfg.gap +
    cfg.watermarkHeight + cfg.padding;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = cfg.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title area
  let yOffset = cfg.padding;
  ctx.fillStyle = cfg.titleColor;
  ctx.font = cfg.titleFont;
  ctx.textAlign = 'center';
  ctx.fillText(title || 'Untitled', canvasWidth / 2, yOffset + 50);

  ctx.fillStyle = cfg.dateColor;
  ctx.font = cfg.dateFont;
  ctx.fillText(date, canvasWidth / 2, yOffset + 85);

  yOffset += cfg.titleHeight;

  // Draw scenes grid
  for (let i = 0; i < scenes.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    let x: number;
    // Last row with odd count: center it
    if (row === rows - 1 && isOddLastRow && col === 0) {
      const lastRowCount = scenes.length % cols;
      const lastRowWidth = lastRowCount * cfg.cellWidth + (lastRowCount - 1) * cfg.gap;
      x = cfg.padding + (contentWidth - lastRowWidth) / 2;
    } else {
      x = cfg.padding + col * (cfg.cellWidth + cfg.gap);
    }
    const y = yOffset + row * (cellHeight + cfg.gap);

    // Draw image
    const img = images[i];
    if (img) {
      ctx.drawImage(img, x, y, cfg.cellWidth, cellImageHeight);
    } else {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x, y, cfg.cellWidth, cellImageHeight);
      ctx.fillStyle = '#aaa';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Image unavailable', x + cfg.cellWidth / 2, y + cellImageHeight / 2);
    }

    // Draw border around image
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cfg.cellWidth, cellImageHeight);

    // Draw caption text with word wrap
    const captionRaw = scenes[i].caption;
    ctx.fillStyle = cfg.scriptColor;
    ctx.font = cfg.scriptFont;
    ctx.textAlign = 'center';
    const lineHeight = 24;
    const textMaxWidth = cfg.cellWidth - 24;
    const lines = wrapText(ctx, captionRaw, textMaxWidth);
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = y + cellImageHeight + (cfg.scriptHeight - totalTextHeight) / 2 + lineHeight;
    lines.forEach((line, li) => {
      ctx.fillText(line, x + cfg.cellWidth / 2, textStartY + li * lineHeight);
    });
  }

  // Watermark
  const watermarkY = canvasHeight - cfg.padding - 10;
  ctx.fillStyle = cfg.watermarkColor;
  ctx.font = cfg.watermarkFont;
  ctx.textAlign = 'center';
  ctx.fillText('MangaGrow', canvasWidth / 2, watermarkY);

  // Export to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate poster blob'));
    }, 'image/png');
  });
}
