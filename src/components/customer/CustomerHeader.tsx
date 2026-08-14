import React, { useEffect, useRef, useState } from 'react';
import {
  Store, Heart, ShoppingBag, FileText, User, Calendar, Search, X, Clock, LayoutGrid,
  Bell, Megaphone, Tag, CalendarClock, CheckCheck
} from 'lucide-react';
import { Category, CustomerTab, Notification, Product, ShopProfile, User as UserType } from '../../types';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=120';
const svayiroWordmarkStyle = {
  fontFamily: '"Tw Cen MT", "Tw Cen MT Condensed", "Century Gothic", Arial, sans-serif',
  fontWeight: 900,
  letterSpacing: '-0.035em'
} as const;

function SvayiroWordmark({ name, className = '' }: { name: string; className?: string }) {
  const displayName = String(name || 'SVAYIRO').trim().toUpperCase();
  if (displayName === 'SVAYIRO') {
    return (
      <span className={className} style={svayiroWordmarkStyle}>
        <span style={{ color: '#000d86', WebkitTextStroke: '0.5px #0c0059' }}>SVAYIR</span>
        <span style={{ color: '#F3D300', WebkitTextStroke: '1px #C7AA00' }}>O</span>
      </span>
    );
  }
  return (
    <span className={className} style={svayiroWordmarkStyle}>
      {displayName}
    </span>
  );
}

interface CustomerHeaderProps {
  shop: ShopProfile;
  activeUser: UserType | null;
  cartCount: number;
  wishlistCount: number;
  activeTab: CustomerTab;
  setActiveTab: (tab: CustomerTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchLoading?: boolean;
  searchDelayEnabled?: boolean;
  searchSuggestions?: Product[];
  searchPlaceholderItems?: string[];
  categories?: Category[];
  selectedCategory?: string | null;
  setSelectedCategory?: (catId: string | null) => void;
  onSelectSuggestion?: (product: Product) => void;
  searchHistory?: string[];
  onSubmitSearch?: (term: string) => void;
  onClearSearch?: () => void;
  onRemoveHistory?: (term: string) => void;
  notifications?: Notification[];
  readNotificationIds?: string[];
  onMarkNotificationsRead?: (ids: string[]) => void;
  hideCategoryRail?: boolean;
  isDarkMode: boolean;
  setIsAuthOpen: (open: boolean) => void;
  setIsRequestOpen: (open: boolean) => void;
}

export default function CustomerHeader({
  shop,
  activeUser,
  cartCount,
  wishlistCount,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  isSearchLoading = false,
  searchDelayEnabled = true,
  searchSuggestions = [],
  searchPlaceholderItems = [],
  categories = [],
  selectedCategory = null,
  setSelectedCategory,
  onSelectSuggestion,
  searchHistory = [],
  onSubmitSearch,
  onClearSearch,
  onRemoveHistory,
  notifications = [],
  readNotificationIds = [],
  onMarkNotificationsRead,
  hideCategoryRail = false,
  isDarkMode,
  setIsAuthOpen,
  setIsRequestOpen
}: CustomerHeaderProps) {
  const isStoreOpen = shop.isOpen !== false;
  const status = shop.isOpen === false
    ? { label: 'Store Closed', dotClass: 'bg-rose-500', pulse: false }
    : shop.isHolidayMode
      ? { label: 'Holiday Advisory', dotClass: 'bg-amber-500', pulse: false }
      : { label: 'Operational', dotClass: 'bg-emerald-500', pulse: true };
  const logoStatusClass = isStoreOpen
    ? 'border-emerald-500 ring-2 ring-emerald-500/25'
    : 'border-rose-500 ring-2 ring-rose-500/25';
  const logoDotClass = isStoreOpen ? 'bg-emerald-500' : 'bg-rose-500';
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isCategoryRailCompact, setIsCategoryRailCompact] = useState(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);
  const defaultSearchPlaceholders = [
    'Search staples, high-quality groceries, organic pulses...',
    'Search atta, rice, dal, millets...',
    'Search fresh vegetables, fruits, dairy...'
  ];
  const rotatingSearchPlaceholders = searchPlaceholderItems.length > 0
    ? searchPlaceholderItems.map((item) => `Search "${item}"`)
    : defaultSearchPlaceholders;
  const activeSearchPlaceholder = rotatingSearchPlaceholders[placeholderIndex % rotatingSearchPlaceholders.length] || defaultSearchPlaceholders[0];
  const showSuggestions = isSearchFocused && searchQuery.trim().length >= 2 && searchSuggestions.length > 0;
  const showHistory = isSearchFocused && searchQuery.trim().length === 0 && searchHistory.length > 0;
  const customerNotifications = notifications.filter((notification) => (notification.audience || 'customer') === 'customer' && notification.type !== 'order');
  const unreadNotifications = customerNotifications.filter((notification) => !readNotificationIds.includes(notification.id));
  const unreadCount = unreadNotifications.length;
  const topLevelCategories = categories.filter((category) => !category.parentId);
  const selectedCategoryDetails = selectedCategory ? categories.find((category) => category.id === selectedCategory) : null;
  const selectedParentCategory = selectedCategoryDetails?.parentId
    ? categories.find((category) => category.id === selectedCategoryDetails.parentId) || null
    : selectedCategoryDetails;
  const showCategoryRail = !hideCategoryRail && (activeTab === 'home' || activeTab === 'search') && topLevelCategories.length > 0;

  const notificationMeta: Record<Exclude<Notification['type'], 'order'>, { label: string; icon: React.ElementType; badgeClass: string; iconClass: string }> = {
    offer: {
      label: 'Offer',
      icon: Tag,
      badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    },
    holiday: {
      label: 'Holiday',
      icon: CalendarClock,
      badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    },
    announcement: {
      label: 'Notice',
      icon: Megaphone,
      badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      iconClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
    }
  };

  const submitSearch = () => {
    const term = searchQuery.trim();
    if (!term) return;
    onSubmitSearch?.(term);
    setIsSearchFocused(false);
  };

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!notificationWrapRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isNotificationsOpen]);

  useEffect(() => {
    setPlaceholderIndex(0);
  }, [rotatingSearchPlaceholders.join('|')]);

  useEffect(() => {
    if (rotatingSearchPlaceholders.length <= 1) return;
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % rotatingSearchPlaceholders.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [rotatingSearchPlaceholders.length]);

  useEffect(() => {
    const handleScroll = () => {
      setIsCategoryRailCompact(window.scrollY > 80);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleNotifications = () => {
    setIsNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && customerNotifications.length > 0) {
        onMarkNotificationsRead?.(customerNotifications.map((notification) => notification.id));
      }
      return nextOpen;
    });
  };

  const selectHeaderCategory = (categoryId: string | null) => {
    setSelectedCategory?.(categoryId);
    if (activeTab !== 'home') {
      setActiveTab('home');
    }
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 40);
  };

  const renderCategoryRail = () => {
    if (!showCategoryRail) return null;

    return (
      <div className={`-mx-4 border-t px-4 transition-all ${isCategoryRailCompact ? 'pt-0.5' : 'pt-1'} ${isDarkMode ? 'border-slate-800' : 'border-slate-200/80'}`}>
        <div className={`flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isCategoryRailCompact ? 'gap-1.5 pb-0' : 'gap-2 pb-0'}`}>
          <button
            type="button"
            onClick={() => selectHeaderCategory(null)}
            className={`group relative flex shrink-0 items-center text-center transition-all ${isCategoryRailCompact ? 'min-w-fit pb-0.5' : 'w-[54px] flex-col gap-0.5 pb-0.5'}`}
            aria-label="Show all products"
          >
            {!isCategoryRailCompact && (
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm transition ${
                !selectedCategory
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : isDarkMode
                    ? 'border-slate-800 bg-slate-900 text-slate-300'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <Store className="h-4 w-4" />
              </span>
            )}
            <span className={`block max-w-full truncate rounded-full px-1 py-0.5 text-[9px] font-semibold leading-tight ${
              !selectedCategory ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'
            }`}>
              All
            </span>
            {!selectedCategory && <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-indigo-600" />}
          </button>

          {topLevelCategories.map((category) => {
            const isSelected = selectedCategory === category.id || selectedParentCategory?.id === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectHeaderCategory(category.id)}
            className={`group relative flex shrink-0 items-center text-center transition-all ${isCategoryRailCompact ? 'min-w-fit pb-0.5' : 'w-[60px] flex-col gap-0.5 pb-0.5'}`}
                title={category.name}
              >
                {!isCategoryRailCompact && (
                  <span className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border bg-white text-[8px] font-semibold uppercase text-indigo-700 shadow-sm transition group-hover:-translate-y-0.5 dark:bg-slate-900 dark:text-indigo-300 ${
                    isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-200 group-hover:border-indigo-300 dark:border-slate-800'
                  }`}>
                    {category.name.substring(0, 2)}
                    {category.imageUrl && (
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
                )}
                <span className={`block max-w-full truncate rounded-full px-1 py-0.5 text-[9px] font-semibold leading-tight ${
                  isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'
                }`}>
                  {category.name}
                </span>
                {isSelected && <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-indigo-600" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderNotificationCenter = () => (
    <div className={`fixed left-3 right-3 top-[58px] z-[80] overflow-hidden rounded-2xl border shadow-2xl md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[22rem] ${
      isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
    }`}>
      <div className={`flex items-center justify-between border-b px-4 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        <div>
          <h2 className="text-sm font-semibold">Notifications</h2>
          <p className="text-[10px] font-semibold text-slate-500">Offers, holidays, and shop notices</p>
        </div>
        <button
          type="button"
          onClick={() => onMarkNotificationsRead?.(customerNotifications.map((notification) => notification.id))}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Read
        </button>
      </div>

      {customerNotifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold">No customer alerts right now.</p>
          <p className="mt-1 text-xs text-slate-500">New shop notices will appear here.</p>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto p-2 md:max-h-96">
          {customerNotifications.map((notification) => {
            const isUnread = !readNotificationIds.includes(notification.id);
            const meta = notificationMeta[notification.type === 'order' ? 'announcement' : notification.type] || notificationMeta.announcement;
            const Icon = meta.icon;
            return (
              <article
                key={notification.id}
                className={`rounded-xl p-3 transition ${
                  isUnread
                    ? isDarkMode ? 'bg-indigo-950/40' : 'bg-indigo-50'
                    : isDarkMode ? 'hover:bg-slate-900' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.iconClass}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
                    </div>
                    <h3 className="line-clamp-1 text-xs font-semibold">{notification.title}</h3>
                    <p className="mt-1 line-clamp-3 text-[11px] font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                      {notification.createdAt || notification.date || ''}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderHistory = (mode: 'desktop' | 'mobile') => (
    <div className={`absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border shadow-xl z-50 ${
      isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
    }`}>
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent searches</div>
      <div className="max-h-64 overflow-y-auto py-1">
        {searchHistory.map((term) => (
          <button
            key={`${mode}-history-${term}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setSearchQuery(term);
              onSubmitSearch?.(term);
              setIsSearchFocused(false);
            }}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
              isDarkMode ? 'hover:bg-slate-900' : 'hover:bg-slate-50'
            }`}
          >
            <Clock className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{term}</span>
            <span
              role="button"
              tabIndex={0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveHistory?.(term);
              }}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
              aria-label={`Remove ${term} from search history`}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderSuggestions = (mode: 'desktop' | 'mobile') => (
    <div className={`absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border shadow-xl z-50 ${
      isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
    }`}>
      <div className="max-h-80 overflow-y-auto py-1">
        {searchSuggestions.map((product) => {
          const price = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
          return (
            <button
              key={`${mode}-${product.id}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelectSuggestion?.(product);
                setIsSearchFocused(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                isDarkMode ? 'hover:bg-slate-900' : 'hover:bg-slate-50'
              }`}
            >
              <img
                src={product.images?.[0] || productImageFallback}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                onError={(e) => {
                  e.currentTarget.src = productImageFallback;
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{product.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {product.description || product.sku || 'Related item'}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Rs {price}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Primary header */}
      <header className={`fixed inset-x-0 top-0 z-50 border-b ${isDarkMode ? 'border-[#1e293b] bg-[#0f172a]/95 shadow-[0_12px_35px_rgba(0,0,0,0.35)]' : 'border-slate-200 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.10)]'} transition-all backdrop-blur-xl`}>
        <div className="w-full px-4 py-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-4">
            
            {/* Logo & Info */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0" title={isStoreOpen ? 'Store open' : 'Store closed'}>
                {shop.logoUrl ? (
                  <img
                    src={shop.logoUrl}
                    alt="Logo"
                    className={`w-10 h-10 rounded-full object-cover border-2 shadow ${logoStatusClass}`}
                  />
                ) : (
                  <div className={`flex w-10 h-10 items-center justify-center rounded-full border-2 bg-indigo-50 text-sm font-semibold text-indigo-700 shadow dark:bg-indigo-950 dark:text-indigo-200 ${logoStatusClass}`}>
                    {(shop.name || 'S').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 ${isDarkMode ? 'border-[#0f172a]' : 'border-[#fefff3]'} ${logoDotClass}`} />
              </div>
              <div>
                <h1 className="leading-none">
                  <SvayiroWordmark name={shop.name} className="text-2xl uppercase" />
                </h1>
                <p className="hidden text-xs font-mono italic text-slate-500 dark:text-slate-300 sm:block">{shop.tagline}</p>
              </div>
            </div>

            {/* Search bar (Desktop View) */}
            <div className="flex-1 max-w-md relative hidden md:block">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input 
                id="customer_desktop_search"
                name="customer_desktop_search"
                type="text" 
                placeholder={activeSearchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch();
                }}
                className={`h-12 w-full rounded-2xl border pl-12 pr-24 text-sm font-semibold shadow-[0_10px_28px_rgba(15,23,42,0.08)] outline-none transition-all placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-500/10 ${isDarkMode ? 'border-[#334155] bg-[#1e293b] focus:border-indigo-500 text-white' : 'border-slate-200 bg-white focus:border-indigo-500 focus:bg-white focus:shadow-md'}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    onClearSearch?.();
                  }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={submitSearch}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {isSearchLoading && <span className="absolute -bottom-5 left-3 text-[10px] font-semibold text-slate-400">Searching...</span>}
              {showSuggestions && renderSuggestions('desktop')}
              {showHistory && renderHistory('desktop')}
            </div>

            {/* Action pills */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative" ref={notificationWrapRef}>
                <button
                  type="button"
                  onClick={toggleNotifications}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-slate-600 shadow-sm transition ${
                    isDarkMode ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200' : 'border-slate-200 bg-white hover:bg-slate-50 shadow-[0_8px_20px_rgba(15,23,42,0.08)]'
                  }`}
                  aria-label="Customer notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-semibold text-white ring-2 ring-white dark:ring-slate-950">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {isNotificationsOpen && renderNotificationCenter()}
              </div>

              {activeUser ? (
                <button 
                  onClick={() => setActiveTab('wishlist')}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                  aria-label="Open wishlist"
                  title="Wishlist"
                >
                  <Heart className="h-4 w-4" />
                  {wishlistCount > 0 && (
                    <span className="absolute bottom-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[8px] font-semibold leading-none text-white ring-2 ring-white dark:ring-slate-950">
                      {wishlistCount > 9 ? '9+' : wishlistCount}
                    </span>
                  )}
                </button>
              ) : (
                <button 
                  onClick={() => setIsAuthOpen(true)}
                  className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-semibold hover:bg-indigo-500 shadow flex items-center gap-1.5 sm:gap-2"
                >
                  <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>Sign In</span>
                </button>
              )}

              {/* Direct Future product booking activator */}
              <button 
                onClick={() => setIsRequestOpen(true)}
                className="bg-indigo-600 hover:bg-violet-600 text-white px-3 sm:px-3.5 py-2 rounded-full text-[10px] sm:text-xs font-semibold shadow flex items-center gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Search Bar */}
          {(activeTab === 'home' || activeTab === 'search') && (
            <div className="relative md:hidden pb-1 w-full animate-fade-in">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input 
                id="customer_mobile_search"
                name="customer_mobile_search"
                type="text" 
                placeholder={activeSearchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch();
                }}
                className={`h-11 w-full rounded-2xl border pl-11 pr-24 text-sm font-semibold shadow-[0_8px_22px_rgba(15,23,42,0.08)] outline-none transition-all placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-500/10 ${isDarkMode ? 'border-[#334155] bg-[#1a2230] focus:border-indigo-500 text-white' : 'border-slate-200 bg-white focus:border-indigo-400 focus:bg-white focus:shadow-md'}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    onClearSearch?.();
                  }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={submitSearch} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm dark:bg-indigo-600" aria-label="Search">
                <Search className="h-4 w-4" />
              </button>
              {isSearchLoading && <span className="absolute -bottom-4 left-3 text-[9px] font-semibold text-slate-400">Searching...</span>}
              {showSuggestions && renderSuggestions('mobile')}
              {showHistory && renderHistory('mobile')}
            </div>
          )}

          {/* Desktop Navigation Tabs (Horizontal Menu) */}
          <div className="hidden md:flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/80 pt-2.5 mt-1">
            <div className="flex items-center gap-1">
              {[
                { id: 'home', label: 'Storefront', icon: Store },
                { id: 'categories', label: 'Categories', icon: LayoutGrid },
                { id: 'cart', label: 'Shopping Bag', icon: ShoppingBag, count: cartCount, pulse: cartCount > 0 },
                { id: 'orders', label: 'Order History', icon: FileText },
                { id: 'profile', label: 'Customer Profile', icon: User }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                    {tab.count && tab.count > 0 ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab.pulse ? 'bg-indigo-600 text-white animate-pulse' : 'bg-rose-600 text-white'}`}>
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 text-[11px] font-mono opacity-80">
              <span className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass} ${status.pulse ? 'animate-ping' : ''}`}></span>
                <span>{status.label}</span>
              </span>
              {activeUser && (
                <span className="hidden lg:inline text-slate-400">Synced: {activeUser.phone}</span>
              )}
            </div>
          </div>

          {renderCategoryRail()}

        </div>
      </header>
    </>
  );
}
