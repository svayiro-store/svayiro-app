import React, { useEffect, useState } from 'react';
import { Banner, Category, Product } from '../../types';
import { api } from '../../api';
import { Plus, Trash2, Upload, Image as ImageIcon, Link2, X } from 'lucide-react';
import { getImageDimensions } from '../../utils/imageCompression';
import { compressAndUploadImage } from '../../utils/cloudinaryUpload';

interface Props {
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  refresh: () => void;
  categories: Category[];
  products: Product[];
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MIN_BANNER_WIDTH = 640;
const MIN_BANNER_HEIGHT = 360;

function normalizeBanner(banner: any): Banner {
  const linkId = banner?.linkId || banner?.link_id || banner?.link || '';
  return {
    ...banner,
    imageUrl: banner?.imageUrl || banner?.image_url || '',
    linkType: banner?.linkType || banner?.link_type || (/^https?:\/\//i.test(String(linkId)) ? 'url' : (linkId ? 'category' : 'none')),
    linkId,
    position: Number(banner?.position ?? 0),
    isEnabled: banner?.isEnabled !== undefined ? Boolean(banner.isEnabled) : banner?.is_enabled !== undefined ? Boolean(banner.is_enabled) : true,
    createdAt: banner?.createdAt || banner?.created_at
  };
}

function BannerDevicePreview({ imageUrl, title }: { imageUrl: string; title: string }) {
  const previewTitle = title.trim();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase text-slate-500">
        <span>Customer banner preview</span>
        <span>16:9 storefront card</span>
      </div>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-lg dark:border-slate-800 dark:bg-slate-950">
        {imageUrl ? (
          <img src={imageUrl} alt="Banner preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-slate-400" />
          </div>
        )}
        {previewTitle && (
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h2
              className="line-clamp-2 max-w-[84%] text-base font-semibold leading-tight text-white"
              style={{ textShadow: '0 2px 0 rgba(15,23,42,0.95), 0 5px 14px rgba(15,23,42,0.65)' }}
            >
              {previewTitle}
            </h2>
          </div>
        )}
        <div className="absolute bottom-3 right-4 z-10 flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
          <span className="h-1.5 w-6 rounded-full bg-indigo-600" />
        </div>
      </div>
    </div>
  );
}

export default function BannersView({ isDarkMode, showToast, refresh, categories, products }: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkType, setLinkType] = useState<'category' | 'product' | 'url' | 'none'>('none');
  const [linkId, setLinkId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  const loadBanners = async () => {
    setLoading(true);
    try {
      const res = await api.getBanners();
      setBanners(res.map(normalizeBanner));
    } catch (err: any) {
      showToast(err.message || 'Failed to load banners', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const clearBannerImage = () => {
    setImageUrl('');
    setImagePreview('');
    setImageFile(null);
  };

  const handleImageFileSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'warning');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Banner image must be 6 MB or smaller.', 'warning');
      return;
    }
    try {
      const preview = await compressAndUploadImage(file, { folder: 'banners', maxWidth: 1600, maxHeight: 900, quality: 0.78 });
      const dimensions = await getImageDimensions(preview);
      if (dimensions.width < MIN_BANNER_WIDTH || dimensions.height < MIN_BANNER_HEIGHT) {
        showToast(`Banner must be at least ${MIN_BANNER_WIDTH} x ${MIN_BANNER_HEIGHT} pixels. Selected image is ${dimensions.width} x ${dimensions.height}.`, 'warning');
        return;
      }
      setImageFile(file);
      setImagePreview(preview);
      setImageUrl('');
    } catch {
      showToast('Could not optimize or verify banner image.', 'error');
    }
  };

  const handleCreate = async () => {
    const finalImageUrl = imagePreview || imageUrl.trim();
    if (!finalImageUrl) {
      showToast('Please provide a banner image (upload or URL).', 'warning');
      return;
    }
    if (linkType !== 'none' && !linkId.trim()) {
      showToast(linkType === 'url' ? 'Please enter a destination URL for this banner.' : `Please select a ${linkType} for this banner.`, 'warning');
      return;
    }
    if (linkType === 'url' && !/^https?:\/\/\S+$/i.test(linkId.trim())) {
      showToast('Banner URL must start with http:// or https://.', 'warning');
      return;
    }
    try {
      await api.createBanner({
        title: title.trim(),
        imageUrl: finalImageUrl,
        linkType,
        linkId: linkType !== 'none' ? linkId.trim() : ''
      });
      setTitle('');
      setImageUrl('');
      setImagePreview('');
      setImageFile(null);
      setLinkType('none');
      setLinkId('');
      showToast('Banner created successfully!', 'success');
      loadBanners();
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create banner', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this banner permanently?')) return;
    try {
      await api.deleteBanner(id);
      showToast('Banner deleted.', 'success');
      loadBanners();
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete banner', 'error');
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Homepage Banners</h2>
        <p className="text-xs opacity-70">Manage promotional banners shown on the customer storefront carousel.</p>
      </div>

      {/* Create Banner Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">
          <Plus className="h-4 w-4" /> Add New Banner
        </h3>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Banner Title <span className="font-semibold normal-case text-slate-400">(optional)</span></span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional display text, e.g. Fresh Arrivals" />
            </label>
            <label className="block">
              <span className={labelClass}>Banner Image</span>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-9`}
                    placeholder="Paste image URL or upload from device"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImagePreview('');
                      setImageFile(null);
                    }}
                  />
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <Upload className="h-4 w-4" />
                  Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      handleImageFileSelect(e.target.files?.[0] || null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-500">
                Use a JPG, PNG, WEBP, or GIF banner. Minimum {MIN_BANNER_WIDTH} x {MIN_BANNER_HEIGHT}px. Maximum {MAX_IMAGE_BYTES} MB.
              </p>
            </label>
            <label className="block">
              <span className={labelClass}>Link Type</span>
              <select
                className={inputClass}
                value={linkType}
                onChange={(e) => {
                  setLinkType(e.target.value as any);
                  setLinkId('');
                }}
              >
                <option value="none">No Link</option>
                <option value="category">Link to Category</option>
                <option value="product">Link to Product</option>
                <option value="url">Open External URL</option>
              </select>
            </label>
            {linkType === 'url' && (
              <label className="block">
                <span className={labelClass}>Destination URL</span>
                <input className={inputClass} value={linkId} onChange={(e) => setLinkId(e.target.value)} placeholder="https://example.com/page" />
              </label>
            )}
            {linkType !== 'none' && linkType !== 'url' && (
              <label className="block">
                <span className={labelClass}>{linkType === 'category' ? 'Select Category' : 'Select Product'}</span>
                <select className={inputClass} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                  <option value="">Choose {linkType}</option>
                  {linkType === 'category'
                    ? categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))
                    : products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                </select>
              </label>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(240px,0.7fr)]">
              <BannerDevicePreview imageUrl={imagePreview || imageUrl.trim()} title={title} />
              <div className="flex flex-col justify-center">
                <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Banner image</h4>
                <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  This image will appear across the top of your customer home page.
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Banner display uses a 16:9 card. For best results on all devices, use an image that is at least {MIN_BANNER_WIDTH} x {MIN_BANNER_HEIGHT} pixels and {MAX_IMAGE_BYTES} MB or less.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
                    Change
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        handleImageFileSelect(e.target.files?.[0] || null);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={clearBannerImage}
                    disabled={!imagePreview && !imageUrl}
                    className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="mt-5 w-full rounded-lg bg-indigo-700 px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-indigo-800"
            >
              Create Banner
            </button>
          </div>
        </div>
      </div>

      {/* Banners List */}
      {loading ? (
        <div className="p-6 border rounded text-center">Loading banners...</div>
      ) : banners.length === 0 ? (
        <div className="p-6 border rounded text-center opacity-80">No banners created yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {banners.map((banner) => (
            <div key={banner.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="aspect-[16/9] overflow-hidden bg-slate-100">
                <img src={banner.imageUrl} alt={banner.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold truncate">{banner.title || 'Untitled'}</h4>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {banner.linkType}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(banner.id)}
                className="absolute right-2 top-2 rounded-lg bg-white/90 p-2 text-rose-600 opacity-0 shadow transition-opacity hover:bg-rose-50 group-hover:opacity-100"
                title="Delete banner"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
