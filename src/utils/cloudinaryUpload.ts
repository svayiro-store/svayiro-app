import { api } from '../api';
import { compressImageFile } from './imageCompression';

type UploadFolder = 'products' | 'categories' | 'banners' | 'logo';

interface UploadOptions {
  folder: UploadFolder;
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

export async function compressAndUploadImage(file: File, options: UploadOptions): Promise<string> {
  const dataUrl = await compressImageFile(file, {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    quality: options.quality ?? 0.78,
    mimeType: options.mimeType || 'image/jpeg'
  });
  const uploaded = await api.uploadImage({ dataUrl, folder: options.folder });
  return uploaded.secureUrl || uploaded.url;
}

