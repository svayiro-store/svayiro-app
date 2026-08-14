import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Compass, Heart, Minus, Plus, Share2, ShoppingCart, SlidersHorizontal, Star } from 'lucide-react';
import { Category, Product, User as UserType } from '../../types';
import { cartQuantityLabel, formatProductMeasure, isLooseProduct, looseQuantityOptions } from '../../utils/productMeasure';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';

interface SearchResultsViewProps {
  query: string;
  products: Product[];
  categories: Category[];
  cart: { productId: string; quantity: number }[];
  updateCartQty: (pId: string, qty: number) => void;
  addToCart: (pId: string, qty?: number) => void;
  setSelectedProduct: (prod: Product) => void;
  toggleWishlist: (pId: string) => void;
  activeUser: UserType | null;
  isDarkMode: boolean;
  onShareProduct?: (prod: Product) => void;
  searchSort: 'relevance' | 'price_low' | 'price_high' | 'newest';
  setSearchSort: (sort: 'relevance' | 'price_low' | 'price_high' | 'newest') => void;
  compactMobile?: boolean;
}

type SearchSort = SearchResultsViewProps['searchSort'];

export default function SearchResultsView({
  query,
  products,
  categories,
  cart,
  updateCartQty,
  addToCart,
  setSelectedProduct,
  toggleWishlist,
  activeUser,
  isDarkMode,
  onShareProduct,
  searchSort,
  setSearchSort,
  compactMobile = false
}: SearchResultsViewProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedLooseQtyByProduct, setSelectedLooseQtyByProduct] = useState<Record<string, number>>({});
  const sortWrapRef = useRef<HTMLDivElement | null>(null);
  const selectedLooseQty = (prod: Product) => selectedLooseQtyByProduct[prod.id] || looseQuantityOptions(prod)[0]?.value || 1;
  const sortOptions = [
    { id: 'relevance', label: 'Relevance' },
    { id: 'price_low', label: 'Price -- Low to High' },
    { id: 'price_high', label: 'Price -- High to Low' },
    { id: 'newest', label: 'Newest First' }
  ] as const;
  const activeSortLabel = sortOptions.find((option) => option.id === searchSort)?.label || 'Sort';

  useEffect(() => {
    if (!isSortOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sortWrapRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  return (
    <div className={`rounded-xl border ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      <div className={`border-b border-slate-200 dark:border-slate-800 ${compactMobile ? 'p-2 sm:p-4' : 'p-4'}`}>
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <button className="hover:text-indigo-600">Home</button>
          <span>/</span>
          <span>Search</span>
          <span>/</span>
          <span className="truncate">{query}</span>
        </div>
        <h2 className={`${compactMobile ? 'text-xs sm:text-base' : 'text-base'} font-semibold text-slate-900 dark:text-white`}>
          Showing {products.length ? `1 - ${products.length}` : '0'} results for "{query}"
        </h2>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort results</span>
          <div className="relative" ref={sortWrapRef}>
            <button
              type="button"
              onClick={() => setIsSortOpen((open) => !open)}
              className={`flex min-w-[150px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                <span className="truncate">{activeSortLabel}</span>
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>
            {isSortOpen && (
              <div className={`absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border p-1 shadow-xl ${
                isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
              }`}>
                {sortOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSearchSort(option.id as SearchSort);
                      setIsSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      searchSort === option.id
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span>{option.label}</span>
                    {searchSort === option.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="p-12 text-center">
          <Compass className="mx-auto mb-2 h-12 w-12 text-slate-400" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No related items found</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try another spelling or a broader search word.</p>
        </div>
      ) : (
        <div className={compactMobile
          ? 'grid grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-[repeat(auto-fill,minmax(155px,190px))] sm:gap-3 sm:p-4 lg:grid-cols-[repeat(auto-fill,minmax(165px,215px))]'
          : 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] justify-start gap-2 p-3 sm:grid-cols-[repeat(auto-fill,minmax(155px,190px))] sm:gap-3 sm:p-4 lg:grid-cols-[repeat(auto-fill,minmax(165px,215px))]'
        }>
          {products.map((prod) => {
            const hasDiscount = prod.offerPrice > 0;
            const measure = formatProductMeasure(prod);
            const compactMeasure = formatProductMeasure(prod, { compact: true });
            const itemInCart = cart.find(c => c.productId === prod.id);
            const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
            const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
            const isWishlisted = activeUser?.wishlist.includes(prod.id);
            const assignedCategoryIds = Array.from(new Set([prod.categoryId, (prod as any).subcategoryId, ...(prod.categoryIds || [])].filter(Boolean) as string[]));
            const categoryName = assignedCategoryIds
              .map((categoryId) => categories.find(c => c.id === categoryId)?.name)
              .filter(Boolean)
              .join(', ') || 'Grocery';
            return (
              <div
                key={prod.id}
                className={`w-full rounded-lg border overflow-hidden shadow-xs flex flex-col justify-between group transition-all duration-300 transform hover:-translate-y-0.5 ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-900/95 shadow-[0_12px_28px_rgba(0,0,0,0.30)]'
                    : 'border-slate-200 bg-white hover:shadow-md'
                }`}
              >
                <div className={`relative aspect-square overflow-hidden cursor-pointer animate-fadeIn ${isDarkMode ? 'bg-white' : 'bg-slate-50'}`} onClick={() => setSelectedProduct(prod)}>
                  <img
                    src={prod.images?.[0] || productImageFallback}
                    alt={prod.name}
                    className="w-full h-full object-contain bg-white transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onShareProduct?.(prod); }}
                    className="absolute top-1 right-7 sm:right-8 p-1 rounded-full border shadow bg-white/80 border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-white transition-all z-10"
                    title="Share Product"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleWishlist(prod.id); }}
                    className={`absolute top-1 right-1 p-1 rounded-full border shadow transition-all ${isWishlisted ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-white'}`}
                    title="Wishlist"
                  >
                    <Heart className="h-3 w-3" fill={isWishlisted ? 'currentColor' : 'none'} />
                  </button>
                  {hasDiscount && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_4px_0_rgba(6,95,70,0.45),0_8px_16px_rgba(6,95,70,0.28)] ring-1 ring-emerald-300/50">
                      {Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}%
                    </span>
                  )}
                  {prod.stockCount === 0 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4">
                      <span className="bg-red-600 text-white font-semibold text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded-full uppercase">Out of stock</span>
                    </div>
                  )}
                </div>
                <div className="p-1.5 sm:p-2 flex-1 flex flex-col justify-between gap-1 text-left">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="max-w-[70%] truncate font-mono text-[8px] font-semibold uppercase text-slate-500 dark:text-slate-400 sm:text-[9px]">
                        {categoryName}
                      </span>
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                        <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-200 sm:text-[10px]">{prod.ratingAverage || 'New'}</span>
                      </div>
                    </div>
                    <h4
                      onClick={() => setSelectedProduct(prod)}
                      className="cursor-pointer text-left text-[11px] font-semibold leading-snug tracking-normal text-slate-950 line-clamp-1 hover:text-indigo-500 dark:text-slate-100 dark:hover:text-indigo-300 sm:text-xs"
                    >
                      {prod.name}
                    </h4>
                    {prod.description && (
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(prod)}
                        className="block text-left text-[9px] leading-tight text-slate-500 line-clamp-1 hover:text-indigo-500 dark:text-slate-400 dark:hover:text-indigo-300"
                      >
                        {prod.description.length > 40 ? `${prod.description.slice(0, 40)}... ` : prod.description}
                        {prod.description.length > 40 && <span className="font-semibold text-indigo-600 dark:text-indigo-400">more...</span>}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between flex-wrap gap-0.5">
                      <div className="flex items-baseline gap-1 sm:gap-2">
                        <span className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400">
                          Rs {hasDiscount ? prod.offerPrice : prod.basePrice}
                        </span>
                        {hasDiscount && (
                          <span className="text-slate-400 line-through text-[9px] sm:text-[10px] font-mono">Rs {prod.basePrice}</span>
                        )}
                      </div>
                    {measure && (
                      <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <span className="hidden sm:inline">{measure.toLowerCase()}</span>
                        <span className="sm:hidden">{compactMeasure.toLowerCase()}</span>
                      </span>
                    )}
                    </div>
                    {isLowStock && (
                      <div className="flex items-center gap-1 text-[8px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-md">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span className="truncate">Only {prod.stockCount} left</span>
                      </div>
                    )}
                    <div className="pt-0.5">
                      {itemInCart ? (
                        <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-full px-1.5 sm:px-2.5 py-0.5 text-indigo-600 dark:text-indigo-400">
                          <button onClick={() => updateCartQty(prod.id, itemInCart.quantity - (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))} className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-10 px-1 text-center text-[10px] sm:text-xs font-semibold font-mono">{cartQuantityLabel(prod, itemInCart.quantity)}</span>
                          <button onClick={() => updateCartQty(prod.id, itemInCart.quantity + (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))} className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {isLooseProduct(prod) && (
                            <div className="mb-1 grid grid-cols-4 gap-1">
                              {looseQuantityOptions(prod).map((option) => {
                                const isSelected = selectedLooseQty(prod) === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    disabled={prod.stockCount === 0}
                                    onClick={() => setSelectedLooseQtyByProduct((prev) => ({ ...prev, [prod.id]: option.value }))}
                                    className={`rounded-full border px-1 py-1 text-[9px] font-semibold transition disabled:opacity-40 ${
                                      isSelected
                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow'
                                        : 'border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <button
                            disabled={prod.stockCount === 0}
                            onClick={() => addToCart(prod.id, isLooseProduct(prod) ? selectedLooseQty(prod) : 1)}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-full text-[12px] font-semibold shadow flex items-center justify-center gap-2 disabled:opacity-50 transition"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            <span>{prod.stockCount === 0 ? 'Out of stock' : isLooseProduct(prod) ? `Add ${cartQuantityLabel(prod, selectedLooseQty(prod))}` : 'Add To Bag'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
