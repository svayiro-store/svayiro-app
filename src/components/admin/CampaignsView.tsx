import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Gift, Image as ImageIcon, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { api } from '../../api';
import { Campaign, Category, Coupon, Product } from '../../types';
import { compressAndUploadImage } from '../../utils/cloudinaryUpload';
import { formatDateDDMMYYYY, isValidDDMMYYYY, parseDDMMYYYYToISO } from '../../utils/date';

interface Props {
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  products: Product[];
  categories: Category[];
  refresh?: () => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500';
const cardClass = 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const pastelColorPresets = [
  { label: 'Pastel Cream', value: '#ffe5c2' },
  { label: 'Pastel Green', value: '#d7f5df' },
  { label: 'Pastel Blue', value: '#dbeafe' },
  { label: 'Pastel Rose', value: '#f7dceb' },
  { label: 'Pastel Yellow', value: '#fef3b5' },
  { label: 'Pastel Indigo', value: '#dbe4ff' },
  { label: 'Pastel Saffron', value: '#fed7aa' },
  { label: 'Pastel White', value: '#fffdf2' }
];

const emptyForm = {
  name: '',
  occasion: 'custom' as Campaign['occasion'],
  audience: 'all' as Campaign['audience'],
  title: '',
  subtitle: '',
  startDate: '',
  endDate: '',
  bannerImageUrl: '',
  couponId: '',
  priority: '0',
  backgroundColor: '#fff7ed',
  backgroundColors: ['#fff7ed'] as string[],
  backgroundImageUrl: '',
  isActive: true,
  productIds: [] as string[],
  categoryIds: [] as string[]
};

const PRODUCT_PICKER_PAGE_SIZE = 50;

function dateInputValue(value?: string) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  const displayMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (displayMatch) return raw;
  return '';
}

function campaignBackgroundStyle(colors: string[], imageUrl = '') {
  const safeColors = colors.filter(Boolean).slice(0, 3);
  const activeColors = safeColors.length ? safeColors : ['#fff7ed'];
  const colorStops = activeColors
    .map((color, index) => `${color}${imageUrl ? 'F2' : 'F5'} ${Math.round((index / Math.max(1, activeColors.length - 1)) * (imageUrl ? 50 : 100))}%`)
    .join(', ');
  const colorLayer = imageUrl
    ? `linear-gradient(90deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.26) 50%, transparent 88%), linear-gradient(90deg, ${colorStops} 0%, ${activeColors[activeColors.length - 1]}D9 50%, ${activeColors[activeColors.length - 1]}A6 68%, transparent 100%)`
    : activeColors.length === 1
      ? `linear-gradient(90deg, ${activeColors[0]}F2, ${activeColors[0]}F2)`
      : `linear-gradient(90deg, ${colorStops})`;
  return imageUrl
    ? `${colorLayer}, url(${imageUrl})`
    : colorLayer;
}

export default function CampaignsView({ isDarkMode, showToast, products, categories, refresh }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [pickerProducts, setPickerProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productOffset, setProductOffset] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const activeProducts = useMemo(() => {
    const merged = [...products, ...pickerProducts];
    const seen = new Set<string>();
    return merged.filter((product) => {
      if (!product.isEnabled || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
  }, [products, pickerProducts]);
  const activeCategories = useMemo(() => categories.filter((category) => category.isEnabled), [categories]);
  const visiblePickerProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return activeProducts;
    return activeProducts.filter((product) => {
      const haystack = `${product.name} ${product.sku || ''} ${product.id || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeProducts, productSearch]);

  const load = async () => {
    setLoading(true);
    try {
      const [campaignRows, couponRows] = await Promise.all([api.getCampaigns(), api.getCoupons()]);
      setCampaigns(campaignRows);
      setCoupons(couponRows);
    } catch (err: any) {
      showToast(err.message || 'Failed to load campaigns.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadMoreProducts = async (reset = false) => {
    setProductsLoading(true);
    try {
      const offset = reset ? 0 : productOffset;
      const rows = await api.getProducts({ limit: PRODUCT_PICKER_PAGE_SIZE, offset });
      setPickerProducts((prev) => {
        const next = reset ? rows : [...prev, ...rows];
        const seen = new Set<string>();
        return next.filter((product) => {
          if (seen.has(product.id)) return false;
          seen.add(product.id);
          return true;
        });
      });
      setProductOffset(offset + rows.length);
      setHasMoreProducts(rows.length === PRODUCT_PICKER_PAGE_SIZE);
    } catch (err: any) {
      showToast(err.message || 'Failed to load more products.', 'error');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (products.length < PRODUCT_PICKER_PAGE_SIZE) {
      loadMoreProducts(true);
    } else {
      setPickerProducts(products);
      setProductOffset(products.length);
      setHasMoreProducts(products.length === PRODUCT_PICKER_PAGE_SIZE);
    }
  }, [products]);

  const updateForm = (key: keyof typeof form, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateBackgroundColor = (index: number, value: string) => {
    setForm((prev) => {
      const colors = [...(prev.backgroundColors.length ? prev.backgroundColors : [prev.backgroundColor])].slice(0, 3);
      colors[index] = value;
      return { ...prev, backgroundColors: colors, backgroundColor: colors[0] || prev.backgroundColor };
    });
  };

  const removeBackgroundColor = (index: number) => {
    setForm((prev) => {
      const colors = prev.backgroundColors.filter((_, colorIndex) => colorIndex !== index);
      const safeColors = colors.length ? colors : [prev.backgroundColor || '#fff7ed'];
      return { ...prev, backgroundColors: safeColors, backgroundColor: safeColors[0] };
    });
  };

  const toggleListValue = (key: 'productIds' | 'categoryIds', id: string) => {
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] };
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const editCampaign = (campaign: Campaign) => {
    const metadataColors = Array.isArray(campaign.metadata?.backgroundColors)
      ? campaign.metadata.backgroundColors.map(String).filter(Boolean).slice(0, 3)
      : [];
    const safeBackgroundColors = metadataColors.length
      ? metadataColors
      : [String(campaign.metadata?.backgroundColor || '#fff7ed')];
    setEditingId(campaign.id);
    setForm({
      name: campaign.name,
      occasion: campaign.occasion,
      audience: campaign.audience,
      title: campaign.title,
      subtitle: campaign.subtitle || '',
      startDate: dateInputValue(campaign.startDate),
      endDate: dateInputValue(campaign.endDate),
      bannerImageUrl: campaign.bannerImageUrl || '',
      couponId: campaign.couponId || '',
      priority: String(campaign.priority || 0),
      backgroundColor: safeBackgroundColors[0],
      backgroundColors: safeBackgroundColors,
      backgroundImageUrl: String(campaign.metadata?.backgroundImageUrl || ''),
      isActive: campaign.isActive,
      productIds: campaign.productIds || [],
      categoryIds: campaign.categoryIds || []
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid campaign image.', 'warning');
      return;
    }
    try {
      const url = await compressAndUploadImage(file, { folder: 'banners', maxWidth: 1400, maxHeight: 800, quality: 0.78 });
      updateForm('bannerImageUrl', url);
      showToast('Campaign image uploaded.', 'success');
    } catch {
      showToast('Failed to upload campaign image.', 'error');
    }
  };

  const handleBackgroundImageSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid background image.', 'warning');
      return;
    }
    try {
      const url = await compressAndUploadImage(file, { folder: 'banners', maxWidth: 1400, maxHeight: 900, quality: 0.72 });
      updateForm('backgroundImageUrl', url);
      showToast('Offer background image uploaded.', 'success');
    } catch {
      showToast('Failed to upload background image.', 'error');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return showToast('Campaign name is required.', 'warning');
    if (!form.title.trim()) return showToast('Customer display title is required.', 'warning');
    if (!form.startDate || !form.endDate) return showToast('Start and end dates are required.', 'warning');
    if (!isValidDDMMYYYY(form.startDate) || !isValidDDMMYYYY(form.endDate)) {
      return showToast('Use date format dd-mm-yyyy for campaign dates.', 'warning');
    }
    const startDate = parseDDMMYYYYToISO(form.startDate);
    const endDate = parseDDMMYYYYToISO(form.endDate);
    if (endDate < startDate) return showToast('End date cannot be before start date.', 'warning');
    setSaving(true);
    try {
      const backgroundColors = (form.backgroundColors.length ? form.backgroundColors : [form.backgroundColor])
        .map(String)
        .filter(Boolean)
        .slice(0, 3);
      const payload = {
        ...form,
        priority: Number(form.priority || 0),
        couponId: form.couponId || null,
        name: form.name.trim(),
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        startDate,
        endDate,
        metadata: {
          backgroundColor: backgroundColors[0] || form.backgroundColor,
          backgroundColors,
          backgroundImageUrl: form.backgroundImageUrl.trim()
        }
      };
      if (editingId) {
        const res = await api.updateCampaign(editingId, payload);
        setCampaigns((prev) => prev.map((campaign) => campaign.id === editingId ? res.data : campaign));
        showToast('Campaign updated.', 'success');
      } else {
        const res = await api.createCampaign(payload);
        setCampaigns((prev) => [res.data, ...prev]);
        showToast('Campaign created.', 'success');
      }
      resetForm();
      refresh?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to save campaign.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((campaign) => campaign.id !== id));
      refresh?.();
      showToast('Campaign deleted.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete campaign.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Campaigns & Occasion Offers</h2>
        <p className="text-xs opacity-70">Create festival, weekend, fresh-stock, clearance, and own-brand promotions.</p>
      </div>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-indigo-700 pb-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">
            <CalendarDays className="h-4 w-4" /> {editingId ? 'Edit Campaign' : 'Create Campaign'}
          </h3>
          {editingId && <button onClick={resetForm} className="rounded-full border px-3 py-1 text-[10px] font-semibold">Cancel edit</button>}
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <label><span className={labelClass}>Campaign Name</span><input className={inputClass} value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. Ugadi Fresh Deals" /></label>
          <label><span className={labelClass}>Customer Title</span><input className={inputClass} value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="Festival Essentials Sale" /></label>
          <label><span className={labelClass}>Subtitle</span><input className={inputClass} value={form.subtitle} onChange={(e) => updateForm('subtitle', e.target.value)} placeholder="Limited period savings" /></label>
          <label><span className={labelClass}>Occasion</span>
            <select className={inputClass} value={form.occasion} onChange={(e) => updateForm('occasion', e.target.value)}>
              <option value="festival">Festival</option>
              <option value="weekend">Weekend</option>
              <option value="fresh_stock">Fresh Stock</option>
              <option value="clearance">Clearance</option>
              <option value="free_delivery">Free Delivery</option>
              <option value="own_brand">Own Brand</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label><span className={labelClass}>Audience</span>
            <select className={inputClass} value={form.audience} onChange={(e) => updateForm('audience', e.target.value)}>
              <option value="all">All Customers</option>
              <option value="new_customers">New Customers</option>
              <option value="birthday_customers">Birthday Customers</option>
              <option value="returning_customers">Returning Customers</option>
            </select>
          </label>
          <label><span className={labelClass}>Attached Coupon</span>
            <select className={inputClass} value={form.couponId} onChange={(e) => updateForm('couponId', e.target.value)}>
              <option value="">No coupon</option>
              {coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.code} - {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `Rs ${coupon.discountValue}`}</option>)}
            </select>
            <span className="mt-1 block text-[9px] font-semibold leading-relaxed text-slate-500">
              Applies only to selected campaign products/categories. Minimum order is checked on eligible offer items.
            </span>
          </label>
          <label>
            <span className={labelClass}>Start Date</span>
            <input
              className={inputClass}
              value={form.startDate}
              onChange={(e) => updateForm('startDate', e.target.value)}
              inputMode="numeric"
              placeholder="dd-mm-yyyy"
            />
          </label>
          <label>
            <span className={labelClass}>End Date</span>
            <input
              className={inputClass}
              value={form.endDate}
              onChange={(e) => updateForm('endDate', e.target.value)}
              inputMode="numeric"
              placeholder="dd-mm-yyyy"
            />
          </label>
          <label><span className={labelClass}>Priority</span><input className={inputClass} type="number" min={0} value={form.priority} onChange={(e) => updateForm('priority', e.target.value)} /></label>
          <div>
            <span className={labelClass}>Customer Section Colors</span>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
              {(form.backgroundColors.length ? form.backgroundColors : [form.backgroundColor]).slice(0, 3).map((color, index) => (
                <div key={`campaign-color-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <input
                    className="h-9 w-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    type="color"
                    value={color}
                    onChange={(e) => updateBackgroundColor(index, e.target.value)}
                    aria-label={`Campaign color ${index + 1}`}
                  />
                  <select className={inputClass} value={color} onChange={(e) => updateBackgroundColor(index, e.target.value)}>
                    {pastelColorPresets.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeBackgroundColor(index)}
                    disabled={form.backgroundColors.length <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {form.backgroundColors.length < 3 && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, backgroundColors: [...prev.backgroundColors, pastelColorPresets[Math.min(prev.backgroundColors.length, pastelColorPresets.length - 1)].value].slice(0, 3) }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus className="h-3 w-3" /> Add Color
                </button>
              )}
              <p className="text-[9px] font-semibold leading-relaxed text-slate-500">
                Select one color for a single pastel spread, or up to three colors for festival-style bands.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_240px]">
          <label><span className={labelClass}>Campaign Banner Image</span><input className={inputClass} value={form.bannerImageUrl} onChange={(e) => updateForm('bannerImageUrl', e.target.value)} placeholder="Paste URL or upload" /></label>
          <label className="flex cursor-pointer items-end">
            <span className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
              <Upload className="h-4 w-4" /> Upload Campaign Image
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { handleImageSelect(e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
          </label>
        </div>
        {form.bannerImageUrl && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
            <img src={form.bannerImageUrl} alt="Campaign preview" className="h-16 w-28 rounded-lg object-cover" referrerPolicy="no-referrer" />
            <button onClick={() => updateForm('bannerImageUrl', '')} className="rounded-full border px-3 py-1 text-[10px] font-semibold"><X className="mr-1 inline h-3 w-3" />Remove</button>
          </div>
        )}

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_240px]">
          <label>
            <span className={labelClass}>Offer Section Background Photo</span>
            <input
              className={inputClass}
              value={form.backgroundImageUrl}
              onChange={(e) => updateForm('backgroundImageUrl', e.target.value)}
              placeholder="Optional URL. Empty uses pastel gradient."
            />
          </label>
          <label className="flex cursor-pointer items-end">
            <span className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <Upload className="h-4 w-4" /> Upload Background Photo
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { handleBackgroundImageSelect(e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
          </label>
        </div>
        {form.backgroundImageUrl && (
          <div
            className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-800"
            style={{
              backgroundImage: campaignBackgroundStyle(form.backgroundColors, form.backgroundImageUrl),
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="text-xs font-semibold text-slate-900">
              Offer section will use this image behind the pastel overlay.
            </div>
            <button onClick={() => updateForm('backgroundImageUrl', '')} className="rounded-full border bg-white/80 px-3 py-1 text-[10px] font-semibold"><X className="mr-1 inline h-3 w-3" />Remove</button>
          </div>
        )}

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-end justify-between gap-2">
              <span className={labelClass}>Products Included</span>
              <span className="text-[9px] font-semibold text-slate-400">{form.productIds.length} selected / {visiblePickerProducts.length} loaded</span>
            </div>
            <input
              className={`${inputClass} mb-2`}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search loaded products by name, SKU, or code"
            />
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {visiblePickerProducts.map((product) => (
                <label key={product.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-950">
                  <input type="checkbox" checked={form.productIds.includes(product.id)} onChange={() => toggleListValue('productIds', product.id)} />
                  <span className="line-clamp-1">{product.name}</span>
                </label>
              ))}
              {visiblePickerProducts.length === 0 && (
                <p className="px-2 py-4 text-center text-xs font-semibold text-slate-400">No loaded product matches this search.</p>
              )}
            </div>
            {hasMoreProducts && (
              <button
                type="button"
                disabled={productsLoading}
                onClick={() => loadMoreProducts(false)}
                className="mt-2 w-full rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-semibold uppercase text-indigo-700 disabled:opacity-50"
              >
                {productsLoading ? 'Loading...' : 'Load More Products'}
              </button>
            )}
          </div>
          <div>
            <span className={labelClass}>Categories Included</span>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {activeCategories.map((category) => (
                <label key={category.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-950">
                  <input type="checkbox" checked={form.categoryIds.includes(category.id)} onChange={() => toggleListValue('categoryIds', category.id)} />
                  <span className="line-clamp-1">{category.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} /> Active campaign</label>
          <button disabled={saving} onClick={handleSave} className="rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60">
            {saving ? 'Saving...' : editingId ? 'Update Campaign' : 'Create Campaign'}
          </button>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {loading ? (
          <div className={cardClass}>Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className={cardClass}>No campaigns created yet.</div>
        ) : campaigns.map((campaign) => (
          <article key={campaign.id} className={`${cardClass} ${!campaign.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-serif text-lg font-semibold">{campaign.title}</h3>
                  <span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-semibold uppercase text-indigo-700">{campaign.occasion.replace(/_/g, ' ')}</span>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${campaign.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{campaign.isActive ? 'Active' : 'Disabled'}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{campaign.subtitle || campaign.name}</p>
                <p className="mt-2 text-[10px] font-semibold text-slate-500">
                  {formatDateDDMMYYYY(campaign.startDate)} - {formatDateDDMMYYYY(campaign.endDate)} | {campaign.productIds.length} products | {campaign.categoryIds.length} categories
                </p>
                {campaign.couponCode && <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Coupon: {campaign.couponCode}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => editCampaign(campaign)} className="rounded-lg border p-2 text-indigo-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(campaign.id)} className="rounded-lg border p-2 text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {campaign.bannerImageUrl ? (
              <img src={campaign.bannerImageUrl} alt={campaign.title} className="mt-3 aspect-[16/7] w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="mt-3 flex aspect-[16/7] items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-slate-950">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
