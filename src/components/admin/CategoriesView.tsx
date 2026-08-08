import React, { useEffect, useMemo, useState } from 'react';
import { Category } from '../../types';
import { api } from '../../api';
import { Plus, Upload, Image as ImageIcon, Link2, ChevronDown, ChevronRight, ArrowDown, ArrowUp, Save } from 'lucide-react';
import { compressAndUploadImage } from '../../utils/cloudinaryUpload';

interface Props {
  categories: Category[];
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  refresh: () => void;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function CategoriesView({ categories, isDarkMode, showToast, refresh }: Props) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingOrder, setSavingOrder] = useState(false);

  const categoryPosition = (category: Category) => Number((category as any).position ?? category.order ?? 0);

  const sortByPosition = (items: Category[]) => {
    return [...items].sort((a, b) => categoryPosition(a) - categoryPosition(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.name.localeCompare(b.name));
  };

  useEffect(() => {
    setOrderedCategories(sortByPosition(categories));
    setSelectedIds((prev) => new Set([...prev].filter((id) => categories.some((category) => category.id === id))));
  }, [categories]);

  const handleImageFileSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'warning');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image must be 2 MB or smaller.', 'warning');
      return;
    }
    try {
      const preview = await compressAndUploadImage(file, { folder: 'categories', maxWidth: 600, maxHeight: 600, quality: 0.76 });
      setImageFile(file);
      setImagePreview(preview);
    } catch {
      showToast('Failed to optimize category image.', 'error');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('Category name is required.', 'warning');
      return;
    }
    const finalImageUrl = imagePreview || imageUrl.trim();
    setLoading(true);
    try {
      await api.createCategory({
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description: description.trim() || undefined,
        imageUrl: finalImageUrl || undefined,
        parentId: parentId || undefined
      });
      setName('');
      setSlug('');
      setDescription('');
      setImageUrl('');
      setImagePreview('');
      setImageFile(null);
      setParentId(null);
      showToast(parentId ? 'Subcategory created successfully.' : 'Category created successfully.', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create category', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!name.trim()) {
      showToast('Category name is required.', 'warning');
      return;
    }
    const finalImageUrl = imagePreview || imageUrl.trim();
    setLoading(true);
    try {
      await api.updateCategory(id, {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description: description.trim() || undefined,
        imageUrl: finalImageUrl || undefined,
        parentId: parentId || undefined
      });
      setEditingId(null);
      setName('');
      setSlug('');
      setDescription('');
      setImageUrl('');
      setImagePreview('');
      setImageFile(null);
      setParentId(null);
      showToast('Category updated successfully.', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update category', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this category permanently?')) return;
    try {
      await api.deleteCategory(id);
      showToast('Category deleted.', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete category', 'error');
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setSlug(cat.slug || '');
    setDescription(cat.description || '');
    setImageUrl(cat.imageUrl || '');
    setImagePreview('');
    setImageFile(null);
    setParentId(cat.parentId || null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setImageUrl('');
    setImagePreview('');
    setImageFile(null);
    setParentId(null);
  };

  const toggleExpandParent = (parentId: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedParents(newExpanded);
  };

  // Get top-level categories (no parent)
  const topLevelCategories = useMemo(() => sortByPosition(orderedCategories.filter(c => !c.parentId)), [orderedCategories]);
  
  // Get subcategories for a given parent
  const getSubcategories = (parentId: string) => {
    return sortByPosition(orderedCategories.filter(c => c.parentId === parentId));
  };

  // Get available parent categories for selection (excluding self)
  const availableParentCategories = categories.filter(c => c.id !== editingId && !c.parentId);
  const hasOrderChanges = orderedCategories.some((category) => {
    const original = categories.find((item) => item.id === category.id);
    return original && categoryPosition(original) !== categoryPosition(category);
  });

  const toggleSelected = (categoryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const renumberSiblings = (siblings: Category[]) => {
    return siblings.map((category, index) => ({
      ...category,
      order: index + 1,
      position: index + 1
    } as Category & { position: number }));
  };

  const replaceSiblings = (siblings: Category[]) => {
    const siblingMap = new Map(siblings.map((category) => [category.id, category]));
    setOrderedCategories((prev) => prev.map((category) => siblingMap.get(category.id) || category));
  };

  const moveOneCategory = (category: Category, direction: 'up' | 'down') => {
    const siblings = getSubcategories(category.parentId || '').filter(Boolean);
    const siblingList = category.parentId ? siblings : topLevelCategories;
    const currentIndex = siblingList.findIndex((item) => item.id === category.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= siblingList.length) return;
    const nextSiblings = [...siblingList];
    [nextSiblings[currentIndex], nextSiblings[swapIndex]] = [nextSiblings[swapIndex], nextSiblings[currentIndex]];
    replaceSiblings(renumberSiblings(nextSiblings));
  };

  const moveSelectedCategories = (direction: 'up' | 'down') => {
    if (selectedIds.size === 0) {
      showToast('Select one or more categories first.', 'warning');
      return;
    }
    const parentKeys = Array.from(new Set(orderedCategories.filter((category) => selectedIds.has(category.id)).map((category) => category.parentId || 'root')));
    const updates = new Map<string, Category>();

    parentKeys.forEach((parentKey) => {
      const siblings = sortByPosition(orderedCategories.filter((category) => (category.parentId || 'root') === parentKey));
      const nextSiblings = [...siblings];
      if (direction === 'up') {
        for (let index = 1; index < nextSiblings.length; index += 1) {
          if (selectedIds.has(nextSiblings[index].id) && !selectedIds.has(nextSiblings[index - 1].id)) {
            [nextSiblings[index - 1], nextSiblings[index]] = [nextSiblings[index], nextSiblings[index - 1]];
          }
        }
      } else {
        for (let index = nextSiblings.length - 2; index >= 0; index -= 1) {
          if (selectedIds.has(nextSiblings[index].id) && !selectedIds.has(nextSiblings[index + 1].id)) {
            [nextSiblings[index], nextSiblings[index + 1]] = [nextSiblings[index + 1], nextSiblings[index]];
          }
        }
      }
      renumberSiblings(nextSiblings).forEach((category) => updates.set(category.id, category));
    });

    setOrderedCategories((prev) => prev.map((category) => updates.get(category.id) || category));
  };

  const saveCategoryOrder = async () => {
    const changed = orderedCategories.filter((category) => {
      const original = categories.find((item) => item.id === category.id);
      return original && categoryPosition(original) !== categoryPosition(category);
    });
    if (changed.length === 0) {
      showToast('Category order is already up to date.', 'info');
      return;
    }
    setSavingOrder(true);
    try {
      await Promise.all(changed.map((category) => api.updateCategory(category.id, {
        order: categoryPosition(category),
        parentId: category.parentId || undefined
      })));
      showToast('Category order saved.', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save category order.', 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Manage Categories</h2>
        <p className="text-xs opacity-70">Create, edit, and remove category groups and subcategories for your store.</p>
      </div>

      {/* Create/Edit Category Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">
          {editingId ? <><Plus className="h-4 w-4" /> Edit Category</> : <><Plus className="h-4 w-4" /> Add New Category</>}
        </h3>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Category Name *</span>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fresh Vegetables" />
              </label>
              <label className="block">
                <span className={labelClass}>Slug (optional)</span>
                <input className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Auto-generated if empty" />
              </label>
            </div>

            {/* Parent Category Selection */}
            <label className="block">
              <span className={labelClass}>Parent Category (optional - make this a subcategory)</span>
              <select 
                className={inputClass}
                value={parentId || ''}
                onChange={(e) => setParentId(e.target.value || null)}
              >
                <option value="">-- No Parent (Top-level Category) --</option>
                {availableParentCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {parentId && (
                <p className="mt-1 text-[10px] text-amber-600 font-semibold">
                  ℹ️ This will be a subcategory under "{categories.find(c => c.id === parentId)?.name}"
                </p>
              )}
            </label>

            <label className="block">
              <span className={labelClass}>Description (optional)</span>
              <textarea className={`${inputClass} min-h-20 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this category" />
            </label>
            <label className="block">
              <span className={labelClass}>Category Image</span>
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
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/30">
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
            </label>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 md:min-w-[160px]">
            {(imagePreview || imageUrl) ? (
              <div className="h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                <img src={imagePreview || imageUrl} alt="Category preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                <ImageIcon className="h-6 w-6 text-slate-400" />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={editingId ? () => handleUpdate(editingId) : handleCreate}
                disabled={loading}
                className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId && (
                <button onClick={cancelEdit} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Categories Hierarchical List */}
      {categories.length === 0 ? (
        <div className="p-6 border rounded text-center opacity-80">No categories have been added.</div>
      ) : (
        <div className="rounded border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">Category Display Order</h3>
              <p className="text-[10px] font-semibold text-slate-500">Tick categories, move them up/down, then save. Parent and subcategory order are handled separately.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => moveSelectedCategories('up')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold uppercase text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                <ArrowUp className="h-3.5 w-3.5" /> Selected Up
              </button>
              <button onClick={() => moveSelectedCategories('down')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold uppercase text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                <ArrowDown className="h-3.5 w-3.5" /> Selected Down
              </button>
              <button
                onClick={saveCategoryOrder}
                disabled={savingOrder || !hasOrderChanges}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-semibold uppercase text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {savingOrder ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
          <div className="min-w-[860px]">
          <div className="grid grid-cols-[44px_minmax(0,2fr)_90px_80px_minmax(0,1fr)_190px] gap-4 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <span>Select</span>
            <span>Name / Image</span>
            <span>Order</span>
            <span>Type</span>
            <span>Slug</span>
            <span>Action</span>
          </div>

          {/* Top-level categories with their subcategories */}
          {topLevelCategories.map((category) => {
            const subcategories = getSubcategories(category.id);
            const isExpanded = expandedParents.has(category.id);

            return (
              <div key={category.id}>
                {/* Parent Category Row */}
                <div className="grid grid-cols-[44px_minmax(0,2fr)_90px_80px_minmax(0,1fr)_190px] gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center bg-slate-50 dark:bg-slate-800/30">
                  <div>
                    <input type="checkbox" checked={selectedIds.has(category.id)} onChange={() => toggleSelected(category.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" />
                  </div>
                  <div className="flex items-center gap-3">
                    {subcategories.length > 0 && (
                      <button
                        onClick={() => toggleExpandParent(category.id)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                    {category.imageUrl ? (
                      <img src={category.imageUrl} alt={category.name} className="h-10 w-10 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold font-serif">{category.name}</div>
                      {category.description && <div className="text-[10px] opacity-70 truncate max-w-[180px]">{category.description}</div>}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded px-2 py-1">
                    #{categoryPosition(category)}
                  </div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded px-2 py-1">
                    Parent
                  </div>
                  <div className="text-xs opacity-70 font-mono">{category.slug || category.id.substring(0, 8)}</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => moveOneCategory(category, 'up')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-200"><ArrowUp className="h-3 w-3" /></button>
                    <button onClick={() => moveOneCategory(category, 'down')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-200"><ArrowDown className="h-3 w-3" /></button>
                    <button onClick={() => startEdit(category)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Edit</button>
                    <button onClick={() => handleDelete(category.id)} className="rounded bg-rose-600 px-3 py-1 text-xs text-white">Delete</button>
                  </div>
                </div>

                {/* Subcategories */}
                {isExpanded && subcategories.map((subcat) => (
                  <div key={subcat.id} className="grid grid-cols-[44px_minmax(0,2fr)_90px_80px_minmax(0,1fr)_190px] gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center bg-white dark:bg-slate-900">
                    <div>
                      <input type="checkbox" checked={selectedIds.has(subcat.id)} onChange={() => toggleSelected(subcat.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" />
                    </div>
                    <div className="flex items-center gap-3 pl-8">
                      <div className="w-6" /> {/* Spacing for alignment */}
                      {subcat.imageUrl ? (
                        <img src={subcat.imageUrl} alt={subcat.name} className="h-10 w-10 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">Sub: {subcat.name}</div>
                        {subcat.description && <div className="text-[10px] opacity-70 truncate max-w-[180px]">{subcat.description}</div>}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1">
                      #{categoryPosition(subcat)}
                    </div>
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1">
                      Sub
                    </div>
                    <div className="text-xs opacity-70 font-mono">{subcat.slug || subcat.id.substring(0, 8)}</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => moveOneCategory(subcat, 'up')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-200"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => moveOneCategory(subcat, 'down')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-200"><ArrowDown className="h-3 w-3" /></button>
                      <button onClick={() => startEdit(subcat)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Edit</button>
                      <button onClick={() => handleDelete(subcat.id)} className="rounded bg-rose-600 px-3 py-1 text-xs text-white">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
