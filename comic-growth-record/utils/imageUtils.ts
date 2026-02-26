// Parse Data URI and sanitize MIME type
export const parseDataUri = (dataUri: string) => {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mimeType: matches[1].split(';')[0],
      data: matches[2]
    };
  }
  // Fallback if raw base64 passed (legacy support)
  return {
    mimeType: 'image/jpeg',
    data: dataUri
  };
};

// Compress image to reduce payload size and prevent 500 errors
export const compressImage = async (dataUri: string, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(dataUri);
    }

    const img = new Image();
    img.src = dataUri;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUri);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (e) {
        console.warn("Image compression failed, using original", e);
        resolve(dataUri);
      }
    };
    img.onerror = () => {
      console.warn("Image load failed during compression, using original");
      resolve(dataUri);
    };
  });
};
