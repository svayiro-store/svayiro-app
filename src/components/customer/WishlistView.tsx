import React from 'react';
import { Heart, X, ShoppingCart, Share2 } from 'lucide-react';
import { CustomerTab, Product } from '../../types';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';

interface WishlistViewProps {
  wishlistedProducts: Product[];
  toggleWishlist: (pId: string) => void;
  addToCart: (pId: string) => void;
  setActiveTab: (tab: CustomerTab) => void;
  isDarkMode: boolean;
  onShareProduct?: (prod: Product) => void;
  onSelectProduct: (prod: Product) => void;
}

export default function WishlistView({
  wishlistedProducts,
  toggleWishlist,
  addToCart,
  setActiveTab,
  isDarkMode,
  onShareProduct,
  onSelectProduct
}: WishlistViewProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-left">My Bookmarks & Wishlist</h2>
      
      {wishlistedProducts.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
          <Heart className="h-12 w-12 text-rose-400 mx-auto mb-2 fill-rose-100" />
          <p className="text-sm font-bold opacity-75">Your wishlist is currently empty</p>
          <p className="text-xs opacity-60 mt-1">Bookmark items around the catalog for easy side-checking and buy them later.</p>
          <button onClick={() => setActiveTab('home')} className="mt-4 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full">Go Shopping</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {wishlistedProducts.map(prod => (
            <div 
              key={prod.id}
              className={`border rounded-xl overflow-hidden p-3 flex flex-col justify-between gap-3 text-left group ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/30' : 'border-slate-200 bg-white'}`}
            >
              <div 
                className="cursor-pointer flex items-center gap-3"
                onClick={() => onSelectProduct(prod)}
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img 
                    src={prod.images?.[0] || productImageFallback} 
                    alt={prod.name} 
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" 
                    referrerPolicy="no-referrer" 
                  />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // prevent opening product detail
                      toggleWishlist(prod.id);
                    }}
                    className="absolute top-1 right-1 p-1 rounded-full bg-white/90 hover:bg-white text-rose-500 shadow transition-all active:scale-90"
                    title="Remove from wishlist"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <h4 className="font-bold text-sm tracking-normal line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{prod.name}</h4>
                  <p className="text-xs font-mono opacity-70">Price: ₹{prod.offerPrice > 0 ? prod.offerPrice : prod.basePrice}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    addToCart(prod.id);
                  }}
                  className="flex-1 bg-indigo-600 text-white text-xs font-bold py-2 rounded-full flex items-center justify-center gap-1.5 hover:bg-indigo-500 transition-all active:scale-95"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>Add to bag</span>
                </button>
                <button 
                  onClick={() => onShareProduct?.(prod)}
                  className="p-2 border border-slate-200 dark:border-slate-800 rounded-full text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-900 transition-all active:scale-95"
                  title="Share Product"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
