import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Product, Category } from '../../types';
import { Plus, Trash2, Upload, Image as ImageIcon, Link2, ChevronLeft, ChevronRight, ChevronDown, X, Save, Printer, Search } from 'lucide-react';
import { formatDateTimeDDMMYYYY } from '../../utils/date';
import { compressImageFile } from '../../utils/imageCompression';
import { PRODUCT_UNIT_OPTIONS, estimatePackingWeightGrams, formatProductMeasure } from '../../utils/productMeasure';

interface Props {
  isDarkMode: boolean;
  focusedProductId?: string | null;
  onFocusedProductHandled?: () => void;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];

function productCode(product: Product) {
  return String(product.sku || product.id.substring(0, 8).toUpperCase()).trim().toUpperCase();
}

function code128SvgDataUri(value: string) {
  const safeValue = value.replace(/[^\x20-\x7E]/g, '').slice(0, 80) || 'SVAYIRO';
  const codes = [104, ...safeValue.split('').map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  const sequence = [...codes, checksum, 106];
  let x = 10;
  const height = 52;
  const moduleWidth = 2;
  const bars = sequence.map((code) => {
    const pattern = CODE128_PATTERNS[code];
    let local = '';
    [...pattern].forEach((widthChar, index) => {
      const width = Number(widthChar) * moduleWidth;
      if (index % 2 === 0) {
        local += `<rect x="${x}" y="8" width="${width}" height="${height}" fill="#020617"/>`;
      }
      x += width;
    });
    return local;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 10}" height="76" viewBox="0 0 ${x + 10} 76"><rect width="100%" height="100%" fill="#fff"/>${bars}<text x="${(x + 10) / 2}" y="72" text-anchor="middle" font-family="monospace" font-size="10" fill="#020617">${safeValue}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
}

interface ProductForm {
  name: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  categoryIds: string[];
  purchasePrice: string;
  basePrice: string;
  offerPrice: string;
  stockCount: string;
  packageQuantity: string;
  unit: string;
  customUnit: string;
  weight: string;
  images: string[];
  isEnabled: boolean;
  isDailyEssential: boolean;
  isFeatured: boolean;
  lowStockAlertThreshold: string;
}

interface StickerDateInfo {
  mfd: string;
  exp: string;
  bestBefore: string;
}

const emptyForm = (): ProductForm => ({
  name: '',
  description: '',
  categoryId: '',
  subcategoryId: undefined,
  categoryIds: [],
  purchasePrice: '',
  basePrice: '',
  offerPrice: '0',
  stockCount: '0',
  packageQuantity: '100',
  unit: 'g',
  customUnit: '',
  weight: '100',
  images: [],
  isEnabled: true,
  isDailyEssential: false,
  isFeatured: false,
  lowStockAlertThreshold: '5'
});

export default function ProductsView({ isDarkMode, focusedProductId, onFocusedProductHandled }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogueView, setCatalogueView] = useState<'products' | 'codes'>('products');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [codeCategoryFilter, setCodeCategoryFilter] = useState('');
  const [selectedCodeIds, setSelectedCodeIds] = useState<Set<string>>(new Set());
  const [includePriceOnSticker, setIncludePriceOnSticker] = useState(false);
  const [includeMfdOnSticker, setIncludeMfdOnSticker] = useState(false);
  const [includeExpOnSticker, setIncludeExpOnSticker] = useState(false);
  const [includeBestBeforeOnSticker, setIncludeBestBeforeOnSticker] = useState(false);
  const [stickerDateInfo, setStickerDateInfo] = useState<Record<string, StickerDateInfo>>({});
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [uploadingImages, setUploadingImages] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.getProducts(),
        api.getAdminCategories()
      ]);
      setProducts(prodRes);
      setCategories(catRes);
    } catch (err: any) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!focusedProductId || products.length === 0) return;
    const target = products.find((product) => product.id === focusedProductId);
    if (!target) return;
    setCatalogueView('products');
    setProductSearch(target.name);
    setProductCategoryFilter(target.categoryId || '');
    window.setTimeout(() => {
      document.getElementById(`admin-product-${focusedProductId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocusedProductHandled?.();
    }, 150);
  }, [focusedProductId, products, onFocusedProductHandled]);

  const updateForm = (key: keyof ProductForm, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updatePackageField = (key: 'packageQuantity' | 'unit' | 'customUnit', value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      const estimatedWeight = estimatePackingWeightGrams(Number(next.packageQuantity), next.unit);
      if (estimatedWeight > 0) next.weight = String(estimatedWeight);
      return next;
    });
  };

  const toggleProductCategory = (categoryId: string) => {
    setForm((prev) => {
      const categoryIds = prev.categoryIds.includes(categoryId)
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId];
      const { categoryId: nextPrimary, subcategoryId: nextSubcategory } = derivePrimaryCategoryFields(categoryIds);
      return {
        ...prev,
        categoryIds,
        categoryId: nextPrimary,
        subcategoryId: nextSubcategory
      };
    });
  };

  const derivePrimaryCategoryFields = (categoryIds: string[]) => {
    const selected = categoryIds
      .map((id) => categories.find((category) => category.id === id))
      .filter(Boolean) as Category[];
    const firstParent = selected.find((category) => !category.parentId);
    const firstSubcategory = selected.find((category) => category.parentId);
    const derivedParent = firstParent || (firstSubcategory?.parentId ? categories.find((category) => category.id === firstSubcategory.parentId) : undefined);
    return {
      categoryId: derivedParent?.id || selected[0]?.id || '',
      subcategoryId: firstSubcategory?.id || undefined
    };
  };

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/') && file.size <= MAX_IMAGE_BYTES);
      const newImages = await Promise.all(
        imageFiles.map((file) => compressImageFile(file, { maxWidth: 900, maxHeight: 900, quality: 0.78 }))
      );
      if (newImages.length > 0) {
        updateForm('images', [...form.images, ...newImages]);
      }
    } catch {
      alert('Failed to optimize one or more product images. Try smaller JPEG/PNG files.');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const next = form.images.filter((_, i) => i !== index);
    updateForm('images', next);
    if (carouselIndex >= next.length && next.length > 0) {
      setCarouselIndex(next.length - 1);
    } else if (next.length === 0) {
      setCarouselIndex(0);
    }
  };

  const handleImageUrlAdd = () => {
    const url = prompt('Paste image URL:');
    if (url && url.trim()) {
      updateForm('images', [...form.images, url.trim()]);
    }
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Product name is required.';
    if (form.categoryIds.length === 0) return 'Please select at least one category.';
    if (!form.purchasePrice || Number(form.purchasePrice) <= 0) return 'Real item cost must be greater than 0. This is admin-only and hidden from customers.';
    if (!form.basePrice || Number(form.basePrice) < 0) return 'Base price must be a non-negative number.';
    if (Number(form.basePrice) < Number(form.purchasePrice)) return 'Selling price should not be below real item cost.';
    if (Number(form.offerPrice) > 0 && Number(form.offerPrice) < Number(form.purchasePrice)) return 'Offer price should not be below real item cost.';
    if (!form.packageQuantity || Number(form.packageQuantity) <= 0) return 'Product quantity/size must be greater than 0.';
    if (form.unit === 'custom' && !form.customUnit.trim()) return 'Custom unit label is required.';
    if (!form.weight || Number(form.weight) <= 0) return 'Packing weight must be greater than 0 grams for bag calculation.';
    return '';
  };

  const handleSave = async () => {
    const errMsg = validate();
    if (errMsg) {
      alert(errMsg);
      return;
    }
    setSaving(true);
    try {
      const primaryCategory = derivePrimaryCategoryFields(form.categoryIds);
      const payload = {
        name: form.name.trim(),
        slug: form.name.toLowerCase().replace(/\s+/g, '-'),
        description: form.description.trim(),
        categoryId: primaryCategory.categoryId,
        subcategoryId: primaryCategory.subcategoryId,
        categoryIds: Array.from(new Set(form.categoryIds)),
        purchasePrice: Number(form.purchasePrice),
        basePrice: Number(form.basePrice),
        offerPrice: Number(form.offerPrice) || 0,
        stockCount: Number(form.stockCount) || 0,
        packageQuantity: Number(form.packageQuantity) || 0,
        unit: form.unit,
        customUnit: form.customUnit.trim(),
        weight: Number(form.weight) || 100,
        images: form.images,
        isEnabled: form.isEnabled,
        isDailyEssential: form.isDailyEssential,
        isFeatured: form.isFeatured,
        lowStockAlertThreshold: Number(form.lowStockAlertThreshold) || 5
      };
      if (editingId) {
        await api.updateProduct(editingId, payload);
        alert('Product updated successfully!');
      } else {
        await api.createProduct(payload);
        alert('Product created successfully!');
      }
      setForm(emptyForm());
      setEditingId(null);
      setCarouselIndex(0);
      setCategoryDropdownOpen(false);
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (prod: Product) => {
    const imgs = Array.isArray(prod.images)
      ? prod.images.map(img => typeof img === 'string' ? img : (img as any).url || '')
      : [];
    setEditingId(prod.id);
    setCategoryDropdownOpen(false);
    setForm({
      name: prod.name,
      description: prod.description || '',
      categoryId: prod.categoryId,
      subcategoryId: (prod as any).subcategoryId,
      categoryIds: Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0
        ? prod.categoryIds
        : [prod.categoryId, (prod as any).subcategoryId].filter(Boolean),
      purchasePrice: String(prod.purchasePrice || ''),
      basePrice: String(prod.basePrice),
      offerPrice: String(prod.offerPrice || 0),
      stockCount: String(prod.stockCount),
      packageQuantity: String(prod.packageQuantity || prod.metadata?.packageQuantity || (prod.weight >= 1000 ? prod.weight / 1000 : prod.weight) || 100),
      unit: String(prod.unit || prod.metadata?.unit || (prod.weight >= 1000 ? 'kg' : 'g')),
      customUnit: String(prod.metadata?.customUnit || ''),
      weight: String(prod.weight),
      images: imgs,
      isEnabled: prod.isEnabled,
      isDailyEssential: prod.isDailyEssential || false,
      isFeatured: prod.isFeatured || false,
      lowStockAlertThreshold: String((prod as any).lowStockAlertThreshold || 5)
    });
    setCarouselIndex(0);
    window.setTimeout(() => {
      document.getElementById('admin-product-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
    setCarouselIndex(0);
    setCategoryDropdownOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product permanently?')) return;
    try {
      await api.deleteProduct(id);
      alert('Product deleted!');
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    }
  };

  const productCategoryIds = (product: Product) => {
    const ids = Array.isArray(product.categoryIds) ? product.categoryIds : [];
    return Array.from(new Set([product.categoryId, (product as any).subcategoryId, ...ids].filter(Boolean) as string[]));
  };

  const productMatchesCategory = (product: Product, categoryId: string) => productCategoryIds(product).includes(categoryId);

  // Filter logic
  const filteredProducts = useMemo(() => {
    let result = products;
    if (productSearch) {
      const query = productSearch.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        productCategoryIds(p).some((categoryId) => categories.find(c => c.id === categoryId)?.name.toLowerCase().includes(query))
      );
    }
    if (productCategoryFilter) {
      result = result.filter(p => productMatchesCategory(p, productCategoryFilter));
    }
    if (productSubcategoryFilter) {
      result = result.filter(p => productMatchesCategory(p, productSubcategoryFilter));
    }
    return result;
  }, [products, productSearch, productCategoryFilter, productSubcategoryFilter, categories]);

  const codeProducts = useMemo(() => {
    let result = products;
    if (codeSearch) {
      const query = codeSearch.toLowerCase();
      result = result.filter(p =>
        (p.name?.toLowerCase().includes(query) || false) ||
        (p.id?.substring(0, 8).toLowerCase().includes(query) || false) ||
        productCategoryIds(p).some((categoryId) => categories.find(c => c.id === categoryId)?.name.toLowerCase().includes(query))
      );
    }
    if (codeCategoryFilter) {
      result = result.filter(p => productMatchesCategory(p, codeCategoryFilter));
    }
    return result;
  }, [products, codeSearch, codeCategoryFilter, categories]);

  const toggleCodeSelection = (productId: string) => {
    setSelectedCodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const updateStickerDateInfo = (productId: string, key: keyof StickerDateInfo, value: string) => {
    setStickerDateInfo((prev) => ({
      ...prev,
      [productId]: {
        mfd: '',
        exp: '',
        bestBefore: '',
        ...(prev[productId] || {}),
        [key]: value
      }
    }));
  };

  const formatStickerDate = (value: string) => {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day} ${month} ${year}` : value;
  };

  const printBarcodeLabels = (items: Product[]) => {
    if (items.length === 0) {
      alert('Select at least one product label to print.');
      return;
    }
    const labelHtml = items.map((product) => {
      const code = productCode(product);
      const activePrice = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
      const dateInfo = stickerDateInfo[product.id] || { mfd: '', exp: '', bestBefore: '' };
      const priceLine = includePriceOnSticker
        ? `<div class="price"><span>MRP Rs ${Number(product.basePrice).toFixed(0)}</span>${product.offerPrice > 0 ? `<span>OFF Rs ${Number(activePrice).toFixed(0)}</span>` : ''}</div>`
        : '';
      const mfdLine = includeMfdOnSticker && dateInfo.mfd ? `<span>MFD: ${escapeHtml(formatStickerDate(dateInfo.mfd))}</span>` : '';
      const expLine = includeExpOnSticker && dateInfo.exp ? `<span>EXP: ${escapeHtml(formatStickerDate(dateInfo.exp))}</span>` : '';
      const bestBeforeLine = includeBestBeforeOnSticker && dateInfo.bestBefore ? `<span>Best before ${escapeHtml(dateInfo.bestBefore)}</span>` : '';
      const dateLine = [mfdLine, expLine, bestBeforeLine].filter(Boolean).length > 0
        ? `<div class="dates">${[mfdLine, expLine, bestBeforeLine].filter(Boolean).join('')}</div>`
        : '';
      return `
        <section class="label">
          <div class="brand">SVAYIRO</div>
          <div class="name">${escapeHtml(product.name)}</div>
          <div class="meta">${escapeHtml(formatProductMeasure(product))}</div>
          ${priceLine}
          ${dateLine}
          <img class="barcode" src="${code128SvgDataUri(code)}" alt="${code}" />
        </section>
      `;
    }).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Popup blocked. Allow popups to print barcode labels.');
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>SVAYIRO Product Barcode Labels</title>
          <style>
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; width: 50mm; background: #fff; font-family: Arial, sans-serif; color: #020617; }
            .sheet { display: block; width: 50mm; }
            .label { width: 50mm; height: 30mm; padding: 1.8mm 2.2mm; page-break-after: always; break-after: page; overflow: hidden; }
            .brand { font-size: 8px; font-weight: 900; letter-spacing: .08em; color: #0f1b8f; line-height: 1; }
            .name { margin-top: .65mm; font-size: 8.5px; line-height: 1.08; font-weight: 800; max-height: 5.4mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .meta { margin-top: .25mm; font-size: 7px; color: #475569; line-height: 1; min-height: 1.8mm; font-weight: 700; }
            .price { display: flex; justify-content: space-between; gap: 1.5mm; margin-top: .55mm; font-size: 7px; line-height: 1; font-weight: 800; color: #047857; }
            .dates { display: grid; grid-template-columns: 1fr 1fr; gap: .35mm 1.2mm; margin-top: .55mm; font-size: 6.3px; line-height: 1; font-weight: 700; color: #334155; }
            .dates span:last-child:nth-child(odd) { grid-column: 1 / -1; }
            .barcode { display: block; width: 100%; height: 9mm; object-fit: contain; margin-top: .55mm; }
            @page { size: 50mm 30mm; margin: 0; }
          </style>
        </head>
        <body>
          <main class="sheet">${labelHtml}</main>
          <script>window.onload = () => { window.focus(); window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Get parent categories (for filtering)
  const parentCategories = useMemo(() => {
    return categories.filter(c => !c.parentId);
  }, [categories]);

  // Get subcategories for filter
  const subcategoriesForFilter = useMemo(() => {
    if (!productCategoryFilter) return [];
    return categories.filter(c => c.parentId === productCategoryFilter);
  }, [productCategoryFilter, categories]);

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500';
  const sectionClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

  const categoryLabel = (categoryId: string, subcategoryId?: string) => {
    const cat = categories.find(c => c.id === categoryId);
    const subcat = subcategoryId ? categories.find(c => c.id === subcategoryId) : null;
    if (!cat) return '-';
    return subcat ? `${cat.name} > ${subcat.name}` : cat.name;
  };

  const productCategoryLabel = (product: Product) => {
    const names = productCategoryIds(product)
      .map((id) => categories.find((category) => category.id === id)?.name)
      .filter(Boolean) as string[];
    return names.length > 0 ? names.join(', ') : categoryLabel(product.categoryId, (product as any).subcategoryId);
  };

  const selectedFormCategoryNames = form.categoryIds
    .map((id) => categories.find((category) => category.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-black">Products Catalogue</h2>
        <p className="text-xs opacity-70">Create and manage your product inventory with multiple images (carousel).</p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-black dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setCatalogueView('products')}
          className={`rounded-lg px-4 py-2 ${catalogueView === 'products' ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 dark:text-slate-300'}`}
        >
          Product Management
        </button>
        <button
          type="button"
          onClick={() => setCatalogueView('codes')}
          className={`rounded-lg px-4 py-2 ${catalogueView === 'codes' ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 dark:text-slate-300'}`}
        >
          Product Codes
        </button>
      </div>

      {catalogueView === 'products' && (
      <div id="admin-product-edit-form" className={`${sectionClass} scroll-mt-6`}>
        <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">
          {editingId ? <><Plus className="h-4 w-4" /> Edit Product</> : <><Plus className="h-4 w-4" /> Add New Product</>}
        </h3>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: form fields */}
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Product Name *</span>
                <input className={inputClass} value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. Organic Toor Dal" />
              </label>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Product Code</span>
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs font-semibold text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                  Auto-generated after saving
                </div>
              </div>
            </div>

            <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3">
                <span className={labelClass}>Show Product In Categories *</span>
                <p className="text-[10px] font-semibold text-slate-500">Choose every category or subcategory where this product should appear on the customer storefront.</p>
              </div>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen((open) => !open)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-800 shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <span className="min-w-0 flex-1 truncate">
                  {selectedFormCategoryNames.length > 0
                    ? selectedFormCategoryNames.join(', ')
                    : '-- Select product categories --'}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {form.categoryIds.length}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {categoryDropdownOpen && (
                <div className="absolute left-3 right-3 top-[calc(100%-0.75rem)] z-30 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Selected: {form.categoryIds.length}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, categoryIds: [], categoryId: '', subcategoryId: undefined }));
                      }}
                      className="text-[10px] font-black text-rose-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {parentCategories.map((cat) => {
                      const childCategories = categories.filter((subcat) => subcat.parentId === cat.id);
                      return (
                        <div key={cat.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                          <label className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-100">
                            <input
                              type="checkbox"
                              checked={form.categoryIds.includes(cat.id)}
                              onChange={() => toggleProductCategory(cat.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                            />
                            {cat.name}
                          </label>
                          {childCategories.length > 0 && (
                            <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                              {childCategories.map((subcat) => (
                                <label key={subcat.id} className="flex items-center gap-2 pl-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={form.categoryIds.includes(subcat.id)}
                                    onChange={() => toggleProductCategory(subcat.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                                  />
                                  {subcat.name}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedFormCategoryNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedFormCategoryNames.slice(0, 6).map((name) => (
                    <span key={name} className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {name}
                    </span>
                  ))}
                  {selectedFormCategoryNames.length > 6 && (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                      +{selectedFormCategoryNames.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <label className="block">
              <span className={labelClass}>Description</span>
              <textarea className={`${inputClass} min-h-24 resize-y`} value={form.description} onChange={(e) => updateForm('description', e.target.value)} placeholder="Full product description..." />
            </label>

            {/* Pricing Section */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <label className="block">
                <span className={labelClass}>Real Item Cost / Purchase Price (Rs) * Admin Only</span>
                <input className={inputClass} type="number" step="0.01" value={form.purchasePrice} onChange={(e) => updateForm('purchasePrice', e.target.value)} placeholder="e.g. 120" />
                <span className="text-[9px] text-amber-700 dark:text-amber-200">Hidden from customers - used for profit margins</span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Base Price (Rs) *</span>
                <input className={inputClass} type="number" step="0.01" value={form.basePrice} onChange={(e) => updateForm('basePrice', e.target.value)} placeholder="e.g. 150" />
              </label>
              <label className="block">
                <span className={labelClass}>Offer Price (Rs - optional)</span>
                <input className={inputClass} type="number" step="0.01" value={form.offerPrice} onChange={(e) => updateForm('offerPrice', e.target.value)} placeholder="Leave empty for no discount" />
              </label>
            </div>

            {/* Stock, display quantity, and packing weight */}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Stock Count</span>
                <input className={inputClass} type="number" value={form.stockCount} onChange={(e) => updateForm('stockCount', e.target.value)} placeholder="0" />
              </label>
              <label className="block">
                <span className={labelClass}>Product Quantity / Size</span>
                <input className={inputClass} type="number" step="0.01" value={form.packageQuantity} onChange={(e) => updatePackageField('packageQuantity', e.target.value)} placeholder="e.g. 1, 500, 6" />
              </label>
              <label className="block">
                <span className={labelClass}>Unit</span>
                <select className={inputClass} value={form.unit} onChange={(e) => updatePackageField('unit', e.target.value)}>
                  {PRODUCT_UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {form.unit === 'custom' && (
                <label className="block">
                  <span className={labelClass}>Custom Unit Label</span>
                  <input className={inputClass} value={form.customUnit} onChange={(e) => updatePackageField('customUnit', e.target.value)} placeholder="e.g. bundle, jar" />
                </label>
              )}
              <label className="block">
                <span className={labelClass}>Packing Weight (grams)</span>
                <input className={inputClass} type="number" value={form.weight} onChange={(e) => updateForm('weight', e.target.value)} placeholder="Used for smart bag" />
                <span className="text-[9px] text-slate-500">Used only for smart bag calculation. Customers see quantity/unit above.</span>
              </label>
              <label className="block">
                <span className={labelClass}>Low Stock Alert At</span>
                <input className={inputClass} type="number" value={form.lowStockAlertThreshold} onChange={(e) => updateForm('lowStockAlertThreshold', e.target.value)} placeholder="5" />
              </label>
            </div>

            {/* Flags */}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isEnabled} onChange={(e) => updateForm('isEnabled', e.target.checked)} />
                <span className="text-xs font-bold">Enabled</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isDailyEssential} onChange={(e) => updateForm('isDailyEssential', e.target.checked)} />
                <span className="text-xs font-bold">Daily Essential</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isFeatured} onChange={(e) => updateForm('isFeatured', e.target.checked)} />
                <span className="text-xs font-bold">Featured</span>
              </label>
            </div>
          </div>

          {/* Right column: image carousel */}
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
              {form.images.length > 0 ? (
                <>
                  <img src={form.images[carouselIndex]} alt={`Product image ${carouselIndex + 1}`} className="h-full w-full object-cover" />
                  {form.images.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {form.images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCarouselIndex(idx)}
                          className={`h-2 w-2 rounded-full transition ${idx === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="h-12 w-12 text-slate-400" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                <Upload className="h-3 w-3" />
                Upload
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    handleAddImages(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                onClick={handleImageUrlAdd}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Link2 className="h-3 w-3" />
                Paste URL
              </button>
            </div>
            {form.images.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold">Images ({form.images.length})</span>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 rounded bg-slate-100 p-1.5 dark:bg-slate-800">
                      <span className="text-[9px] truncate text-slate-600 dark:text-slate-400">{idx + 1}. {img.substring(0, 20)}...</span>
                      <button
                        onClick={() => handleRemoveImage(idx)}
                        className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900 rounded"
                      >
                        <X className="h-3 w-3 text-rose-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-black text-white hover:bg-indigo-600 disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Products List */}
      <div className="space-y-4">
        {catalogueView === 'products' && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[1fr_220px_220px]">
              <label>
                <span className={labelClass}>Search listed products</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-9`}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search by product name or category..."
                  />
                </div>
              </label>
              <label>
                <span className={labelClass}>Parent Category</span>
                <select
                  className={inputClass}
                  value={productCategoryFilter}
                  onChange={(event) => {
                    setProductCategoryFilter(event.target.value);
                    setProductSubcategoryFilter('');
                  }}
                >
                  <option value="">All Categories</option>
                  {parentCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Subcategory</span>
                <select
                  className={inputClass}
                  value={productSubcategoryFilter}
                  onChange={(event) => setProductSubcategoryFilter(event.target.value)}
                  disabled={!productCategoryFilter}
                >
                  <option value="">All Subcategories</option>
                  {subcategoriesForFilter.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setProductSearch('');
                setProductCategoryFilter('');
                setProductSubcategoryFilter('');
              }}
              className="rounded border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-950"
            >
              Clear Search
            </button>
          </div>
        )}
        {catalogueView === 'codes' && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_200px]">
              <label>
                <span className={labelClass}>Search backend generated code, product name, or internal ID</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-9`}
                    value={codeSearch}
                    onChange={(event) => setCodeSearch(event.target.value)}
                    placeholder="Search..."
                  />
                </div>
              </label>
              <label>
                <span className={labelClass}>Filter Category</span>
                <select className={inputClass} value={codeCategoryFilter} onChange={(event) => setCodeCategoryFilter(event.target.value)}>
                  <option value="">All Categories</option>
                  {parentCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setCodeSearch('');
                setCodeCategoryFilter('');
                setSelectedCodeIds(new Set());
              }}
              className="rounded border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-950"
            >
              Clear Search
            </button>
          </div>
        )}

        {catalogueView === 'codes' && (
          <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-start gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includePriceOnSticker}
                  onChange={(event) => setIncludePriceOnSticker(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                />
                <span>
                  Show MRP / offer price
                  <span className="block text-[10px] font-semibold text-slate-500">Off by default. Keep off when prices change often.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeMfdOnSticker}
                  onChange={(event) => setIncludeMfdOnSticker(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                />
                <span>
                  Show MFD date
                  <span className="block text-[10px] font-semibold text-slate-500">Manufactured/packed date per product.</span>
                </span>
              </label>
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-white/70 p-2 text-xs font-bold text-slate-700 dark:border-indigo-900 dark:bg-slate-950/50 dark:text-slate-200 xl:col-span-2">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Shelf-life text</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="barcode_shelf_life_mode"
                      checked={!includeExpOnSticker && !includeBestBeforeOnSticker}
                      onChange={() => {
                        setIncludeExpOnSticker(false);
                        setIncludeBestBeforeOnSticker(false);
                      }}
                      className="h-4 w-4 border-slate-300 text-indigo-700 focus:ring-indigo-500"
                    />
                    None
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="barcode_shelf_life_mode"
                      checked={includeExpOnSticker}
                      onChange={() => {
                        setIncludeExpOnSticker(true);
                        setIncludeBestBeforeOnSticker(false);
                      }}
                      className="h-4 w-4 border-slate-300 text-indigo-700 focus:ring-indigo-500"
                    />
                    EXP date
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="barcode_shelf_life_mode"
                      checked={includeBestBeforeOnSticker}
                      onChange={() => {
                        setIncludeExpOnSticker(false);
                        setIncludeBestBeforeOnSticker(true);
                      }}
                      className="h-4 w-4 border-slate-300 text-indigo-700 focus:ring-indigo-500"
                    />
                    Best Before
                  </label>
                </div>
                <span className="block text-[10px] font-semibold text-slate-500">Choose either strict expiry date or quality best-before text, not both.</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 lg:max-w-[140px]">
              Prints compact 50mm x 30mm thermal labels.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => printBarcodeLabels(codeProducts.filter((product) => selectedCodeIds.has(product.id)))}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white shadow hover:bg-indigo-600"
              >
                <Printer className="h-4 w-4" /> Print Selected
              </button>
              <button
                type="button"
                onClick={() => printBarcodeLabels(codeProducts)}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-300"
              >
                <Printer className="h-4 w-4" /> Print All Showing
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold opacity-70">Showing {catalogueView === 'codes' ? codeProducts.length : filteredProducts.length} of {products.length} products</span>
          <span className="text-[10px] font-mono opacity-60">{loading ? 'Loading...' : 'Ready'}</span>
        </div>

        {catalogueView === 'products' && (
          filteredProducts.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No products found matching your search criteria.</p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              <div className="grid min-w-[760px] grid-cols-6 gap-4 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <span className="col-span-2">Product</span>
                <span>Category</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Action</span>
              </div>
              {filteredProducts.map((product) => {
                const thumbnail = Array.isArray(product.images) && product.images.length > 0
                  ? (typeof product.images[0] === 'string' ? product.images[0] : (product.images[0] as any)?.url)
                  : '';
                return (
                  <div
                    key={product.id}
                    id={`admin-product-${product.id}`}
                    className="grid min-w-[760px] grid-cols-6 gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center"
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      {thumbnail ? (
                        <img src={thumbnail} alt={product.name} className="h-10 w-10 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">{product.name}</div>
                        <div className="text-[10px] opacity-70 font-mono">{product.sku || product.id.substring(0, 8)}</div>
                        <div className="text-[10px] font-semibold text-slate-500">{formatProductMeasure(product)}</div>
                      </div>
                    </div>
                    <div className="text-xs opacity-80">{productCategoryLabel(product)}</div>
                    <div className="text-xs">
                      {product.offerPrice > 0 ? (
                        <>
                          <span className="font-bold text-emerald-600">Rs {product.offerPrice}</span>{' '}
                          <span className="text-[10px] line-through opacity-50">Rs {product.basePrice}</span>
                        </>
                      ) : (
                        <span className="font-bold">Rs {product.basePrice}</span>
                      )}
                    </div>
                    <div className="text-xs">
                      <span className={`rounded px-2 py-1 font-bold ${product.stockCount === 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400' : product.stockCount <= ((product as any).lowStockAlertThreshold || 5) ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'}`}>
                        {product.stockCount}
                      </span>
                      {!product.isEnabled && (
                        <span className="ml-1 rounded bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">Disabled</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(product)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Edit</button>
                      <button onClick={() => handleDelete(product.id)} className="rounded bg-rose-600 px-3 py-1 text-xs text-white">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        {catalogueView === 'codes' && (
          codeProducts.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No products found matching your search criteria.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              <div className="overflow-x-auto">
              <div className="min-w-[1320px]">
              <div className="grid grid-cols-[44px_150px_minmax(0,1.1fr)_150px_minmax(0,1fr)_120px_320px_120px] gap-4 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <span>Select</span>
                <span>Product Code</span>
                <span>Name</span>
                <span>Barcode</span>
                <span>Category</span>
                <span>Sticker Price</span>
                <span>MFD / EXP / Best Before</span>
                <span>Action</span>
              </div>
              {codeProducts.map((product) => {
                const code = productCode(product);
                const activePrice = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
                const dateInfo = stickerDateInfo[product.id] || { mfd: '', exp: '', bestBefore: '' };
                return (
                  <div key={product.id} className="grid grid-cols-[44px_150px_minmax(0,1.1fr)_150px_minmax(0,1fr)_120px_320px_120px] gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center">
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedCodeIds.has(product.id)}
                        onChange={() => toggleCodeSelection(product.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="font-mono text-xs font-bold">{code}</div>
                      <div className="text-[9px] opacity-60">{(product as any).createdAt ? formatDateTimeDDMMYYYY(new Date((product as any).createdAt)) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold">{product.name}</div>
                      <div className="text-[10px] font-semibold text-slate-500">{formatProductMeasure(product)}</div>
                    </div>
                    <img src={code128SvgDataUri(code)} alt={code} className="h-12 w-36 rounded border border-slate-200 bg-white object-contain p-1" />
                    <div className="text-xs opacity-80">{productCategoryLabel(product)}</div>
                    <div className="text-xs font-bold">
                      {includePriceOnSticker ? (
                        <div>
                          <div>MRP Rs {Number(product.basePrice).toFixed(2)}</div>
                          {product.offerPrice > 0 && <div className="text-emerald-600">Offer Rs {Number(activePrice).toFixed(2)}</div>}
                        </div>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">Hidden</span>
                      )}
                    </div>
                    <div className="grid gap-2 text-[10px]">
                      <label className="grid grid-cols-[42px_1fr] items-center gap-2">
                        <span className="font-black text-slate-500">MFD</span>
                        <input
                          type="date"
                          value={dateInfo.mfd}
                          onChange={(event) => updateStickerDateInfo(product.id, 'mfd', event.target.value)}
                          disabled={!includeMfdOnSticker}
                          className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        />
                      </label>
                      <label className="grid grid-cols-[42px_1fr] items-center gap-2">
                        <span className="font-black text-slate-500">EXP</span>
                        <input
                          type="date"
                          value={dateInfo.exp}
                          onChange={(event) => updateStickerDateInfo(product.id, 'exp', event.target.value)}
                          disabled={!includeExpOnSticker}
                          className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        />
                      </label>
                      <label className="grid grid-cols-[42px_1fr] items-center gap-2">
                        <span className="font-black text-slate-500">Before</span>
                        <input
                          type="text"
                          value={dateInfo.bestBefore}
                          onChange={(event) => updateStickerDateInfo(product.id, 'bestBefore', event.target.value)}
                          disabled={!includeBestBeforeOnSticker}
                          placeholder="e.g. 3 months from MFD"
                          className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => printBarcodeLabels([product])}
                      className="inline-flex items-center justify-center gap-1 rounded bg-indigo-700 px-3 py-2 text-[10px] font-black text-white hover:bg-indigo-600"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                  </div>
                );
              })}
              </div>
              </div>
            </div>          )
        )}
      </div>
    </div>
  );
}



