import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Product, Category } from '../../types';
import { Plus, Trash2, Upload, Image as ImageIcon, Link2, ChevronLeft, ChevronRight, X, Save, Printer, Search } from 'lucide-react';
import { formatDateTimeDDMMYYYY } from '../../utils/date';
import { compressImageFile } from '../../utils/imageCompression';

interface Props {
  isDarkMode: boolean;
  focusedProductId?: string | null;
  onFocusedProductHandled?: () => void;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface ProductForm {
  name: string;
  description: string;
  categoryId: string;
  purchasePrice: string;
  basePrice: string;
  offerPrice: string;
  stockCount: string;
  weight: string;
  images: string[];
  isEnabled: boolean;
  isDailyEssential: boolean;
  isFeatured: boolean;
  lowStockAlertThreshold: string;
}

const emptyForm = (): ProductForm => ({
  name: '',
  description: '',
  categoryId: '',
  purchasePrice: '',
  basePrice: '',
  offerPrice: '0',
  stockCount: '0',
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
  const [codeSearch, setCodeSearch] = useState('');
  const [codeCategoryFilter, setCodeCategoryFilter] = useState('');
  const [form, setForm] = useState<ProductForm>(emptyForm());
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
    if (!form.categoryId) return 'Please select a category.';
    if (!form.purchasePrice || Number(form.purchasePrice) <= 0) return 'Real item cost must be greater than 0. This is admin-only and hidden from customers.';
    if (!form.basePrice || Number(form.basePrice) < 0) return 'Base price must be a non-negative number.';
    if (Number(form.basePrice) < Number(form.purchasePrice)) return 'Selling price should not be below real item cost.';
    if (Number(form.offerPrice) > 0 && Number(form.offerPrice) < Number(form.purchasePrice)) return 'Offer price should not be below real item cost.';
    if (!form.weight || Number(form.weight) <= 0) return 'Weight must be greater than 0 grams.';
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
      const payload = {
        name: form.name.trim(),
        slug: form.name.toLowerCase().replace(/\s+/g, '-'),
        description: form.description.trim(),
        categoryId: form.categoryId,
        purchasePrice: Number(form.purchasePrice),
        basePrice: Number(form.basePrice),
        offerPrice: Number(form.offerPrice) || 0,
        stockCount: Number(form.stockCount) || 0,
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
    setForm({
      name: prod.name,
      description: prod.description || '',
      categoryId: prod.categoryId,
      purchasePrice: String(prod.purchasePrice || ''),
      basePrice: String(prod.basePrice),
      offerPrice: String(prod.offerPrice || 0),
      stockCount: String(prod.stockCount),
      weight: String(prod.weight),
      images: imgs,
      isEnabled: prod.isEnabled,
      isDailyEssential: prod.isDailyEssential || false,
      isFeatured: prod.isFeatured || false,
      lowStockAlertThreshold: String(prod.lowStockAlertThreshold || 5)
    });
    setCarouselIndex(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product permanently? This cannot be undone.')) return;
    try {
      await api.deleteProduct(id);
      alert('Product deleted.');
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    }
  };

  const cancelEdit = () => {
    setForm(emptyForm());
    setEditingId(null);
    setCarouselIndex(0);
  };

  const codeProducts = useMemo(() => {
    const query = codeSearch.trim().toLowerCase();
    return products.filter((product) => {
      const category = categories.find((cat) => cat.id === product.categoryId);
      const matchesCategory = !codeCategoryFilter || product.categoryId === codeCategoryFilter;
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || (product.sku || '').toLowerCase().includes(query)
        || product.id.toLowerCase().includes(query)
        || (category?.name || '').toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, categories, codeSearch, codeCategoryFilter]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((product) => {
      const category = categories.find((cat) => cat.id === product.categoryId);
      const matchesCategory = !productCategoryFilter || product.categoryId === productCategoryFilter;
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || (product.sku || '').toLowerCase().includes(query)
        || (category?.name || '').toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, categories, productSearch, productCategoryFilter]);

  const handlePrintProductCodes = () => {
    const rows = codeProducts.map((prod) => {
      const category = categories.find((cat) => cat.id === prod.categoryId)?.name || 'Uncategorized';
      return `
        <tr>
          <td>${prod.sku || 'PENDING'}</td>
          <td>${prod.name}</td>
          <td>${category}</td>
          <td>${prod.stockCount}</td>
          <td>${prod.lowStockAlertThreshold ?? 10}</td>
          <td>${prod.id}</td>
        </tr>
      `;
    }).join('');
    const categoryLabel = codeCategoryFilter
      ? categories.find((cat) => cat.id === codeCategoryFilter)?.name || 'Selected category'
      : 'All categories';
    const popup = window.open('', '_blank', 'width=980,height=720');
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>SVAYIRO Product Codes</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
            h1{font-size:22px;margin:0}
            .meta{margin:6px 0 18px;color:#475569;font-size:12px}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}
            th{background:#eef2ff;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
            td:first-child{font-family:monospace;font-weight:800;color:#3730a3}
            td:last-child{font-family:monospace;font-size:10px;color:#64748b}
          </style>
        </head>
        <body>
          <h1>SVAYIRO Product Codes</h1>
          <div class="meta">Category: ${categoryLabel} | Printed: ${formatDateTimeDDMMYYYY(new Date())} | Items: ${codeProducts.length}</div>
          <table>
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Low Stock At</th>
                <th>Internal ID</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">No products found.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500';
  const sectionClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

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

      {/* Create/Edit Product Form */}
      {catalogueView === 'products' && <div className={sectionClass}>
        <div className="mb-4 flex items-center justify-between border-b border-indigo-700 pb-2">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">
            <Plus className="h-4 w-4" />
            {editingId ? 'Edit Product' : 'Add New Product'}
          </h3>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs font-bold text-rose-600 hover:underline">Cancel Editing</button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Left Column - Product Details */}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Product Name *</span>
                <input className={inputClass} value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. Organic Toor Dal" />
              </label>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs font-semibold text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                Product code/SKU is generated automatically by the backend after saving.
              </div>
            </div>

            <label className="block">
              <span className={labelClass}>Category *</span>
              <select className={inputClass} value={form.categoryId} onChange={(e) => updateForm('categoryId', e.target.value)}>
                <option value="">-- Select Category --</option>
                {categories.length === 0 && (
                  <option value="" disabled>No categories found. Create a category first.</option>
                )}
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Description</span>
              <textarea className={`${inputClass} min-h-24 resize-y`} value={form.description} onChange={(e) => updateForm('description', e.target.value)} placeholder="Full product description..." />
            </label>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <label className="block">
                <span className={labelClass}>Real Item Cost / Purchase Price (Rs) * Admin Only</span>
                <input className={inputClass} type="number" min={0.01} step="0.01" value={form.purchasePrice} onChange={(e) => updateForm('purchasePrice', e.target.value)} />
              </label>
              <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Hidden from customers. Used only for profit calculation.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Base Price (₹) *</span>
                <input className={inputClass} type="number" min={0} step="0.01" value={form.basePrice} onChange={(e) => updateForm('basePrice', e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>Offer Price (₹)</span>
                <input className={inputClass} type="number" min={0} step="0.01" value={form.offerPrice} onChange={(e) => updateForm('offerPrice', e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>Stock Count</span>
                <input className={inputClass} type="number" min={0} value={form.stockCount} onChange={(e) => updateForm('stockCount', e.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Weight (grams) *</span>
                <input className={inputClass} type="number" min={1} value={form.weight} onChange={(e) => updateForm('weight', e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>Low Stock Alert Threshold</span>
                <input className={inputClass} type="number" min={0} value={form.lowStockAlertThreshold} onChange={(e) => updateForm('lowStockAlertThreshold', e.target.value)} />
              </label>
            </div>

            {/* Toggles */}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <input type="checkbox" checked={form.isEnabled} onChange={(e) => updateForm('isEnabled', e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                <span className="text-xs font-bold">Enabled</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <input type="checkbox" checked={form.isDailyEssential} onChange={(e) => updateForm('isDailyEssential', e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                <span className="text-xs font-bold">Daily Essential</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <input type="checkbox" checked={form.isFeatured} onChange={(e) => updateForm('isFeatured', e.target.checked)} className="h-4 w-4 accent-violet-600" />
                <span className="text-xs font-bold">Featured</span>
              </label>
            </div>
          </div>

          {/* Right Column - Image Carousel */}
          <div className={sectionClass}>
            <div className="mb-3 flex items-center justify-between">
              <span className={labelClass}>Product Images ({form.images.length})</span>
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
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
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                >
                  <Link2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Carousel Preview */}
            {form.images.length > 0 ? (
              <div className="space-y-2">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                  <img
                    src={form.images[carouselIndex]}
                    alt={`Product image ${carouselIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {form.images.length > 1 && (
                    <>
                      <button
                        onClick={() => setCarouselIndex(prev => (prev === 0 ? form.images.length - 1 : prev - 1))}
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setCarouselIndex(prev => (prev === form.images.length - 1 ? 0 : prev + 1))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {/* Remove button on active image */}
                  <button
                    onClick={() => handleRemoveImage(carouselIndex)}
                    className="absolute right-2 top-2 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-500"
                    title="Remove this image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {/* Slide counter */}
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                    {carouselIndex + 1} / {form.images.length}
                  </span>
                </div>

                {/* Thumbnail Strip */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {form.images.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => setCarouselIndex(idx)}
                      className={`relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                        carouselIndex === idx ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
                      }`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                        className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white shadow"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-950">
                <ImageIcon className="h-10 w-10 text-slate-400" />
                <p className="text-xs font-bold text-slate-500">No images yet</p>
                <p className="text-[10px] text-slate-400 text-center">Upload multiple product images or paste URLs. Use the carousel to browse them.</p>
              </div>
            )}

            {/* Image URL input */}
            <div className="mt-3 flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                placeholder="Paste image URL and press Enter..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      updateForm('images', [...form.images, val]);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            onClick={handleSave}
            disabled={saving || uploadingImages}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-6 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </div>}

      {/* Products List */}
      {loading ? (
        <div className="p-6 border rounded text-center">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="p-6 border rounded text-center opacity-80">No products created yet.</div>
      ) : (
        <div className="space-y-4">
          {catalogueView === 'products' && <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_260px]">
              <label>
                <span className={labelClass}>Search Product / Category / SKU</span>
                <input
                  className={inputClass}
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search by product name, category, or product code"
                />
              </label>
              <label>
                <span className={labelClass}>Filter Category</span>
                <select className={inputClass} value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map((category) => (
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
              }}
              className="rounded border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-950"
            >
              Clear Search
            </button>
          </div>}

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-70">Showing {catalogueView === 'codes' ? codeProducts.length : filteredProducts.length} of {products.length} products</span>
            <button onClick={loadProducts} className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white">Refresh</button>
          </div>
          {catalogueView === 'codes' ? (
            <div className={sectionClass}>
              <div className="mb-3 flex flex-col gap-3 border-b border-slate-200 pb-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">Backend Generated Product Codes</h3>
                  <p className="text-[10px] text-slate-500">Use these codes for billing, inventory lookup, invoices, and support calls.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <button
                    type="button"
                    onClick={handlePrintProductCodes}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white shadow-sm hover:bg-indigo-800"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                </div>
              </div>
              <div className="mb-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 lg:grid-cols-[1fr_260px_auto] lg:items-end">
                <label>
                  <span className={labelClass}>Search Product Code / Name / Category / ID</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className={`${inputClass} pl-9`}
                      value={codeSearch}
                      onChange={(event) => setCodeSearch(event.target.value)}
                      placeholder="Search backend generated code, product name, or internal ID"
                    />
                  </div>
                </label>
                <label>
                  <span className={labelClass}>Filter Category</span>
                  <select className={inputClass} value={codeCategoryFilter} onChange={(event) => setCodeCategoryFilter(event.target.value)}>
                    <option value="">All Categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSearch('');
                    setCodeCategoryFilter('');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
              <div className="mb-2 text-[11px] font-bold text-slate-500">
                Showing {codeProducts.length} of {products.length} product codes
              </div>
              <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 font-black">Product Code</th>
                      <th className="px-3 py-2 font-black">Product</th>
                      <th className="px-3 py-2 font-black">Category</th>
                      <th className="px-3 py-2 text-right font-black">Stock</th>
                      <th className="px-3 py-2 text-right font-black">Low Stock At</th>
                      <th className="px-3 py-2 font-black">Internal ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-xs font-bold text-slate-500">
                          No product codes found.
                        </td>
                      </tr>
                    ) : codeProducts.map((prod) => (
                      <tr key={prod.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">
                          <span className="rounded bg-indigo-50 px-2 py-1 font-mono text-[11px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            {prod.sku || 'PENDING'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold">{prod.name}</td>
                        <td className="px-3 py-2 text-slate-500">{categories.find(cat => cat.id === prod.categoryId)?.name || 'Uncategorized'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{prod.stockCount}</td>
                        <td className="px-3 py-2 text-right font-mono">{prod.lowStockAlertThreshold ?? 10}</td>
                        <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[10px] text-slate-400" title={prod.id}>{prod.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs font-bold text-slate-500 dark:border-slate-800">
                No products match this search.
              </div>
            ) : filteredProducts.map((prod) => {
              const thumbnail = Array.isArray(prod.images) && prod.images.length > 0
                ? (typeof prod.images[0] === 'string' ? prod.images[0] : (prod.images[0] as any).url || '')
                : '';
              const imageCount = Array.isArray(prod.images) ? prod.images.length : 0;
              return (
                <div
                  id={`admin-product-${prod.id}`}
                  key={prod.id}
                  className={`group relative overflow-hidden rounded-xl border bg-white shadow-sm transition dark:bg-slate-900 ${
                    focusedProductId === prod.id
                      ? 'border-rose-400 ring-4 ring-rose-200 dark:border-rose-500 dark:ring-rose-950'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-100">
                    {thumbnail ? (
                      <img src={thumbnail} alt={prod.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-slate-300" />
                      </div>
                    )}
                    {imageCount > 1 && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white">
                        {imageCount} photos
                      </span>
                    )}
                    {prod.offerPrice > 0 && (
                      <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-bold text-white">
                        {Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}% off
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold truncate">{prod.name}</h4>
                      {!prod.isEnabled && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500">Hidden</span>}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-black text-indigo-600">₹{prod.offerPrice > 0 ? prod.offerPrice : prod.basePrice}</span>
                      {prod.offerPrice > 0 && <span className="text-[10px] text-slate-400 line-through">₹{prod.basePrice}</span>}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Stock: {prod.stockCount}</span>
                      <span>{prod.weight}g</span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => startEdit(prod)} className="flex-1 rounded bg-indigo-600 py-1.5 text-[10px] font-bold text-white">Edit</button>
                      <button onClick={() => handleDelete(prod.id)} className="rounded bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
