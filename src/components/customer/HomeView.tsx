import React, { useEffect, useRef, useState } from 'react';
import {
  Compass, Heart, Plus, Minus,
  ShoppingCart, Star, AlertTriangle, Share2, Gift
} from 'lucide-react';
import { Banner, Category, Product, User as UserType, ShopProfile, Coupon } from '../../types';
import { cartQuantityLabel, formatProductMeasure, isLooseProduct, looseQuantityOptions } from '../../utils/productMeasure';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';
const bannerImageFallback = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1400';
const PRODUCT_PAGE_SIZE = 20;

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
  productPage?: { page: number; pageSize: number; total: number; categoryId: string | null; isLoading: boolean };
  onChangeProductPage?: (params?: { categoryId?: string | null; page?: number; pageSize?: number }) => Promise<number>;
  cart: { productId: string; quantity: number }[];
  updateCartQty: (pId: string, qty: number) => void;
  addToCart: (pId: string, qty?: number) => void;
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
  productPage,
  onChangeProductPage,
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
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [selectedLooseQtyByProduct, setSelectedLooseQtyByProduct] = useState<Record<string, number>>({});

  const holidayBroadcastMessage = (shop?.holidayMessage || '').trim();
  const closedBroadcastText = shop?.isHolidayMode && holidayBroadcastMessage
    ? holidayBroadcastMessage
    : `SVAYIRO STORE IS CURRENTLY CLOSED: Cart saving is active, but checkouts are disabled temporarily.${holidayBroadcastMessage ? ` ${holidayBroadcastMessage}` : ''}`;

  const activeBanner = banners[currentBannerIndex];
  const birthdayCoupon = suggestedCoupons.find(isBirthdayCoupon);
  const birthdayMinOrder = Number(birthdayCoupon?.minOrderValue || 0);
  const showBirthdayBubble = Boolean(activeUser && isBirthdayToday);

  const selectedCategoryDetails = selectedCategory ? categories.find(cat => cat.id === selectedCategory) : null;
  const selectedParentCategory = selectedCategoryDetails
    ? selectedCategoryDetails.parentId
      ? categories.find(cat => cat.id === selectedCategoryDetails.parentId) || null
      : selectedCategoryDetails
    : null;
  const activeSectionId = expandedCategoryId || selectedParentCategory?.id || null;
  const selectedLooseQty = (prod: Product) => selectedLooseQtyByProduct[prod.id] || looseQuantityOptions(prod)[0]?.value || 1;

  const productQtyBadge = (prod: Product) => {
    const measure = formatProductMeasure(prod);
    const compactMeasure = formatProductMeasure(prod, { compact: true });
    if (!measure) return null;
    return (
      <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
        <span className="hidden sm:inline">{measure.toLowerCase()}</span>
        <span className="sm:hidden">{compactMeasure.toLowerCase()}</span>
      </span>
    );
  };

  const discountedProducts = products
    .filter((product) => product.isEnabled && !isLooseProduct(product) && product.offerPrice > 0 && product.basePrice > product.offerPrice)
    .sort((a, b) => ((b.basePrice - b.offerPrice) / Math.max(1, b.basePrice)) - ((a.basePrice - a.offerPrice) / Math.max(1, a.basePrice)));
  const bestOfferProducts = discountedProducts.slice(0, 6);
  const featuredProducts = products
    .filter((product) => product.isEnabled && !isLooseProduct(product) && product.isFeatured)
    .slice(0, 6);
  const excludedShowcaseIds = new Set([...featuredProducts, ...bestOfferProducts].map((product) => product.id));
  const personalizedRecommendedProducts = products
    .filter((product) => {
      const rank = Number(product.metadata?.personalizedRecommendationRank || 0);
      return product.isEnabled && !isLooseProduct(product) && rank > 0 && !excludedShowcaseIds.has(product.id);
    })
    .sort((a, b) => Number(a.metadata?.personalizedRecommendationRank || 999) - Number(b.metadata?.personalizedRecommendationRank || 999));
  const fallbackRecommendedProducts = products
    .filter((product) => product.isEnabled && !isLooseProduct(product) && !excludedShowcaseIds.has(product.id) && !personalizedRecommendedProducts.some((item) => item.id === product.id));
  const recommendedProducts = [...personalizedRecommendedProducts, ...fallbackRecommendedProducts].slice(0, 6);

  useEffect(() => {
    if (!selectedCategory) {
      setExpandedCategoryId(null);
      return;
    }

    const selected = categories.find((category) => category.id === selectedCategory);
    if (selected?.parentId) {
      setExpandedCategoryId(selected.parentId);
      return;
    }

    const hasSubcategories = categories.some((category) => category.parentId === selectedCategory);
    setExpandedCategoryId(hasSubcategories ? selectedCategory : null);
  }, [categories, selectedCategory]);

  const scrollToProducts = () => {
    window.setTimeout(() => {
      const productsEl = document.getElementById('catalog-products-list-anchor');
      if (productsEl) {
        productsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  const bannerRailRef = useRef<HTMLDivElement | null>(null);
  const bannerCardRefs = useRef<(HTMLElement | null)[]>([]);
  const userTouchedBannerRailRef = useRef(false);
  const bannerScrollFrameRef = useRef<number | null>(null);
  const bannerScrollEndTimerRef = useRef<number | null>(null);

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

  const visibleProducts = filteredProducts;
  const currentPage = Math.max(1, Number(productPage?.page || 1));
  const pageSize = Number(productPage?.pageSize || PRODUCT_PAGE_SIZE);
  const totalProducts = Math.max(0, Number(productPage?.total || filteredProducts.length));
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const pageStart = totalProducts === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const pageEnd = Math.min(totalProducts, currentPage * pageSize);
  const isProductPageLoading = Boolean(productPage?.isLoading);
  const goToProductPage = (page: number) => {
    if (!onChangeProductPage || isProductPageLoading) return;
    const nextPage = Math.min(Math.max(1, page), totalPages);
    onChangeProductPage({ categoryId: selectedCategory, page: nextPage, pageSize }).catch(() => {});
  };

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

  const renderShowcaseSection = (title: string, subtitle: string, items: Product[]) => {
    if (items.length === 0 || selectedCategory) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 text-left">
          <div>
            <h3 className="font-serif text-base font-semibold tracking-tight text-slate-950 dark:text-white md:text-lg">{title}</h3>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {items.length} items
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((prod) => {
            const hasDiscount = prod.offerPrice > 0 && prod.basePrice > prod.offerPrice;
            const itemInCart = cart.find(c => c.productId === prod.id);
            const isWishlisted = activeUser?.wishlist.includes(prod.id);
            return (
              <article
                key={prod.id}
                className={`group overflow-hidden rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}
              >
                <div className="relative aspect-square cursor-pointer bg-white" onClick={() => setSelectedProduct(prod)}>
                  <img
                    src={prod.images?.[0] || productImageFallback}
                    alt={prod.name}
                    className="h-full w-full object-contain p-1.5 transition duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  {hasDiscount && (
                    <span className="absolute left-1 top-1 rounded-full bg-emerald-800 px-2 py-0.5 text-[8px] font-semibold text-white shadow-[0_3px_0_rgba(6,95,70,0.45)]">
                      {Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleWishlist(prod.id);
                    }}
                    className={`absolute right-1 top-1 rounded-full border p-1 shadow-sm ${isWishlisted ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-200 bg-white/90 text-slate-500'}`}
                    aria-label="Toggle wishlist"
                  >
                    <Heart className="h-3 w-3" fill={isWishlisted ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <div className="space-y-1 p-2 text-left">
                  <h4
                    onClick={() => setSelectedProduct(prod)}
                    className="line-clamp-1 cursor-pointer text-[11px] font-semibold leading-tight text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-300"
                  >
                    {prod.name}
                  </h4>
                  <div className="min-h-4">{productQtyBadge(prod)}</div>
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">₹{hasDiscount ? prod.offerPrice : prod.basePrice}</span>
                    {hasDiscount && <span className="text-[9px] font-mono text-slate-400 line-through">₹{prod.basePrice}</span>}
                  </div>
                  {itemInCart ? (
                    <div className="flex items-center justify-between rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                      <button type="button" onClick={() => updateCartQty(prod.id, itemInCart.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-5 text-center text-[10px] font-semibold">{itemInCart.quantity}</span>
                      <button type="button" onClick={() => updateCartQty(prod.id, itemInCart.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={prod.stockCount === 0}
                      onClick={() => addToCart(prod.id, 1)}
                      className="flex w-full items-center justify-center gap-1 rounded-full bg-indigo-700 px-2 py-1.5 text-[10px] font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
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

      {/* Store status and broadcast messages below main categories */}
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

      {activeSectionId && (() => {
        const parentCat = categories.find(c => c.id === activeSectionId);
        const subs = categories.filter(c => c.parentId === activeSectionId);
        if (!parentCat || subs.length === 0) return null;

        return (
          <div id="category-subsections-anchor" className={`-mx-4 border-b px-4 py-3 sm:-mx-6 sm:px-6 ${isDarkMode ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:flex sm:gap-4 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(parentCat.id);
                  setExpandedCategoryId(parentCat.id);
                  scrollToProducts();
                }}
                className={`group relative flex min-w-0 flex-col items-center justify-start gap-1 text-center text-[8px] font-semibold transition sm:min-w-[68px] ${selectedCategory === parentCat.id ? 'text-indigo-700 dark:text-indigo-300' : isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition group-hover:-translate-y-0.5 sm:h-12 sm:w-12 ${selectedCategory === parentCat.id ? 'bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-300' : isDarkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                  <Compass className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 max-w-[68px] leading-tight">View All</span>
                {selectedCategory === parentCat.id && <span className="absolute -bottom-1 h-0.5 w-8 rounded-full bg-indigo-600" />}
              </button>

              {subs.map((sub) => {
                const isSubSelected = selectedCategory === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(sub.id);
                      setExpandedCategoryId(parentCat.id);
                      scrollToProducts();
                    }}
                    className={`group relative flex min-w-0 flex-col items-center justify-start gap-1 text-center text-[8px] font-semibold transition sm:min-w-[76px] ${isSubSelected ? 'text-indigo-700 dark:text-indigo-300' : isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[8px] font-semibold uppercase shadow-sm transition group-hover:-translate-y-0.5 sm:h-12 sm:w-12 ${isSubSelected ? 'bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-300' : isDarkMode ? 'bg-slate-900 text-indigo-300' : 'bg-slate-50 text-indigo-700'}`}>
                      {sub.name.substring(0, 2)}
                      {sub.imageUrl && (
                        <img
                          src={sub.imageUrl}
                          alt={sub.name}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 max-w-[72px] leading-tight">{sub.name}</span>
                    {isSubSelected && <span className="absolute -bottom-1 h-0.5 w-8 rounded-full bg-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

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

      {/* Daily Quick-Pick */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3 text-left">
          <div>
            <h3 className="font-serif text-base md:text-lg font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">Daily Quick-Pick</h3>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline-flex">
            Quick add
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {products.filter(p => p.isDailyEssential && p.isEnabled).slice(0, 6).map((prod) => {
            const hasDiscount = prod.offerPrice > 0;
            const itemInCart = cart.find(c => c.productId === prod.id);
            const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
            const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
            return (
              <div
                key={prod.id}
                onClick={() => setSelectedProduct(prod)}
                className={`group relative flex h-44 cursor-pointer flex-col overflow-hidden rounded-xl border p-1.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                  isDarkMode
                    ? 'border-emerald-900/60 bg-slate-950 hover:border-emerald-700'
                    : 'border-emerald-100 bg-white hover:border-emerald-300'
                }`}
              >
                <div className="relative h-20 shrink-0 overflow-hidden rounded-lg border border-emerald-100/70 bg-white shadow-inner dark:border-emerald-950 dark:bg-slate-900">
                  <img
                    src={prod.images?.[0] || productImageFallback}
                    alt={prod.name}
                    className="h-full w-full object-contain p-1 transition-transform duration-350 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  {hasDiscount && (
                    <span className="absolute left-1 top-1 rounded-full bg-emerald-800 px-1.5 py-0.5 text-[7px] font-semibold text-white shadow-[0_3px_0_rgba(6,95,70,0.45)]">
                      {Math.round(100 - (prod.offerPrice / prod.basePrice) * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-1.5 min-w-0 space-y-0.5 pr-7 text-left">
                  <h4 className="line-clamp-1 text-[10px] font-semibold leading-tight text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-300">
                    {prod.name}
                  </h4>
                  <div className="min-h-4 scale-[0.88] origin-left">
                    {productQtyBadge(prod)}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                      ₹{hasDiscount ? prod.offerPrice : prod.basePrice}
                    </span>
                    {hasDiscount && (
                      <span className="text-slate-400 dark:text-slate-500 line-through text-[8px] font-mono">
                        ₹{prod.basePrice}
                      </span>
                    )}
                  </div>
                  {isLowStock && (
                    <span className="flex items-center gap-1 text-[8px] font-semibold text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="h-2.5 w-2.5" /> Only {prod.stockCount} left
                    </span>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()} className="absolute bottom-1.5 right-1.5 flex shrink-0 flex-col gap-1">
                  {itemInCart ? (
                    <div className="flex items-center gap-0.5 rounded-full bg-emerald-600 p-0.5 text-white shadow">
                      <button
                        onClick={() => updateCartQty(prod.id, itemInCart.quantity - (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))}
                        className="p-0.5 hover:bg-emerald-500 rounded-full"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-5 text-center text-[8px] font-semibold font-mono">{cartQuantityLabel(prod, itemInCart.quantity)}</span>
                      <button
                        onClick={() => updateCartQty(prod.id, itemInCart.quantity + (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))}
                        className="p-0.5 hover:bg-emerald-500 rounded-full"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={prod.stockCount === 0}
                      onClick={() => addToCart(prod.id, isLooseProduct(prod) ? selectedLooseQty(prod) : 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
                      title="Quick Add to Bag"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

      {renderShowcaseSection('Featured Today', 'Owner-picked products to highlight right now.', featuredProducts)}
      {renderShowcaseSection('Best Offers', 'Discounted products customers should not miss.', bestOfferProducts)}
      {renderShowcaseSection('Recommended for You', 'Useful picks based on available storefront products.', recommendedProducts)}

      {/* Main Products Grid */}
      <div id="catalog-products-list-anchor" className="scroll-mt-24">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg md:text-xl font-semibold tracking-tight text-left">
            {selectedCategory ? `${categories.find(c => c.id === selectedCategory)?.name}` : 'Products Catalog'}
          </h3>
          <span className="text-xs opacity-75 font-mono">
            {totalProducts > 0 ? `Page ${currentPage} of ${totalPages} - ${pageStart}-${pageEnd} of ${totalProducts}` : 'No products'}
          </span>
        </div>

        {filteredProducts.length === 0 && isProductPageLoading ? (
          <div className={`p-10 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
            <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 text-xs font-normal lowercase text-indigo-700 shadow-sm dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-300">
              <span className="relative h-7 w-7">
                <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.70)]" />
                <span className="absolute inset-0 animate-spin rounded-full">
                  <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.80)]" />
                </span>
              </span>
              loading..
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
            <Compass className="h-12 w-12 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold opacity-75">No matching premium items found</p>
            <p className="text-xs opacity-60 mt-1">Try resetting the selected criteria or changing your search terms.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {visibleProducts.map((prod) => {
                const hasDiscount = prod.offerPrice > 0;
                const itemInCart = cart.find(c => c.productId === prod.id);
                const lowStockThreshold = prod.lowStockAlertThreshold ?? 10;
                const isLowStock = prod.stockCount > 0 && prod.stockCount <= lowStockThreshold;
                const isWishlisted = activeUser?.wishlist.includes(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`w-full rounded-lg border overflow-hidden shadow-xs flex flex-col justify-between group transition-all duration-300 transform hover:-translate-y-0.5 ${
                      isDarkMode
                        ? 'border-slate-700 bg-slate-900/95 shadow-[0_12px_28px_rgba(0,0,0,0.30)]'
                        : 'border-slate-200 bg-white hover:shadow-md'
                    }`}
                  >
                    {/* Top Banner aspect */}
                    <div className={`relative aspect-square overflow-hidden cursor-pointer animate-fadeIn ${isDarkMode ? 'bg-white' : 'bg-slate-50'}`} onClick={() => setSelectedProduct(prod)}>
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
                    {/* Text and details */}
                    <div className="p-1.5 sm:p-2 flex-1 flex flex-col justify-between gap-1 text-left">
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="max-w-[70%] truncate font-mono text-[8px] font-semibold uppercase text-slate-500 dark:text-slate-400 sm:text-[9px]">
                            {categories.find(c => c.id === prod.categoryId)?.name || 'Grocery'}
                          </span>
                          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                            <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                            <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-200 sm:text-[10px]">{prod.ratingAverage || 'New'}</span>
                          </div>
                        </div>
                        <h4
                          onClick={() => setSelectedProduct(prod)}
                          className="cursor-pointer text-left text-[11px] font-semibold leading-snug tracking-tight text-slate-950 line-clamp-1 hover:text-indigo-500 dark:text-slate-100 dark:hover:text-indigo-300 sm:text-xs"
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
                              ₹{hasDiscount ? prod.offerPrice : prod.basePrice}
                            </span>
                            {hasDiscount && (
                              <span className="text-slate-400 line-through text-[9px] sm:text-[10px] font-mono">₹{prod.basePrice}</span>
                            )}
                          </div>
                          {productQtyBadge(prod)}
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
                                onClick={() => updateCartQty(prod.id, itemInCart.quantity - (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))}
                                className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-10 px-1 text-center text-[10px] sm:text-xs font-semibold font-mono">{cartQuantityLabel(prod, itemInCart.quantity)}</span>
                              <button
                                onClick={() => updateCartQty(prod.id, itemInCart.quantity + (isLooseProduct(prod) ? looseQuantityOptions(prod)[0]?.value || 1 : 1))}
                                className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full"
                              >
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
            <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm sm:flex-row dark:border-slate-800 dark:bg-slate-950">
              <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
                {totalProducts > 0 ? `Page ${currentPage} of ${totalPages}` : 'No product pages'}
              </span>
              {isProductPageLoading ? (
                <div className="flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 text-xs font-normal lowercase text-indigo-700 shadow-sm dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-300">
                  <span className="relative h-7 w-7">
                    <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.70)]" />
                    <span className="absolute inset-0 animate-spin rounded-full">
                      <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.80)]" />
                    </span>
                  </span>
                  loading..
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToProductPage(currentPage - 1)}
                    disabled={currentPage <= 1 || !onChangeProductPage}
                    className="rounded-full border border-slate-200 px-4 py-2 font-black uppercase text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300"
                  >
                    Previous
                  </button>
                  <span className="rounded-full bg-indigo-50 px-3 py-2 font-black text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToProductPage(currentPage + 1)}
                    disabled={currentPage >= totalPages || !onChangeProductPage}
                    className="rounded-full border border-slate-200 px-4 py-2 font-black uppercase text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

