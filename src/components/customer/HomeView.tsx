import React, { useEffect, useRef, useState } from 'react';
import {
  Compass, Heart, Plus, Minus,
  ShoppingCart, Star, AlertTriangle, Share2, Gift
} from 'lucide-react';
import { Banner, Category, Product, User as UserType, ShopProfile, Coupon } from '../../types';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';
const bannerImageFallback = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1400';

const birthdayStars = [
  { left: '10%', top: '18%', x: '-80px', y: '-95px', color: 'text-amber-300', size: 'h-6 w-6', delay: '0ms' },
  { left: '24%', top: '32%', x: '-45px', y: '105px', color: 'text-rose-400', size: 'h-5 w-5', delay: '90ms' },
  { left: '40%', top: '16%', x: '58px', y: '-92px', color: 'text-indigo-300', size: 'h-6 w-6', delay: '60ms' },
  { left: '58%', top: '28%', x: '92px', y: '72px', color: 'text-emerald-300', size: 'h-5 w-5', delay: '150ms' },
  { left: '74%', top: '14%', x: '76px', y: '-82px', color: 'text-yellow-300', size: 'h-7 w-7', delay: '30ms' },
  { left: '88%', top: '34%', x: '48px', y: '98px', color: 'text-pink-400', size: 'h-5 w-5', delay: '210ms' },
  { left: '16%', top: '60%', x: '-95px', y: '52px', color: 'text-violet-300', size: 'h-5 w-5', delay: '250ms' },
  { left: '50%', top: '56%', x: '0px', y: '110px', color: 'text-amber-200', size: 'h-6 w-6', delay: '130ms' },
  { left: '80%', top: '62%', x: '86px', y: '66px', color: 'text-emerald-300', size: 'h-5 w-5', delay: '310ms' }
];

const birthdayGlints = [
  { left: '7%', top: '42%', color: 'text-white', size: 'h-4 w-4', delay: '40ms' },
  { left: '18%', top: '12%', color: 'text-yellow-200', size: 'h-3 w-3', delay: '160ms' },
  { left: '32%', top: '72%', color: 'text-rose-200', size: 'h-4 w-4', delay: '260ms' },
  { left: '46%', top: '36%', color: 'text-white', size: 'h-5 w-5', delay: '110ms' },
  { left: '64%', top: '74%', color: 'text-amber-100', size: 'h-4 w-4', delay: '220ms' },
  { left: '78%', top: '44%', color: 'text-white', size: 'h-3 w-3', delay: '320ms' },
  { left: '92%', top: '20%', color: 'text-yellow-200', size: 'h-4 w-4', delay: '80ms' }
];

function isBirthdayCoupon(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'birthday' || metadata.birthdayOnly === true || /(BDAY|BIRTHDAY|BIRTH|HBD)/i.test(coupon.code || '');
}

function couponValueText(coupon: Coupon) {
  return coupon.discountType === 'percentage'
    ? `${coupon.discountValue}% off`
    : `Rs ${coupon.discountValue} off`;
}

interface HomeViewProps {
  shop: ShopProfile;
  isShopClosed: boolean;
  banners: Banner[];
  currentBannerIndex: number;
  setCurrentBannerIndex: React.Dispatch<React.SetStateAction<number>> | ((index: number | ((prev: number) => number)) => void);
  categories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  products: Product[];
  filteredProducts: Product[];
  onLoadMoreProducts?: (params?: { categoryId?: string | null; limit?: number }) => Promise<number>;
  cart: { productId: string; quantity: number }[];
  updateCartQty: (pId: string, qty: number) => void;
  addToCart: (pId: string) => void;
  setSelectedProduct: (prod: Product) => void;
  toggleWishlist: (pId: string) => void;
  activeUser: UserType | null;
  isDarkMode: boolean;
  onShareProduct?: (prod: Product) => void;
  isBirthdayToday?: boolean;
  loyaltySummary?: {
    totalOrders: number;
    totalSpend: number;
    points: number;
    nextRewardAt: number;
  };
  suggestedCoupons?: Coupon[];
  onUseCoupon?: (code: string) => void;
}

export default function HomeView({
  shop,
  isShopClosed,
  banners,
  currentBannerIndex,
  setCurrentBannerIndex,
  categories,
  selectedCategory,
  setSelectedCategory,
  products,
  filteredProducts,
  onLoadMoreProducts,
  cart,
  updateCartQty,
  addToCart,
  setSelectedProduct,
  toggleWishlist,
  activeUser,
  isDarkMode,
  onShareProduct,
  isBirthdayToday = false,
  suggestedCoupons = [],
  onUseCoupon
}: HomeViewProps) {
  const [birthdayCouponOpen, setBirthdayCouponOpen] = useState(false);
  const [birthdayRedeemMessage, setBirthdayRedeemMessage] = useState('');
  const [birthdayCouponApplied, setBirthdayCouponApplied] = useState(false);
  const [visibleProductCount, setVisibleProductCount] = useState(10);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [exhaustedProductKeys, setExhaustedProductKeys] = useState<Record<string, boolean>>({});
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const holidayBroadcastMessage = (shop?.holidayMessage || '').trim();
  const closedBroadcastText = shop?.isHolidayMode && holidayBroadcastMessage
    ? holidayBroadcastMessage
    : `SVAYIRO STORE IS CURRENTLY CLOSED: Cart saving is active, but checkouts are disabled temporarily.${holidayBroadcastMessage ? ` ${holidayBroadcastMessage}` : ''}`;

  const activeBanner = banners[currentBannerIndex];
  const birthdayCoupon = suggestedCoupons.find(isBirthdayCoupon);
  const birthdayMinOrder = Number(birthdayCoupon?.minOrderValue || 0);
  const showBirthdayBubble = Boolean(activeUser && isBirthdayToday);

  // Only top-level categories show as circles here; subcategories expand inline below
  const topLevelCategories = categories.filter(cat => !cat.parentId);
  const selectedCategoryDetails = selectedCategory ? categories.find(cat => cat.id === selectedCategory) : null;
  const selectedParentCategory = selectedCategoryDetails
    ? selectedCategoryDetails.parentId
      ? categories.find(cat => cat.id === selectedCategoryDetails.parentId) || null
      : selectedCategoryDetails
    : null;
  const activeSectionId = expandedCategoryId || selectedParentCategory?.id || null;

  const scrollToProducts = () => {
    const productsEl = document.getElementById('catalog-products-list-anchor');
    if (productsEl) {
      productsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCategoryCircleClick = (cat: Category) => {
    const hasSubcategories = categories.some(c => c.parentId === cat.id);
    if (hasSubcategories) {
      setSelectedCategory(cat.id);
      setExpandedCategoryId(cat.id);
      scrollToProducts();
    } else {
      setSelectedCategory(cat.id);
      setExpandedCategoryId(null);
      scrollToProducts();
    }
  };

  const bannerRailRef = useRef<HTMLDivElement | null>(null);
  const bannerCardRefs = useRef<(HTMLElement | null)[]>([]);
  const userTouchedBannerRailRef = useRef(false);
  const bannerScrollFrameRef = useRef<number | null>(null);
  const bannerScrollEndTimerRef = useRef<number | null>(null);
  const productLoadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (userTouchedBannerRailRef.current) return;
    const rail = bannerRailRef.current;
    const card = bannerCardRefs.current[currentBannerIndex];
    if (!rail || !card) return;
    const targetLeft = card.offsetLeft - rail.offsetLeft - Math.max(0, (rail.clientWidth - card.clientWidth) / 2);
    rail.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [currentBannerIndex]);

  useEffect(() => {
    return () => {
      if (bannerScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(bannerScrollFrameRef.current);
      }
      if (bannerScrollEndTimerRef.current !== null) {
        window.clearTimeout(bannerScrollEndTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setVisibleProductCount(10);
    setIsLoadingMoreProducts(false);
  }, [selectedCategory, filteredProducts.length]);

  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const productPageKey = selectedCategory || 'all';
  const hasMoreProducts = visibleProductCount < filteredProducts.length || (Boolean(onLoadMoreProducts) && !exhaustedProductKeys[productPageKey]);

  const loadMoreProducts = async () => {
    if (!hasMoreProducts || isLoadingMoreProducts) return;
    setIsLoadingMoreProducts(true);
    if (visibleProductCount < filteredProducts.length) {
      window.setTimeout(() => {
        setVisibleProductCount((count) => Math.min(count + 10, filteredProducts.length));
        setIsLoadingMoreProducts(false);
      }, 450);
      return;
    }
    try {
      const fetchedCount = onLoadMoreProducts
        ? await onLoadMoreProducts({ categoryId: selectedCategory, limit: 10 })
        : 0;
      if (fetchedCount < 10) {
        setExhaustedProductKeys((prev) => ({ ...prev, [productPageKey]: true }));
      }
      setVisibleProductCount((count) => count + Math.max(0, fetchedCount));
    } finally {
      setIsLoadingMoreProducts(false);
    }
  };

  useEffect(() => {
    const sentinel = productLoadMoreRef.current;
    if (!sentinel || !hasMoreProducts || isLoadingMoreProducts) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreProducts();
        }
      },
      { root: null, rootMargin: '420px 0px', threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreProducts, isLoadingMoreProducts, visibleProductCount, filteredProducts.length, selectedCategory, exhaustedProductKeys[productPageKey]]);

  const syncBannerIndexFromScroll = () => {
    const rail = bannerRailRef.current;
    if (!rail || banners.length === 0) return;
    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let nearestIndex = currentBannerIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;
    bannerCardRefs.current.forEach((card, index) => {
      if (!card) return;
      const cardCenter = card.offsetLeft - rail.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(cardCenter - railCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex !== currentBannerIndex) {
      setCurrentBannerIndex(nearestIndex);
    }
  };

  const handleBannerRailScroll = () => {
    if (!userTouchedBannerRailRef.current) return;
    if (bannerScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(bannerScrollFrameRef.current);
    }
    bannerScrollFrameRef.current = window.requestAnimationFrame(() => {
      bannerScrollFrameRef.current = null;
      syncBannerIndexFromScroll();
    });
    if (bannerScrollEndTimerRef.current !== null) {
      window.clearTimeout(bannerScrollEndTimerRef.current);
    }
    bannerScrollEndTimerRef.current = window.setTimeout(() => {
      bannerScrollEndTimerRef.current = null;
      syncBannerIndexFromScroll();
    }, 120);
  };

  const isBannerClickable = (banner?: Banner) => Boolean(banner?.linkType && banner.linkType !== 'none' && banner.linkId);

  const handleBannerClick = (banner = activeBanner) => {
    if (!banner?.linkId || !banner.linkType || banner.linkType === 'none') return;
    if (banner.linkType === 'url') {
      window.open(banner.linkId, '_blank', 'noopener,noreferrer');
      return;
    }
    if (banner.linkType === 'category') {
      setSelectedCategory(banner.linkId);
      document.getElementById('catalog-products-list-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (banner.linkType === 'product') {
      const linkedProduct = products.find((product) => product.id === banner.linkId);
      if (linkedProduct) setSelectedProduct(linkedProduct);
    }
  };

  return (
    <div className="space-y-8">
      {/* Store status and broadcast messages directly above Banner */}
      {isShopClosed && (
        <div className={`${shop?.isHolidayMode ? 'bg-amber-500 text-slate-950 border-amber-400/40' : 'bg-rose-600 text-white border-rose-500/30 animate-pulse'} py-2.5 px-4 rounded-xl text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow border`}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{closedBroadcastText}</span>
        </div>
      )}

      {!isShopClosed && shop?.isHolidayMode && holidayBroadcastMessage && (
        <div className="bg-amber-500 text-slate-950 py-2.5 px-4 rounded-xl text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow border border-amber-400/40">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{holidayBroadcastMessage}</span>
        </div>
      )}

      {shop?.announcement && !isShopClosed && (
        <div className="bg-emerald-600 text-white py-2.5 px-4 rounded-xl text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow border border-emerald-500/30 animate-fadeIn">
          <span className="leading-relaxed">{shop.announcement}</span>
        </div>
      )}

      {showBirthdayBubble && (
        <>
          {birthdayCouponOpen && (
            <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
              <div className="absolute inset-0 bg-rose-950/10 animate-fadeIn" />
              {birthdayStars.map((spark, index) => (
                <span
                  key={`birthday-star-${index}`}
                  className={`birthday-screen-star absolute ${spark.color} ${spark.size}`}
                  style={{
                    left: spark.left,
                    top: spark.top,
                    animationDelay: spark.delay,
                    '--spark-x': spark.x,
                    '--spark-y': spark.y
                  } as React.CSSProperties}
                />
              ))}
              {birthdayGlints.map((glint, index) => (
                <span
                  key={`birthday-glint-${index}`}
                  className={`birthday-screen-glint absolute ${glint.color} ${glint.size}`}
                  style={{
                    left: glint.left,
                    top: glint.top,
                    animationDelay: glint.delay
                  } as React.CSSProperties}
                />
              ))}
            </div>
          )}
          <div className="fixed bottom-24 right-4 z-[130] sm:bottom-6 sm:right-6">
            {!birthdayCouponOpen ? (
              <button
                type="button"
                onClick={() => setBirthdayCouponOpen(true)}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-400 text-white shadow-2xl ring-4 ring-white/60 transition hover:scale-105 dark:ring-slate-950/80"
                aria-label="Open birthday coupon"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" />
                <Gift className="relative h-6 w-6" />
              </button>
            ) : (
              <div className="relative w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-rose-200 bg-white p-4 text-slate-950 shadow-2xl animate-birthday-pop dark:border-rose-900 dark:bg-slate-950 dark:text-white">
                <div className="relative rounded-2xl bg-gradient-to-br from-rose-50 via-amber-50 to-white p-4 dark:from-rose-950/40 dark:via-amber-950/20 dark:to-slate-950">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-rose-600 shadow-sm ring-1 ring-rose-100 dark:bg-slate-900 dark:text-rose-300 dark:ring-rose-900/60">
                      <Gift className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-500">Birthday celebration</p>
                      <h3 className="mt-1 text-xl font-black leading-tight">Happy Birthday, {activeUser?.name || 'Customer'}!</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        We have a small gift for your special day.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-dashed border-rose-300 bg-white/80 p-3 shadow-inner dark:border-rose-900 dark:bg-slate-900/70">
                    {!birthdayCouponApplied ? (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">Gift coupon</p>
                        <p className="mt-1 font-mono text-lg font-black text-slate-950 dark:text-white">
                          {birthdayCoupon?.code || 'Birthday wishes unlocked'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {birthdayCoupon
                            ? `${couponValueText(birthdayCoupon)} for this account only. It cannot be used by another customer.`
                            : 'The birthday greeting is active. A redeemable birthday coupon will appear here when the store owner enables one.'}
                        </p>
                        {birthdayCoupon && (
                          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/60">
                            {birthdayMinOrder > 0
                              ? `Add items worth at least Rs ${birthdayMinOrder.toFixed(0)} to redeem this birthday gift.`
                              : 'You can apply this birthday gift on your birthday order.'}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-center ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900/60">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Coupon Applied</p>
                        <p className="mt-2 text-lg font-black text-emerald-800 dark:text-emerald-100">Yay! You have used your birthday coupon.</p>
                        <p className="mt-1 text-xs font-bold leading-relaxed text-emerald-700 dark:text-emerald-200">
                          {birthdayRedeemMessage || 'Celebrate the day with your special SVAYIRO birthday saving.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={!birthdayCoupon}
                    onClick={() => {
                      if (!birthdayCoupon) return;
                      if (birthdayCouponApplied) {
                        setBirthdayCouponOpen(false);
                        return;
                      }
                      onUseCoupon?.(birthdayCoupon.code);
                      setBirthdayCouponApplied(true);
                      setBirthdayRedeemMessage('Your birthday coupon was applied successfully. Enjoy the day and celebrate with a little extra saving from SVAYIRO.');
                    }}
                    className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {birthdayCouponApplied ? 'Applied - Continue Shopping' : birthdayCoupon ? 'Apply Birthday Coupon' : 'Coupon Not Enabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBirthdayCouponOpen(false)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                  >
                    Later
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Compact responsive banner rail */}
      {banners.length > 0 && (
        <section className="space-y-2">
          <div
            ref={bannerRailRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onPointerDown={() => { userTouchedBannerRailRef.current = true; }}
            onTouchStart={() => { userTouchedBannerRailRef.current = true; }}
            onWheel={() => { userTouchedBannerRailRef.current = true; }}
            onScroll={handleBannerRailScroll}
          >
            {banners.map((banner, idx) => {
              const clickable = isBannerClickable(banner);
              const isActive = idx === currentBannerIndex;
              return (
                <article
                  key={banner.id || idx}
                  ref={(element) => { bannerCardRefs.current[idx] = element; }}
                  className={`relative aspect-[16/9] w-[calc(100vw-48px)] flex-none snap-center overflow-hidden rounded-2xl border shadow-sm transition sm:w-[360px] lg:w-[420px] xl:w-[440px] ${
                    clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''
                  } ${isActive ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-slate-200 dark:border-slate-800'}`}
                  onClick={() => {
                    setCurrentBannerIndex(idx);
                    handleBannerClick(banner);
                  }}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (clickable && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setCurrentBannerIndex(idx);
                      handleBannerClick(banner);
                    }
                  }}
                >
                  <img
                    src={banner.imageUrl || bannerImageFallback}
                    alt={banner.title || 'Promotional banner'}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {(banner.title || clickable) && (
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      {banner.title && (
                        <h2
                          className="line-clamp-2 max-w-[84%] text-base font-black leading-tight text-white"
                          style={{ textShadow: '0 2px 0 rgba(15,23,42,0.95), 0 5px 14px rgba(15,23,42,0.65)' }}
                        >
                          {banner.title}
                        </h2>
                      )}
                      {clickable && (
                        <p
                          className="mt-1 text-[6px] font-bold uppercase tracking-wide text-white"
                          style={{ textShadow: '0 1px 0 rgba(15,23,42,0.95), 0 3px 10px rgba(15,23,42,0.70)' }}
                        >
                          Tap to open
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {banners.length > 1 && (
            <div className="flex justify-center gap-1.5">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Show banner ${idx + 1}`}
                  onClick={() => setCurrentBannerIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${currentBannerIndex === idx ? 'w-6 bg-indigo-700' : 'w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700'}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Premium Circular Categories Navigation Badges */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-[14px] md:text-base font-extrabold tracking-tight uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Shop Sections
          </h3>
          {selectedCategory && (
            <button
              onClick={() => { setSelectedCategory(null); setExpandedCategoryId(null); }}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold hover:underline"
            >
              Clear Filter
            </button>
          )}
        </div>

        <div className="flex items-center gap-5 overflow-x-auto pb-4 pt-3 px-3 w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* "All Products" circular button */}
          <div
            onClick={() => {
              setSelectedCategory(null);
              setExpandedCategoryId(null);
              scrollToProducts();
            }}
            className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
          >
            <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center border transition-all duration-300 shadow-sm ${
              !selectedCategory
                ? 'border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 ring-4 ring-indigo-500/20 scale-105'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group-hover:scale-105 group-hover:border-indigo-300'
            }`}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-50 dark:bg-slate-850">
                <Compass className="h-5 w-5 text-indigo-700 dark:text-indigo-400" />
              </div>
            </div>
            <span className={`text-[10px] md:text-xs font-bold text-center tracking-tight transition-colors duration-300 max-w-[70px] truncate ${!selectedCategory ? 'text-indigo-700 dark:text-indigo-300 font-extrabold' : 'text-slate-600 dark:text-slate-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300'}`}>
              All Items
            </span>
          </div>

          {/* Main list of category circles (top-level only) */}
          {topLevelCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id || selectedParentCategory?.id === cat.id;
            const isExpanded = activeSectionId === cat.id;
            const hasSubcategories = categories.some(c => c.parentId === cat.id);
            return (
              <div
                key={cat.id}
                onClick={() => handleCategoryCircleClick(cat)}
                className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
              >
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden border transition-all duration-300 p-1 shadow-sm relative ${
                  isSelected || isExpanded
                    ? 'border-indigo-700 bg-indigo-50 dark:bg-indigo-500/5 ring-4 ring-indigo-500/20 scale-105'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group-hover:scale-105 group-hover:border-indigo-300'
                }`}>
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase select-none">
                      {cat.name.substring(0, 2)}
                    </span>
                    {cat.imageUrl && (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-350 group-hover:scale-110 z-10"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  {hasSubcategories && (
                    <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-slate-950 text-[8px] font-black text-white shadow transition-transform ${isExpanded ? 'bg-rose-500 rotate-45' : 'bg-indigo-600'}`}>
                      +
                    </span>
                  )}
                </div>
                <span className={`text-[10px] md:text-xs font-bold text-center tracking-tight transition-colors duration-300 max-w-[80px] truncate ${isSelected || isExpanded ? 'text-indigo-700 dark:text-indigo-300 font-extrabold' : 'text-slate-600 dark:text-slate-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300'}`}>
                  {cat.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Inline subcategory row - bigger round circles, expands under the tapped main category */}
        {activeSectionId && (() => {
          const parentCat = categories.find(c => c.id === activeSectionId);
          const subs = categories.filter(c => c.parentId === activeSectionId);
          if (!parentCat || subs.length === 0) return null;

          const ringPalette = [
            'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900',
            'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
            'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
            'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900',
            'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900',
          ];

          return (
            <div className={`rounded-xl border p-3 animate-fadeIn ${isDarkMode ? 'border-indigo-900/50 bg-indigo-950/10' : 'border-indigo-100 bg-indigo-50/40'}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">Section</p>
                  <h4 className="font-serif text-lg font-black text-slate-950 dark:text-white">{parentCat.name}</h4>
                  {parentCat.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{parentCat.description}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-indigo-700 px-3 py-1 text-[10px] font-black uppercase text-white">
                  {subs.length} aisles
                </span>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto pb-1 px-1 w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* Shortcut to view everything under the main category */}
                <div
                  onClick={() => {
                    setSelectedCategory(parentCat.id);
                    setExpandedCategoryId(parentCat.id);
                    scrollToProducts();
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
                >
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-xl flex items-center justify-center border-2 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md ${
                    selectedCategory === parentCat.id
                      ? 'border-indigo-700 bg-indigo-100 dark:bg-indigo-900/40 ring-4 ring-indigo-500/20'
                      : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800'
                  }`}>
                    <Compass className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
                  </div>
                  <span className="text-[11px] md:text-xs font-bold text-center tracking-tight max-w-[88px] truncate text-indigo-700 dark:text-indigo-300">
                    View All
                  </span>
                </div>

                {subs.map((sub, idx) => {
                  const isSubSelected = selectedCategory === sub.id;
                  return (
                    <div
                      key={sub.id}
                      onClick={() => {
                        setSelectedCategory(sub.id);
                        setExpandedCategoryId(parentCat.id);
                        scrollToProducts();
                      }}
                      className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
                    >
                      <div className={`w-16 h-16 md:w-20 md:h-20 rounded-xl flex items-center justify-center border-2 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md ${
                        isSubSelected
                          ? 'border-indigo-700 ring-4 ring-indigo-500/20 bg-indigo-100 dark:bg-indigo-900/40'
                          : ringPalette[idx % ringPalette.length]
                      }`}>
                        <div className="relative w-[86%] h-[86%] rounded-lg overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center shadow-inner">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase select-none">
                            {sub.name.substring(0, 2)}
                          </span>
                          {sub.imageUrl && (
                            <img
                              src={sub.imageUrl}
                              alt={sub.name}
                              referrerPolicy="no-referrer"
                              className="absolute inset-0 w-full h-full object-cover z-10"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                        </div>
                      </div>
                      <span className={`text-[11px] md:text-xs font-semibold text-center tracking-tight max-w-[88px] truncate ${isSubSelected ? 'text-indigo-700 dark:text-indigo-300 font-extrabold' : 'text-slate-700 dark:text-slate-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300'}`}>
                        {sub.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Filtered category active banner */}
      {selectedCategory && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${isDarkMode ? 'border-indigo-900 bg-indigo-950/20' : 'border-indigo-100 bg-indigo-50/50'} text-xs font-semibold`}>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-indigo-500 text-white font-mono uppercase text-[9px] font-black">Section View</span>
            <span>
              You are shopping in <strong className="text-indigo-600 dark:text-indigo-400">"{selectedParentCategory?.name || selectedCategoryDetails?.name}"</strong>
              {selectedCategoryDetails?.parentId && <> / <strong className="text-indigo-600 dark:text-indigo-400">"{selectedCategoryDetails.name}"</strong></>}
            </span>
          </div>
          <button
            onClick={() => { setSelectedCategory(null); setExpandedCategoryId(null); }}
            className="bg-indigo-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full hover:bg-indigo-500 shadow transition"
          >
            x
          </button>
        </div>
      )}

      {/* Daily Essentials */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3 text-left">
          <div>
            <h3 className="font-serif text-base md:text-lg font-black tracking-tight text-emerald-700 dark:text-emerald-300">Daily Essentials</h3>
            <p className="text-xs opacity-75">Fast-pick staples customers buy repeatedly.</p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline-flex">
            Quick add
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {products.filter(p => p.isDailyEssential && p.isEnabled).slice(0, 4).map((prod) => {
            const hasDiscount = prod.offerPrice > 0;
            const itemInCart = cart.find(c => c.productId === prod.id);
            const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
            const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
            return (
              <div
                key={prod.id}
                onClick={() => setSelectedProduct(prod)}
                className={`group cursor-pointer rounded-xl border p-2 shadow-sm transition-all duration-300 relative overflow-hidden flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-md ${
                  isDarkMode
                    ? 'border-emerald-900/60 bg-slate-950 hover:border-emerald-700'
                    : 'border-emerald-100 bg-white hover:border-emerald-300'
                }`}
              >
                {/* Left vertical border indicator */}
                <div className="absolute bottom-0 left-0 top-0 w-1 bg-emerald-500" />
                {/* Image block */}
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-100/70 bg-emerald-50 shadow-inner dark:border-emerald-950 dark:bg-slate-900">
                  <img
                    src={prod.images?.[0] || productImageFallback}
                    alt={prod.name}
                    className="w-full h-full object-cover transition-transform duration-350 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  {hasDiscount && (
                    <span className="absolute left-1 top-1 rounded-full bg-rose-600 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-white shadow">
                      Special
                    </span>
                  )}
                  <span className="hidden absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 shadow-sm dark:bg-slate-950/90 dark:text-emerald-300">
                    Essential
                  </span>
                </div>
                {/* Details block */}
                <div className="min-w-0 flex-1 space-y-1 pr-9 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {prod.weight / 1000}kg
                    </span>
                    {prod.stockCount === 0 && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        SOLD OUT
                      </span>
                    )}
                  </div>
                  <h4
                    className="line-clamp-1 text-xs font-black leading-tight tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-300"
                  >
                    {prod.name}
                  </h4>
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                      ₹{hasDiscount ? prod.offerPrice : prod.basePrice}
                    </span>
                    {hasDiscount && (
                      <span className="text-slate-400 dark:text-slate-500 line-through text-[10px] font-mono">
                        ₹{prod.basePrice}
                      </span>
                    )}
                    <span className="hidden text-[9px] opacity-70 font-mono">({prod.weight / 1000} kg)</span>
                  </div>
                  {isLowStock && (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-500">
                      ⚠️ Only {prod.stockCount} left
                    </span>
                  )}
                </div>
                {/* Side quick-add trigger */}
                <div onClick={(e) => e.stopPropagation()} className="absolute bottom-2 right-2 flex shrink-0 flex-col gap-1">
                  {itemInCart ? (
                    <div className="flex items-center gap-1 rounded-full bg-emerald-600 p-0.5 text-white shadow">
                      <button
                        onClick={() => updateCartQty(prod.id, itemInCart.quantity - 1)}
                        className="p-0.5 hover:bg-emerald-500 rounded-full"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-[10px] font-black font-mono w-5 text-center">{itemInCart.quantity}</span>
                      <button
                        onClick={() => updateCartQty(prod.id, itemInCart.quantity + 1)}
                        className="p-0.5 hover:bg-emerald-500 rounded-full"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={prod.stockCount === 0}
                      onClick={() => addToCart(prod.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
                      title="Quick Add to Bag"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Products Grid */}
      <div id="catalog-products-list-anchor" className="scroll-mt-24">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg md:text-xl font-bold tracking-tight text-left">
            {selectedCategory ? `${categories.find(c => c.id === selectedCategory)?.name}` : 'Products Catalog'}
          </h3>
          <span className="text-xs opacity-75 font-mono">Showing {visibleProducts.length}/{filteredProducts.length}</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
            <Compass className="h-12 w-12 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold opacity-75">No matching premium items found</p>
            <p className="text-xs opacity-60 mt-1">Try resetting the selected criteria or changing your search terms.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(155px,190px))] lg:grid-cols-[repeat(auto-fill,minmax(165px,215px))] justify-start gap-2 sm:gap-3">
              {visibleProducts.map((prod) => {
                const hasDiscount = prod.offerPrice > 0;
                const itemInCart = cart.find(c => c.productId === prod.id);
                const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
                const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
                const isWishlisted = activeUser?.wishlist.includes(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`w-full rounded-lg border overflow-hidden shadow-xs flex flex-col justify-between group transition-all duration-300 transform hover:-translate-y-0.5 ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/30' : 'border-slate-200 bg-white hover:shadow-md'}`}
                  >
                    {/* Top Banner aspect */}
                    <div className="relative aspect-square overflow-hidden cursor-pointer bg-slate-50 animate-fadeIn" onClick={() => setSelectedProduct(prod)}>
                      <img
                        src={prod.images?.[0] || productImageFallback}
                        alt={prod.name}
                        className="w-full h-full object-contain bg-white transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      {/* Share product button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShareProduct?.(prod);
                        }}
                        className="absolute top-1 right-7 sm:right-8 p-1 rounded-full border shadow bg-white/80 border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-white transition-all z-10"
                        title="Share Product"
                      >
                        <Share2 className="h-3 w-3" />
                      </button>
                      {/* Heart wishlist activator */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWishlist(prod.id);
                        }}
                        className={`absolute top-1 right-1 p-1 rounded-full border shadow transition-all ${isWishlisted ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-white'}`}
                      >
                        <Heart className="h-3 w-3" fill={isWishlisted ? "currentColor" : "none"} />
                      </button>
                      {/* Percent discount label */}
                      {hasDiscount && (
                        <span className="absolute top-1.5 left-1.5 bg-red-600 text-white font-black text-[10px] px-2 py-1 rounded-full uppercase tracking-wider font-mono shadow">
                          {Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}%
                        </span>
                      )}
                      {prod.stockCount === 0 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4">
                          <span className="bg-red-600 text-white font-extrabold text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded-full uppercase">Out of stock</span>
                        </div>
                      )}
                    </div>
                    {/* Text and details */}
                    <div className="p-1.5 sm:p-2 flex-1 flex flex-col justify-between gap-1 text-left">
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[8px] sm:text-[9px] opacity-75 font-mono uppercase truncate max-w-[70%]">
                            {categories.find(c => c.id === prod.categoryId)?.name || 'Grocery'}
                          </span>
                          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                            <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                            <span className="text-[9px] sm:text-[10px] font-bold">{prod.ratingAverage || 'New'}</span>
                          </div>
                        </div>
                        <h4
                          onClick={() => setSelectedProduct(prod)}
                          className="font-bold text-[11px] sm:text-xs leading-snug tracking-tight line-clamp-1 hover:text-indigo-500 cursor-pointer text-left"
                        >
                          {prod.name}
                        </h4>
                        {prod.description && (
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(prod)}
                            className="block text-left text-[9px] leading-tight opacity-70 hover:text-indigo-500 hover:opacity-100 line-clamp-1"
                          >
                            {prod.description.length > 40 ? `${prod.description.slice(0, 40)}... ` : prod.description}
                            {prod.description.length > 40 && <span className="font-bold text-indigo-600 dark:text-indigo-400">more...</span>}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between flex-wrap gap-0.5">
                          <div className="flex items-baseline gap-1 sm:gap-2">
                            <span className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400">
                              ₹{hasDiscount ? prod.offerPrice : prod.basePrice}
                            </span>
                            {hasDiscount && (
                              <span className="text-slate-400 line-through text-[9px] sm:text-[10px] font-mono">₹{prod.basePrice}</span>
                            )}
                          </div>
                          <span className="text-[8px] sm:text-[9px] opacity-70 font-mono">({prod.weight / 1000} kg)</span>
                        </div>
                        {/* Stock and Low Stock notices */}
                        {isLowStock && (
                          <div className="flex items-center gap-1 text-[8px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-md">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">Only {prod.stockCount} left</span>
                          </div>
                        )}
                        {/* Add to Cart controller */}
                        <div className="pt-0.5">
                          {itemInCart ? (
                            <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-full px-1.5 sm:px-2.5 py-0.5 text-indigo-600 dark:text-indigo-400">
                              <button
                                onClick={() => updateCartQty(prod.id, itemInCart.quantity - 1)}
                                className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-xs font-bold w-5 text-center font-mono">{itemInCart.quantity}</span>
                              <button
                                onClick={() => updateCartQty(prod.id, itemInCart.quantity + 1)}
                                className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={prod.stockCount === 0}
                              onClick={() => addToCart(prod.id)}
                              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-full text-[12px] font-bold shadow flex items-center justify-center gap-2 disabled:opacity-50 transition"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              <span>Add To Bag</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {hasMoreProducts && (
              <div ref={productLoadMoreRef} className="mt-5 flex min-h-16 items-center justify-center">
                {isLoadingMoreProducts && (
                  <div className="flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 text-xs font-black uppercase text-indigo-700 shadow-sm dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-300">
                    <span className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-700 animate-spin" />
                    Loading products
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
