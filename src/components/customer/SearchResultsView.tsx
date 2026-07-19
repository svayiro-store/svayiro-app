import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Compass, Heart, Minus, Plus, Share2, SlidersHorizontal } from 'lucide-react';
import { Category, Product, User as UserType } from '../../types';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';

interface SearchResultsViewProps {
  query: string;
  products: Product[];
  categories: Category[];
  cart: { productId: string; quantity: number }[];
  updateCartQty: (pId: string, qty: number) => void;
  addToCart: (pId: string) => void;
  setSelectedProduct: (prod: Product) => void;
  toggleWishlist: (pId: string) => void;
  activeUser: UserType | null;
  isDarkMode: boolean;
  onShareProduct?: (prod: Product) => void;
  searchSort: 'relevance' | 'price_low' | 'price_high' | 'newest';
  setSearchSort: (sort: 'relevance' | 'price_low' | 'price_high' | 'newest') => void;
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
  setSearchSort
}: SearchResultsViewProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortWrapRef = useRef<HTMLDivElement | null>(null);
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
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <button className="hover:text-indigo-600">Home</button>
          <span>/</span>
          <span>Search</span>
          <span>/</span>
          <span className="truncate">{query}</span>
        </div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">
          Showing {products.length ? `1 - ${products.length}` : '0'} results for "{query}"
        </h2>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort results</span>
          <div className="relative" ref={sortWrapRef}>
            <button
              type="button"
              onClick={() => setIsSortOpen((open) => !open)}
              className={`flex min-w-[150px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-black shadow-sm transition ${
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
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
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
          <p className="text-sm font-bold opacity-75">No related items found</p>
          <p className="mt-1 text-xs opacity-60">Try another spelling or a broader search word.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 p-3 sm:gap-4 sm:p-4 md:grid-cols-3 xl:grid-cols-5">
          {products.map((prod) => {
            const hasDiscount = prod.offerPrice > 0;
            const itemInCart = cart.find(c => c.productId === prod.id);
            const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
            const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
            const isWishlisted = activeUser?.wishlist.includes(prod.id);
            const categoryName = categories.find(c => c.id === prod.categoryId)?.name || 'Grocery';
            return (
              <div key={prod.id} className={`group overflow-hidden rounded-xl border transition hover:shadow-md ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white'}`}>
                <div className="relative aspect-[4/3] cursor-pointer overflow-hidden bg-slate-50" onClick={() => setSelectedProduct(prod)}>
                  <img src={prod.images?.[0] || productImageFallback} alt={prod.name} className="h-full w-full object-cover transition group-hover:scale-105" referrerPolicy="no-referrer" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); onShareProduct?.(prod); }} className="absolute right-10 top-2 rounded-full border bg-white/85 p-1.5 text-slate-500 shadow hover:text-indigo-600">
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleWishlist(prod.id); }} className={`absolute right-2 top-2 rounded-full border p-1.5 shadow ${isWishlisted ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-200 bg-white/85 text-slate-500'}`}>
                    <Heart className="h-3.5 w-3.5" fill={isWishlisted ? 'currentColor' : 'none'} />
                  </button>
                  {hasDiscount && <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white">{Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}%</span>}
                </div>
                <div className="space-y-1.5 p-2.5 text-left">
                  <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{categoryName}</p>
                  <button type="button" onClick={() => setSelectedProduct(prod)} className="line-clamp-2 text-left text-xs font-semibold leading-snug text-slate-900 hover:text-indigo-600 dark:text-white">
                    {prod.name}
                  </button>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-black text-white">{prod.ratingAverage || 'New'} star</span>
                    <span className="text-slate-500">{prod.weight ? `${prod.weight / 1000} kg` : 'Pack'}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-black text-slate-950 dark:text-white">Rs {hasDiscount ? prod.offerPrice : prod.basePrice}</span>
                    {hasDiscount && <span className="text-xs text-slate-400 line-through">Rs {prod.basePrice}</span>}
                  </div>
                  {isLowStock && (
                    <div className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Only {prod.stockCount} {prod.stockCount === 1 ? 'is' : 'are'} left
                    </div>
                  )}
                  {itemInCart ? (
                    <div className="flex items-center justify-between rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-indigo-600">
                      <button onClick={() => updateCartQty(prod.id, itemInCart.quantity - 1)}><Minus className="h-4 w-4" /></button>
                      <span className="font-mono text-sm font-black">{itemInCart.quantity}</span>
                      <button onClick={() => updateCartQty(prod.id, itemInCart.quantity + 1)}><Plus className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button disabled={prod.stockCount === 0} onClick={() => addToCart(prod.id)} className="w-full rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-black text-white disabled:bg-slate-300">
                      {prod.stockCount === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
