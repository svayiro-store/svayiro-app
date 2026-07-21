import React, { useEffect, useState } from 'react';
import { Category } from '../../types';
import { api } from '../../api';
import { Plus, Trash2, Upload, Image as ImageIcon, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import { compressImageFile } from '../../utils/imageCompression';

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
      const preview = await compressImageFile(file, { maxWidth: 600, maxHeight: 600, quality: 0.78 });
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
  const topLevelCategories = categories.filter(c => !c.parentId);
  
  // Get subcategories for a given parent
  const getSubcategories = (parentId: string) => {
    return categories.filter(c => c.parentId === parentId);
  };

  // Get available parent categories for selection (excluding self)
  const availableParentCategories = categories.filter(c => c.id !== editingId && !c.parentId);

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-black">Manage Categories</h2>
        <p className="text-xs opacity-70">Create, edit, and remove category groups and subcategories for your store.</p>
      </div>

      {/* Create/Edit Category Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">
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
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/30">
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
                className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
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
          <div className="grid grid-cols-5 gap-4 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <span className="col-span-2">Name / Image</span>
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
                <div className="grid grid-cols-5 gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center bg-slate-50 dark:bg-slate-800/30">
                  <div className="col-span-2 flex items-center gap-3">
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
                    Parent
                  </div>
                  <div className="text-xs opacity-70 font-mono">{category.slug || category.id.substring(0, 8)}</div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(category)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Edit</button>
                    <button onClick={() => handleDelete(category.id)} className="rounded bg-rose-600 px-3 py-1 text-xs text-white">Delete</button>
                  </div>
                </div>

                {/* Subcategories */}
                {isExpanded && subcategories.map((subcat) => (
                  <div key={subcat.id} className="grid grid-cols-5 gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 items-center ml-8 bg-white dark:bg-slate-900">
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-6" /> {/* Spacing for alignment */}
                      {subcat.imageUrl ? (
                        <img src={subcat.imageUrl} alt={subcat.name} className="h-10 w-10 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">↳ {subcat.name}</div>
                        {subcat.description && <div className="text-[10px] opacity-70 truncate max-w-[180px]">{subcat.description}</div>}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1">
                      Sub
                    </div>
                    <div className="text-xs opacity-70 font-mono">{subcat.slug || subcat.id.substring(0, 8)}</div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(subcat)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Edit</button>
                      <button onClick={() => handleDelete(subcat.id)} className="rounded bg-rose-600 px-3 py-1 text-xs text-white">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
