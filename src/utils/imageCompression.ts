type ImageCompressionOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image file.'));
    image.src = dataUrl;
  });
}

export async function getImageDimensions(dataUrl: string) {
  const image = await loadImage(dataUrl);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

export async function compressImageFile(file: File, options: ImageCompressionOptions): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) return originalDataUrl;

  const scale = Math.min(1, options.maxWidth / sourceWidth, options.maxHeight / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return originalDataUrl;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL(options.mimeType || 'image/jpeg', options.quality ?? 0.82);
}
