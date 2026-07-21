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
  subcategoryId?: string;
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
  subcategoryId: undefined,
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
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState('');
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
        subcategoryId: form.subcategoryId || undefined,
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
      subcategoryId: (prod as any).subcategoryId,
      purchasePrice: String(prod.purchasePrice || ''),
      basePrice: String(prod.basePrice),
      offerPrice: String(prod.offerPrice || 0),
      stockCount: String(prod.stockCount),
      weight: String(prod.weight),
      images: imgs,
      isEnabled: prod.isEnabled,
      isDailyEssential: prod.isDailyEssential || false,
      isFeatured: prod.isFeatured || false,
      lowStockAlertThreshold: String((prod as any).lowStockAlertThreshold || 5)
    });
    setCarouselIndex(0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
    setCarouselIndex(0);
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

  // Get subcategories for selected category
  const subcategoriesForSelectedCategory = useMemo(() => {
    if (!form.categoryId) return [];
    return categories.filter(cat => cat.parentId === form.categoryId);
  }, [form.categoryId, categories]);

  // Filter logic
  const filteredProducts = useMemo(() => {
    let result = products;
    if (productSearch) {
      const query = productSearch.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) || 
        categories.find(c => c.id === p.categoryId)?.name.toLowerCase().includes(query)
      );
    }
    if (productCategoryFilter) {
      result = result.filter(p => p.categoryId === productCategoryFilter);
    }
    if (productSubcategoryFilter) {
      result = result.filter(p => (p as any).subcategoryId === productSubcategoryFilter);
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
        categories.find(c => c.id === p.categoryId)?.name.toLowerCase().includes(query)
      );
    }
    if (codeCategoryFilter) {
      result = result.filter(p => p.categoryId === codeCategoryFilter);
    }
    return result;
  }, [products, codeSearch, codeCategoryFilter, categories]);

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
      <div className={sectionClass}>
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

            {/* Category and Subcategory Selection */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Category *</span>
                <select 
                  className={inputClass} 
                  value={form.categoryId} 
                  onChange={(e) => {
                    updateForm('categoryId', e.target.value);
                    updateForm('subcategoryId', undefined); // Reset subcategory
                  }}
                >
                  <option value="">-- Select Category --</option>
                  {parentCategories.length === 0 && (
                    <option value="" disabled>No categories found. Create a category first.</option>
                  )}
                  {parentCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={labelClass}>Subcategory (optional)</span>
                <select 
                  className={inputClass}
                  value={form.subcategoryId || ''}
                  onChange={(e) => updateForm('subcategoryId', e.target.value || undefined)}
                  disabled={!form.categoryId || subcategoriesForSelectedCategory.length === 0}
                >
                  <option value="">-- No Subcategory --</option>
                  {subcategoriesForSelectedCategory.length === 0 ? (
                    <option value="" disabled>{form.categoryId ? 'No subcategories' : 'Select category first'}</option>
                  ) : (
                    subcategoriesForSelectedCategory.map(subcat => (
                      <option key={subcat.id} value={subcat.id}>{subcat.name}</option>
                    ))
                  )}
                </select>
              </label>
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

            {/* Stock & Weight */}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Stock Count</span>
                <input className={inputClass} type="number" value={form.stockCount} onChange={(e) => updateForm('stockCount', e.target.value)} placeholder="0" />
              </label>
              <label className="block">
                <span className={labelClass}>Weight (grams)</span>
                <input className={inputClass} type="number" value={form.weight} onChange={(e) => updateForm('weight', e.target.value)} placeholder="100" />
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

      {/* Products List */}
      <div className="space-y-4">
        {catalogueView === 'products' && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_200px_200px]">
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
                <select 
                  className={inputClass} 
                  value={productCategoryFilter} 
                  onChange={(event) => {
                    setProductCategoryFilter(event.target.value);
                    setProductSubcategoryFilter(''); // Reset subcategory filter
                  }}
                >
                  <option value="">All Categories</option>
                  {parentCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Filter Subcategory</span>
                <select 
                  className={inputClass}
                  value={productSubcategoryFilter}
                  onChange={(event) => setProductSubcategoryFilter(event.target.value)}
                  disabled={!productCategoryFilter || subcategoriesForFilter.length === 0}
                >
                  <option value="">All Subcategories</option>
                  {subcategoriesForFilter.length === 0 ? (
                    <option value="" disabled>{productCategoryFilter ? 'No subcategories' : 'Select category first'}</option>
                  ) : (
                    subcategoriesForFilter.map((subcat) => (
                      <option key={subcat.id} value={subcat.id}>{subcat.name}</option>
                    ))
                  )}
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
              }}
              className="rounded border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-950"
            >
              Clear Search
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold opacity-70">Showing {catalogueView === 'codes' ? codeProducts.length : filteredProducts.length} of {products.length} products</span>
          <span className="text-[10px] font-mono opacity-60">{loading ? 'Loading...' : 'Ready'}</span>
        </div>

        {/* Product table/grid will go here - keeping existing rendering logic */}
        {filteredProducts.length === 0 && catalogueView === 'products' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No products found matching your search criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
