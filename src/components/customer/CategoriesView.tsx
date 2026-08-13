import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Compass, X } from 'lucide-react';
import { Category, CustomerTab, Product, User as UserType } from '../../types';
import SearchResultsView from './SearchResultsView';

interface CategoriesViewProps {
  categories: Category[];
  products: Product[];
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  setActiveTab: (tab: CustomerTab) => void;
  cart: { productId: string; quantity: number }[];
  updateCartQty: (pId: string, qty: number) => void;
  addToCart: (pId: string, qty?: number) => void;
  setSelectedProduct: (prod: Product) => void;
  toggleWishlist: (pId: string) => void;
  activeUser: UserType | null;
  isDarkMode: boolean;
  onShareProduct?: (prod: Product) => void;
}

type CategorySort = 'relevance' | 'price_low' | 'price_high' | 'newest';

const categoryFallback = (name: string) => name.trim().slice(0, 2).toUpperCase() || 'SV';

function CategoryThumb({ category, className = '' }: { category?: Category | null; className?: string }) {
  return (
    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-indigo-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-indigo-300 ${className}`}>
      {category ? categoryFallback(category.name) : <Compass className="h-5 w-5" />}
      {category?.imageUrl && (
        <img
          src={category.imageUrl}
          alt={category.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}

export default function CategoriesView({
  categories,
  products,
  selectedCategory,
  setSelectedCategory,
  setActiveTab,
  cart,
  updateCartQty,
  addToCart,
  setSelectedProduct,
  toggleWishlist,
  activeUser,
  isDarkMode,
  onShareProduct
}: CategoriesViewProps) {
  const topLevelCategories = useMemo(() => categories.filter(cat => !cat.parentId), [categories]);
  const subcategoriesByParent = useMemo(() => {
    return categories.reduce<Record<string, Category[]>>((acc, cat) => {
      if (!cat.parentId) return acc;
      acc[cat.parentId] = [...(acc[cat.parentId] || []), cat];
      return acc;
    }, {});
  }, [categories]);

  const selectedDetails = selectedCategory ? categories.find(cat => cat.id === selectedCategory) : null;
  const initialParentId = selectedDetails?.parentId || selectedDetails?.id || topLevelCategories[0]?.id || null;
  const [activeParentId, setActiveParentId] = useState<string | null>(initialParentId);
  const [resultCategoryId, setResultCategoryId] = useState<string | null>(selectedCategory);
  const [showResults, setShowResults] = useState(Boolean(selectedCategory));
  const [categorySort, setCategorySort] = useState<CategorySort>('relevance');

  useEffect(() => {
    if (!activeParentId && topLevelCategories[0]) {
      setActiveParentId(topLevelCategories[0].id);
    }
  }, [activeParentId, topLevelCategories]);

  useEffect(() => {
    if (!selectedDetails) return;
    setActiveParentId(selectedDetails.parentId || selectedDetails.id);
  }, [selectedDetails]);

  const activeParent = activeParentId ? categories.find(cat => cat.id === activeParentId) || null : null;
  const activeSubcategories = activeParentId ? subcategoriesByParent[activeParentId] || [] : [];
  const resultCategory = resultCategoryId ? categories.find(cat => cat.id === resultCategoryId) || null : null;

  const categoryProducts = useMemo(() => {
    const enabledProducts = products.filter(product => product.isEnabled);
    if (!resultCategoryId) return enabledProducts;

    const allowedCategoryIds = new Set<string>([resultCategoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      categories.forEach((category) => {
        if (category.parentId && allowedCategoryIds.has(category.parentId) && !allowedCategoryIds.has(category.id)) {
          allowedCategoryIds.add(category.id);
          changed = true;
        }
      });
    }

    return enabledProducts.filter((product) => {
      const assignedCategoryIds = Array.from(new Set([
        product.categoryId,
        product.subcategoryId,
        ...(product.categoryIds || [])
      ].filter(Boolean) as string[]));
      return assignedCategoryIds.some((categoryId) => allowedCategoryIds.has(categoryId));
    });
  }, [categories, products, resultCategoryId]);

  const showCategoryResults = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setResultCategoryId(categoryId);
    setShowResults(true);
  };

  const backToBrowse = () => {
    setShowResults(false);
    setResultCategoryId(selectedCategory);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-2 px-2 text-slate-950 dark:text-slate-100 sm:px-4 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">Categories</h2>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          aria-label="Close categories"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.30)]' : 'border-slate-200 bg-white'}`}>
        <div className="grid min-h-[calc(100dvh-128px)] grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[132px_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className={`max-h-[calc(100dvh-190px)] overflow-y-auto border-r ${isDarkMode ? 'border-slate-700 bg-slate-900/80' : 'border-slate-100 bg-slate-50/70'}`}>
            <button
              type="button"
              onClick={() => {
                setActiveParentId(null);
                showCategoryResults(null);
              }}
              className={`flex w-full flex-col items-center gap-1.5 border-b px-1 py-2 text-center text-[10px] font-semibold transition sm:gap-2 sm:px-2 sm:py-3 sm:text-xs md:flex-row md:items-center md:justify-start md:gap-3 md:px-3 md:text-left ${showResults && !resultCategoryId ? 'border-l-4 border-l-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200' : isDarkMode ? 'border-slate-800 text-slate-200 hover:bg-slate-800' : 'border-slate-100 text-slate-700 hover:bg-white'}`}
            >
              <CategoryThumb category={null} className="h-9 w-9 rounded-lg sm:h-11 sm:w-11 md:h-12 md:w-12 md:rounded-xl" />
              <span className="line-clamp-2 md:line-clamp-1">All Items</span>
            </button>

            {topLevelCategories.map((cat) => {
              const active = activeParentId === cat.id;
              const showingResult = showResults && (resultCategoryId === cat.id || categories.find(c => c.id === resultCategoryId)?.parentId === cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveParentId(cat.id);
                    setShowResults(false);
                  }}
                  className={`flex w-full flex-col items-center gap-1.5 border-b px-1 py-2 text-center text-[10px] font-semibold leading-tight transition sm:gap-2 sm:px-2 sm:py-3 sm:text-xs md:flex-row md:items-center md:justify-start md:px-3 md:text-left ${active || showingResult ? 'border-l-4 border-l-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-200' : isDarkMode ? 'border-slate-800 text-slate-200 hover:bg-slate-800' : 'border-slate-100 text-slate-700 hover:bg-white'}`}
                >
                  <CategoryThumb category={cat} className="h-9 w-9 rounded-lg sm:h-11 sm:w-11 md:h-12 md:w-12 md:rounded-xl" />
                  <span className="line-clamp-2 md:line-clamp-1">{cat.name}</span>
                </button>
              );
            })}
          </aside>

          <section className="max-h-[calc(100dvh-190px)] overflow-y-auto p-2 sm:p-4 md:p-5">
            {showResults ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={backToBrowse}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Categories
                  </button>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {categoryProducts.length} items
                  </span>
                </div>

                <SearchResultsView
                  query={resultCategory?.name || 'All Items'}
                  products={categoryProducts}
                  categories={categories}
                  cart={cart}
                  updateCartQty={updateCartQty}
                  addToCart={addToCart}
                  setSelectedProduct={setSelectedProduct}
                  toggleWishlist={toggleWishlist}
                  activeUser={activeUser}
                  isDarkMode={isDarkMode}
                  onShareProduct={onShareProduct}
                  searchSort={categorySort}
                  setSearchSort={setCategorySort}
                  compactMobile
                />
              </div>
            ) : activeParent ? (
              <>
                <div className="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
                  <CategoryThumb category={activeParent} className="h-11 w-11 rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white sm:text-lg">{activeParent.name}</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {activeSubcategories.length ? `${activeSubcategories.length} subcategories` : 'Products available in this section'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => showCategoryResults(activeParent.id)}
                  className={`mb-3 flex w-full items-center gap-2 rounded-xl border p-2 text-left transition sm:gap-3 sm:p-3 ${selectedCategory === activeParent.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' : isDarkMode ? 'border-slate-800 bg-slate-900 hover:border-indigo-800' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'}`}
                >
                  <CategoryThumb category={activeParent} className="h-9 w-9 rounded-lg sm:h-11 sm:w-11 sm:rounded-xl" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold sm:text-sm">All {activeParent.name}</p>
                    <p className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">Open products in this section</p>
                  </div>
                </button>

                <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {activeSubcategories.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => showCategoryResults(sub.id)}
                      className={`group relative flex min-w-0 flex-col items-center justify-start gap-1.5 text-center transition ${selectedCategory === sub.id ? 'text-indigo-700 dark:text-indigo-300' : isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                      <CategoryThumb
                        category={sub}
                        className={`h-10 w-10 rounded-xl border-0 shadow-sm transition group-hover:-translate-y-0.5 sm:h-12 sm:w-12 ${selectedCategory === sub.id ? 'ring-2 ring-indigo-500/40' : ''}`}
                      />
                      <span className="line-clamp-2 max-w-[76px] text-[10px] font-semibold leading-tight sm:text-xs">{sub.name}</span>
                      {selectedCategory === sub.id && <span className="absolute -bottom-1 h-0.5 w-8 rounded-full bg-indigo-600" />}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                <CategoryThumb category={null} className="h-16 w-16 rounded-2xl" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">All Items</h3>
                <p className="mt-1 max-w-xs text-sm font-medium text-slate-500 dark:text-slate-400">
                  Open the full product list inside the categories page.
                </p>
                <button
                  type="button"
                  onClick={() => showCategoryResults(null)}
                  className="mt-4 rounded-full bg-indigo-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600"
                >
                  View All Products
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
