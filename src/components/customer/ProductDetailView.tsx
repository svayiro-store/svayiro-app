import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, X, AlertTriangle, Star, Minus, Plus, ShoppingCart, Share2 } from 'lucide-react';
import { Product, Category, User as UserType, Review } from '../../types';
import { ReviewList } from './ReviewList';
import { commonStyles } from './commonStyles';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=900';

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface ProductDetailViewProps {
  selectedProduct: Product;
  products: Product[];
  setSelectedProduct: (prod: Product | null) => void;
  activeUser: UserType | null;
  toggleWishlist: (pId: string) => void;
  categories: Category[];
  isDarkMode: boolean;
  detailQty: number;
  setDetailQty: React.Dispatch<React.SetStateAction<number>>;
  activeImageIndex: number;
  setActiveImageIndex: (index: number) => void;
  addToCart: (productId: string, qty: number) => void;
  tempRating: number;
  setTempRating: (rating: number) => void;
  tempComment: string;
  setTempComment: (comment: string) => void;
  handleSubmittingReview: () => void;
  reviews: Review[];
  onShareProduct?: (prod: Product) => void;
}

export default function ProductDetailView({
  selectedProduct,
  products,
  setSelectedProduct,
  activeUser,
  toggleWishlist,
  categories,
  isDarkMode,
  detailQty,
  setDetailQty,
  activeImageIndex,
  setActiveImageIndex,
  addToCart,
  tempRating,
  setTempRating,
  tempComment,
  setTempComment,
  handleSubmittingReview,
  reviews,
  onShareProduct
}: ProductDetailViewProps) {
  const ownReview = useMemo(() => {
    if (!activeUser) return null;
    const activePhone = String(activeUser.phone || '').replace(/\D/g, '');
    return reviews.find((review) => {
      if (review.productId !== selectedProduct.id) return false;
      if (activeUser.id && review.userId === activeUser.id) return true;
      return activePhone && String(review.customerPhone || '').replace(/\D/g, '') === activePhone;
    }) || null;
  }, [activeUser, reviews, selectedProduct.id]);

  useEffect(() => {
    if (ownReview) {
      setTempRating(ownReview.rating || 5);
      setTempComment(ownReview.comment || '');
    } else {
      setTempRating(5);
      setTempComment('');
    }
  }, [ownReview, selectedProduct.id, setTempComment, setTempRating]);

  const lowStockThreshold = selectedProduct.lowStockAlertThreshold ?? 10;
  const isLowStock = selectedProduct.stockCount > 0 && selectedProduct.stockCount <= lowStockThreshold;
  const productImages = selectedProduct.images?.length ? selectedProduct.images : [productImageFallback];
  const hasMultipleImages = productImages.length > 1;
  const activePrice = selectedProduct.offerPrice > 0 ? selectedProduct.offerPrice : selectedProduct.basePrice;
  const detailTotal = activePrice * detailQty;
  const selectedWords = new Set(
    `${selectedProduct.name} ${selectedProduct.description}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
  const similarProducts = products
    .filter((product) => product.id !== selectedProduct.id && product.isEnabled !== false)
    .map((product) => {
      const productWords = `${product.name} ${product.description}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
      const wordScore = productWords.reduce((score, word) => score + (selectedWords.has(word) ? 1 : 0), 0);
      const selectedCategoryIds = new Set([selectedProduct.categoryId, (selectedProduct as any).subcategoryId, ...(selectedProduct.categoryIds || [])].filter(Boolean) as string[]);
      const productCategoryIds = [product.categoryId, (product as any).subcategoryId, ...(product.categoryIds || [])].filter(Boolean) as string[];
      const categoryScore = productCategoryIds.some((categoryId) => selectedCategoryIds.has(categoryId)) ? 8 : 0;
      const priceGap = Math.abs((product.offerPrice || product.basePrice) - (selectedProduct.offerPrice || selectedProduct.basePrice));
      return { product, score: categoryScore + wordScore, priceGap };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.priceGap - b.priceGap)
    .slice(0, 6)
    .map((entry) => entry.product);
  const goToPreviousImage = () => {
    setActiveImageIndex(activeImageIndex === 0 ? productImages.length - 1 : activeImageIndex - 1);
  };
  const goToNextImage = () => {
    setActiveImageIndex(activeImageIndex === productImages.length - 1 ? 0 : activeImageIndex + 1);
  };

  return (
    <div className="mx-auto mb-6 flex w-full max-w-6xl flex-col rounded-2xl border border-slate-200/60 bg-white p-4 font-sans shadow-sm animate-fadeIn select-none dark:border-slate-800/60 dark:bg-slate-900 md:p-5">
      
      {/* Back Button and Actions Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-850">
        <button 
          onClick={() => setSelectedProduct(null)}
          className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
          <span>Back to Store</span>
        </button>
        
        <div className="flex items-center gap-3">
            {/* Share product */}
            <button
              onClick={() => onShareProduct?.(selectedProduct)}
              className="p-2 rounded-full border bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
              title="Share Product"
            >
              <Share2 className="h-4.5 w-4.5" />
            </button>

            {/* Wishlist toggle */}
            {activeUser && (
              <button
                onClick={() => toggleWishlist(selectedProduct.id)}
                className={`p-2 rounded-full border transition-all ${
                  activeUser?.wishlist.includes(selectedProduct.id)
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-500'
                    : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500'
                }`}
                title="Toggle Bookmark"
              >
                <Heart className="h-4.5 w-4.5" fill={activeUser?.wishlist.includes(selectedProduct.id) ? "currentColor" : "none"} />
              </button>
            )}

            <button 
              onClick={() => setSelectedProduct(null)} 
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              title="Close viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

      {/* Main Content Area */}
      <div className="grid w-full flex-1 grid-cols-1 gap-6 py-3 md:py-5 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] lg:items-start">
        
        {/* Left Side: Gorgeous Image Presentation */}
        <div className="flex w-full max-w-[420px] flex-col gap-3 justify-self-center lg:sticky lg:top-24">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200/50 bg-slate-100 shadow-sm group dark:border-slate-800/50 dark:bg-[#111827]">
            <img 
              src={productImages[activeImageIndex] || productImages[0]} 
              alt={selectedProduct.name} 
              className="h-full w-full object-contain p-2 transition-all duration-500 group-hover:scale-[1.02]" 
              referrerPolicy="no-referrer"
            />
            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={goToPreviousImage}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white dark:border-slate-700 dark:bg-slate-950/85 dark:text-white"
                  aria-label="Previous product image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNextImage}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white dark:border-slate-700 dark:bg-slate-950/85 dark:text-white"
                  aria-label="Next product image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 backdrop-blur">
                  {productImages.map((_, index) => (
                    <button
                      key={`image-dot-${index}`}
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      className={`h-1.5 rounded-full transition-all ${activeImageIndex === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75'}`}
                      aria-label={`Show product image ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Dynamic tag */}
            {isLowStock && (
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow-lg">
                <AlertTriangle className="h-3 w-3" />
                <span>Low Stock</span>
              </div>
            )}
            {selectedProduct.stockCount === 0 && (
              <div className="absolute left-3 top-3 rounded-full bg-rose-500 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow-lg">
                <span>Out of stock</span>
              </div>
            )}
          </div>

          {/* Thumbnails list */}
          {hasMultipleImages && (
            <div className="flex gap-3 overflow-x-auto py-1 scrollbar-none">
              {productImages.map((img, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setActiveImageIndex(idx)}
                  className={`h-14 w-14 overflow-hidden rounded-xl border-2 transition-all sm:h-16 sm:w-16 ${
                    activeImageIndex === idx 
                      ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-white scale-105 shadow-md' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-contain bg-white p-1 dark:bg-slate-950" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Product Description, Action Controllers & Custom Reviews */}
        <div className="flex min-w-0 flex-col justify-between space-y-6">
          
          <div className="space-y-6 text-left">
            
            {/* Breadcrumbs or Category block */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-full">
                {categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Chakki Specialty'}
              </span>
              
              <span className={`text-xs font-semibold ${selectedProduct.stockCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                {selectedProduct.stockCount === 0 ? 'Out of stock' : isLowStock ? `Only ${selectedProduct.stockCount} left` : 'In stock'}
              </span>
            </div>

            {/* Title & Stats */}
            <div className="space-y-2">
              <h1 className="font-serif text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {selectedProduct.name}
              </h1>
              
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1 text-amber-500 font-bold bg-amber-50 dark:bg-amber-950/20 px-3 py-1 rounded-full border border-amber-200/40 dark:border-amber-800/40">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  <span>{selectedProduct.ratingAverage || 'New'} Avg Rating</span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-medium">({selectedProduct.ratingCount} Customer Reviews)</span>
              </div>
            </div>

            {/* Sizable Price Box */}
            <div className="space-y-2 rounded-2xl border border-slate-200/40 bg-slate-100/50 p-4 dark:border-slate-800/40 dark:bg-[#111827]/40">
              <div className="flex justify-between items-baseline">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">
                    {money(activePrice)}
                  </span>
                  {selectedProduct.offerPrice > 0 && (
                    <>
                      <span className="text-slate-400 line-through text-sm">{money(selectedProduct.basePrice)}</span>
                      <span className="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black px-2.5 py-0.5 rounded-md">
                        Save {Math.round(((selectedProduct.basePrice - selectedProduct.offerPrice) / selectedProduct.basePrice) * 100)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Net weight description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/50 dark:border-slate-800/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Package Weight</p>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-1">{selectedProduct.weight / 1000} Kg</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/50 dark:border-slate-800/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Store Product Quality</p>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-1">100% Hand-Selected Quality</p>
              </div>
            </div>

            {/* Product Description */}
            <div className="space-y-2 text-left">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sourcing & Quality Standards</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedProduct.description}
              </p>
            </div>

            {/* Interactive Qty Counter (if in stock) */}
            {selectedProduct.stockCount > 0 && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Quantities</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">Total: {money(detailTotal)}</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/30 dark:border-slate-700/30">
                  <button 
                    onClick={() => setDetailQty(prev => Math.max(1, prev - 1))}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:shadow-sm transition"
                    title="Reduce quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-black text-slate-800 dark:text-white">{detailQty}</span>
                  <button 
                    onClick={() => setDetailQty(prev => Math.min(selectedProduct.stockCount, prev + 1))}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:shadow-sm transition"
                    title="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* ATC Buttons panel */}
          <div className="space-y-4 text-left">
            {selectedProduct.stockCount === 0 ? (
              <button disabled className="w-full bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 font-bold py-4 text-xs rounded-2xl cursor-not-allowed uppercase tracking-wider">Product out of stock</button>
            ) : (
              <button 
                onClick={() => {
                  addToCart(selectedProduct.id, detailQty);
                  setSelectedProduct(null);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl text-xs font-black shadow-lg text-center flex items-center justify-center gap-2 transition hover:shadow-indigo-600/10 hover:translate-y-[-1px] uppercase tracking-wider"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>Add to Shopping Bag - {money(detailTotal)}</span>
              </button>
            )}
          </div>

          {/* Review submit sub-component inside Drawer */}
          <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-8 mt-8 space-y-6 text-left">
            <div className="flex justify-between items-center">
              <h4 className="font-serif text-lg font-black text-slate-900 dark:text-white">Customer Reviews</h4>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">{selectedProduct.ratingCount} verified ratings</span>
            </div>
            
            <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
              <ReviewList pId={selectedProduct.id} reviews={reviews} isDark={isDarkMode} />
            </div>
            
            {/* Submit review */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200/50 dark:border-slate-800/50 p-5 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    {ownReview ? 'Edit your product review' : 'How was your product quality?'}
                  </h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {activeUser
                      ? ownReview
                        ? 'You already rated this item. Updating replaces your previous rating/review.'
                        : 'One customer can publish one rating per product. Review text is optional.'
                      : 'Sign in to publish a verified review.'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[1,2,3,4,5].map(star => (
                    <Star 
                      key={star} 
                      onClick={() => setTempRating(star)} 
                      className={`h-5 w-5 cursor-pointer transition ${tempRating >= star ? 'text-amber-500 fill-amber-500' : 'text-slate-300 hover:scale-110'}`} 
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <input 
                  id="product_review_comment"
                  name="product_review_comment"
                  type="text" 
                  disabled={!activeUser}
                  placeholder={activeUser ? 'Optional: write a short review...' : 'Please sign in to rate this product'}
                  value={tempComment} 
                  onChange={(e) => setTempComment(e.target.value)}
                  className={`flex-1 ${commonStyles.input}`}
                />
                <button
                  disabled={!activeUser}
                  onClick={handleSubmittingReview}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-5 py-2.5 rounded-xl text-xs shadow hover:shadow-indigo-600/10 transition uppercase tracking-wider shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ownReview ? 'Update' : 'Rate'}
                </button>
              </div>
            </div>
          </div>

          {similarProducts.length > 0 && (
            <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-8 mt-8 space-y-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-serif text-lg font-black text-slate-900 dark:text-white">Similar Products</h4>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Based on category, product name, and description.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {similarProducts.map((product) => {
                  const price = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
                  const hasDiscount = product.offerPrice > 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setActiveImageIndex(0);
                        setDetailQty(1);
                        setSelectedProduct(product);
                      }}
                      className={`overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:shadow-md ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-900">
                        <img
                          src={product.images?.[0] || productImageFallback}
                          alt={product.name}
                          className="h-full w-full object-cover transition hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="line-clamp-2 text-[11px] font-black text-slate-900 dark:text-white">{product.name}</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{money(price)}</span>
                          {hasDiscount && <span className="text-[9px] text-slate-400 line-through">{money(product.basePrice)}</span>}
                        </div>
                        <p className="text-[9px] font-semibold text-slate-500">{categories.find(c => c.id === product.categoryId)?.name || 'Product'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// Mock fallback reviews matching CustomerApp review system
const reviewsListMockFallback = [
  {
    id: "rev_1",
    productId: "prod_atta_10kg",
    customerName: "Rakesh Sharma",
    rating: 5,
    comment: "This whole wheat flour is superb. The rotis are indeed exceptionally soft and stay fresh for a very long time.",
    date: "2026-06-01T10:30:00Z",
    reply: "Thank you Rakesh! We take immense pride in stone grinding our flour freshly every day for our beloved customers.",
    isHidden: false
  },
  {
    id: "rev_2",
    productId: "prod_atta_10kg",
    customerName: "Anjali Gupta",
    rating: 4,
    comment: "Very high quality Atta, absolutely clean and wholesome. Recommending this shop to everyone in the neighborhood.",
    date: "2026-06-05T14:15:00Z",
    reply: null,
    isHidden: false
  },
  {
    id: "rev_3",
    productId: "prod_milk_500ml",
    customerName: "Amit Verma",
    rating: 5,
    comment: "Excellent high-cream milk. Highly consistent quality, and prompt morning delivery slots.",
    date: "2026-06-08T08:00:00Z",
    reply: "Thank you Amit! Happy to fuel your mornings.",
    isHidden: false
  }
];

