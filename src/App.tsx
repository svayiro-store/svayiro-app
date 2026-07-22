/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { api } from './api';
import { ShopProfile, Category, Product, Banner, Notification, User } from './types';
import { ShoppingBag, Settings, RefreshCw, AlertCircle, CheckCircle, AlertTriangle, XCircle, Info, X, Eye, EyeOff } from 'lucide-react';
import PublicPrintBill from './components/PublicPrintBill';

const CustomerApp = lazy(() => import('./components/customer/CustomerApp'));
const AdminApp = lazy(() => import('./components/admin'));

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export default function App() {
  // Global Profile View Mode: 'customer' | 'admin'
  const [currentMode, setCurrentMode] = useState<'customer' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'admin') {
        localStorage.setItem('svayiro_app_mode', 'admin');
        return 'admin';
      }
      const savedMode = localStorage.getItem('svayiro_app_mode');
      if (savedMode === 'admin') {
        return 'admin';
      }
    }
    return 'customer';
  });

export default function App() {
  // 🟢 PUBLIC INVOICE LINK ROUTE (Accessible by anyone without login)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/invoice/')) {
    return <PublicPrintBill websiteUrl="https://svayiro.co.in" />;
  }
  
  // Toast notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => {
      const withoutDuplicate = prev.filter(t => !(t.message === message && t.type === type));
      return [...withoutDuplicate, { id, message, type }].slice(-3);
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };
  
  // Theme settings state (applied to device current mode)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  // Loaded Central Resources
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Background seen log for live order notification triggers
  const seenNotifIdsRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [startupSplashDone, setStartupSplashDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminOtp, setAdminOtp] = useState('');
  const [adminOtpSent, setAdminOtpSent] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminOtpExpiresAt, setAdminOtpExpiresAt] = useState<number | null>(null);
  const [adminOtpResendAt, setAdminOtpResendAt] = useState<number | null>(null);
  const [adminOtpSecondsLeft, setAdminOtpSecondsLeft] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const ensureFieldIdentifiers = () => {
      const controls = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
      controls.forEach((control, index) => {
        if (control.id || control.name) return;
        const source =
          control.getAttribute('aria-label') ||
          control.getAttribute('placeholder') ||
          control.getAttribute('type') ||
          control.tagName.toLowerCase();
        const slug = source
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 48);
        const identifier = `svayiro_${slug || 'field'}_${index + 1}`;
        control.id = identifier;
        control.name = identifier;
      });
    };

    ensureFieldIdentifiers();
    const observer = new MutationObserver(ensureFieldIdentifiers);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const formatDobForDisplay = (value?: string) => {
    const raw = String(value || '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    return /^\d{2}-\d{2}-\d{4}$/.test(raw) ? raw : '';
  };

  const normalizeUser = (user: any): User => ({
    ...user,
    phone: user?.phone || '',
    staffLoginId: user?.staffLoginId || user?.staff_login_id || user?.metadata?.staffLoginId || '',
    dateOfBirth: formatDobForDisplay(user?.dateOfBirth || user?.date_of_birth),
    savedAddresses: Array.isArray(user?.savedAddresses)
      ? user.savedAddresses
      : Array.isArray(user?.saved_addresses)
        ? user.saved_addresses
        : [],
    savedForLater: Array.isArray(user?.savedForLater)
      ? user.savedForLater
      : Array.isArray(user?.saved_for_later)
        ? user.saved_for_later
        : [],
    wishlist: Array.isArray(user?.wishlist) ? user.wishlist : [],
    roles: Array.isArray(user?.roles) ? user.roles : []
  });

  const normalizeCategory = (category: any): Category => ({
    ...category,
    imageUrl: category?.imageUrl || category?.image_url || '',
    isEnabled: category?.isEnabled !== undefined ? Boolean(category.isEnabled) : category?.is_enabled !== undefined ? Boolean(category.is_enabled) : true,
    order: Number(category?.order ?? category?.position ?? 0)
  });

  const normalizeBoolean = (value: any, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof value === 'number') return value === 1;
    return fallback;
  };

  const normalizeShop = (profile: any): ShopProfile => ({
    ...profile,
    logoUrl: profile?.logoUrl || profile?.logo_url || '',
    bannerUrl: profile?.bannerUrl || profile?.banner_url || '',
    name: profile?.name || 'SVAYIRO',
    description: profile?.description || '',
    tagline: profile?.tagline || '',
    contactNumber: profile?.contactNumber || profile?.phone || '',
    whatsAppNumber: profile?.whatsAppNumber || profile?.whatsapp || '',
    personalPhoneNumber: profile?.personalPhoneNumber || profile?.personal_phone || '',
    supportPhoneNumber: profile?.supportPhoneNumber || profile?.support_phone || '',
    email: profile?.email || '',
    address: typeof profile?.address === 'string' ? profile.address : profile?.address?.physicalAddress || '',
    googleMapsLink: profile?.googleMapsLink || profile?.google_maps_link || '',
    deliveryRadius: Number(profile?.deliveryRadius ?? profile?.delivery_radius_km ?? 10),
    freeDeliveryRadiusKm: Number(profile?.freeDeliveryRadiusKm ?? profile?.free_delivery_radius_km ?? 0),
    baseDeliveryCharge: Number(profile?.baseDeliveryCharge ?? profile?.base_delivery_charge ?? 30),
    deliveryChargePerKm: Number(profile?.deliveryChargePerKm ?? profile?.delivery_charge_per_km ?? 12),
    workingHours: profile?.workingHours || profile?.operational_timings || '07:00 AM - 09:00 PM',
    holidayTimings: profile?.holidayTimings || profile?.holiday_timings || '',
    socialFacebook: profile?.socialFacebook || '',
    socialInstagram: profile?.socialInstagram || '',
    socialTwitter: profile?.socialTwitter || '',
    socialLinks: Array.isArray(profile?.socialLinks)
      ? profile.socialLinks
      : Array.isArray(profile?.social_links)
        ? profile.social_links
        : [],
    isOpen: normalizeBoolean(profile?.isOpen ?? profile?.is_open, true),
    isHolidayMode: normalizeBoolean(profile?.isHolidayMode ?? profile?.holiday_mode, false),
    announcement: profile?.announcement || '',
    holidayMessage: profile?.holidayMessage || profile?.holiday_message || '',
    upiId: profile?.upiId || profile?.upi_id || '',
    paymentQrCodeUrl: profile?.paymentQrCodeUrl || profile?.payment_qr_code_url || '',
    deliverySlots: Array.isArray(profile?.deliverySlots) ? profile.deliverySlots : Array.isArray(profile?.delivery_slots) ? profile.delivery_slots : [],
    addresses: Array.isArray(profile?.addresses) ? profile.addresses : []
  });

  const normalizeProduct = (product: any): Product => {
    const rawImages = Array.isArray(product?.images) ? product.images : [];
    const images = rawImages
      .map((image: any) => typeof image === 'string' ? image : image?.url)
      .filter((url: any) => typeof url === 'string' && url.trim());
    const metadata = product?.metadata || {};

    return {
      ...product,
      categoryId: product?.categoryId || product?.category_id || '',
      basePrice: Number(product?.basePrice ?? product?.base_price ?? 0),
      offerPrice: Number(product?.offerPrice ?? product?.offer_price ?? 0),
      stockCount: Number(product?.stockCount ?? product?.stock_count ?? 0),
      weight: Number(product?.weight ?? product?.weight_grams ?? 0),
      isEnabled: product?.isEnabled !== undefined ? Boolean(product.isEnabled) : product?.is_enabled !== undefined ? Boolean(product.is_enabled) : true,
      lowStockAlertThreshold: Number(product?.lowStockAlertThreshold ?? product?.low_stock_threshold ?? 5),
      isDailyEssential: Boolean(product?.isDailyEssential ?? metadata.isDailyEssential ?? false),
      isFeatured: Boolean(product?.isFeatured ?? metadata.isFeatured ?? false),
      ratingAverage: Number(product?.ratingAverage ?? metadata.rating_average ?? metadata.ratingAverage ?? 0),
      ratingCount: Number(product?.ratingCount ?? metadata.rating_count ?? metadata.ratingCount ?? 0),
      images
    };
  };

  const normalizeBanner = (banner: any): Banner => {
    const linkId = banner?.linkId || banner?.link_id || banner?.link || '';
    return {
      ...banner,
      imageUrl: banner?.imageUrl || banner?.image_url || '',
      linkType: banner?.linkType || banner?.link_type || (/^https?:\/\//i.test(String(linkId)) ? 'url' : (linkId ? 'category' : 'none')),
      linkId,
      position: Number(banner?.position ?? 0),
      isEnabled: banner?.isEnabled !== undefined ? Boolean(banner.isEnabled) : banner?.is_enabled !== undefined ? Boolean(banner.is_enabled) : true,
      createdAt: banner?.createdAt || banner?.created_at
    };
  };

  const isAdminOwnerUser = (user: User | null) => Array.isArray(user?.roles) && user.roles.includes('admin');
  const isWorkerStaffUser = (user: User | null) => Array.isArray(user?.roles) && user.roles.some((role) => ['inventory_manager', 'delivery_partner', 'customer_care'].includes(role));
  const isConsoleUser = (user: User | null) => isAdminOwnerUser(user) || isWorkerStaffUser(user);
  const isCustomerOnlyUser = (user: User | null) => Boolean(user && Array.isArray(user.roles) && user.roles.includes('customer') && !isConsoleUser(user));

  useEffect(() => {
    if (!adminOtpSent || !adminOtpExpiresAt) return;

    const updateAdminOtpTimer = () => {
      const secondsLeft = Math.max(0, Math.ceil((adminOtpExpiresAt - Date.now()) / 1000));
      setAdminOtpSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        setAdminOtpSent(false);
        setAdminOtp('');
        setAdminOtpExpiresAt(null);
        setAdminOtpResendAt(null);
        setAdminMessage('OTP expired. Please request a new code.');
      }
    };

    updateAdminOtpTimer();
    const intervalId = window.setInterval(updateAdminOtpTimer, 1000);
    return () => window.clearInterval(intervalId);
  }, [adminOtpSent, adminOtpExpiresAt]);

  // Fetch central database logs
  const loadCentralResources = async (modeOverride?: 'customer' | 'admin') => {
    try {
      setErrorMessage('');
      const resourceMode = modeOverride || currentMode;
      const [shopRes, categoriesRes, productsRes, bannersRes, notificationsRes] = await Promise.all([
        api.getShopProfile(),
        api.getCategories(),
        resourceMode === 'admin' ? api.getProducts() : api.getProducts({ limit: 10, offset: 0 }),
        api.getBanners(),
        api.getNotifications()
      ]);
      
      setShop(normalizeShop(shopRes));
      setCategories(categoriesRes.map(normalizeCategory));
      setProducts(productsRes.map(normalizeProduct));
      setBanners(bannersRes.map(normalizeBanner));
      setNotifications(notificationsRes);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error communicating with SVAYIRO backend database services.');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCustomerProducts = async (params: { categoryId?: string | null; limit?: number } = {}) => {
    const limit = params.limit || 10;
    const categoryId = params.categoryId || null;
    const offset = categoryId
      ? products.filter(product => product.categoryId === categoryId).length
      : products.length;
    const nextProducts = await api.searchProducts({ categoryId, limit, offset });
    const normalized = nextProducts.map(normalizeProduct);
    setProducts(prev => {
      const seen = new Set(prev.map(product => product.id));
      return [...prev, ...normalized.filter(product => !seen.has(product.id))];
    });
    return normalized.length;
  };

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setStartupSplashDone(true), 3000);
    loadCentralResources();
    
    // Check if URL has ?mode=admin or ?mode=customer and clean it up
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'admin' || urlMode === 'customer') {
        // clean up URL to protect owner's dashboard from accidental customer access through shared links
        const cleanParams = new URLSearchParams(window.location.search);
        cleanParams.delete('mode');
        const cleanSearch = cleanParams.toString();
        const newUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
    
    const restoreSession = async () => {
      const cachedToken = localStorage.getItem('svayiro_auth_token');
      const cachedPhone = localStorage.getItem('svayiro_active_phone');
      const cachedRefreshToken = localStorage.getItem('svayiro_refresh_token');
      if (cachedToken) {
        try {
          const res = await api.getCurrentUser();
          const restoredUser = normalizeUser(res.user);
          setActiveUser(restoredUser);
          if (isConsoleUser(restoredUser)) {
            localStorage.setItem('svayiro_app_mode', 'admin');
            setCurrentMode('admin');
            loadCentralResources('admin');
          }
          return;
        } catch (_) {
          localStorage.removeItem('svayiro_auth_token');
        }
      }
      if (cachedPhone && cachedRefreshToken) {
        try {
          const res = await api.refreshAuth(cachedPhone, cachedRefreshToken);
          const restoredUser = normalizeUser(res.user);
          localStorage.setItem('svayiro_auth_token', res.token);
          localStorage.setItem('svayiro_refresh_token', res.refreshToken);
          setActiveUser(restoredUser);
          if (isConsoleUser(restoredUser)) {
            localStorage.setItem('svayiro_app_mode', 'admin');
            setCurrentMode('admin');
            loadCentralResources('admin');
          }
          return;
        } catch (_) {
          localStorage.removeItem('svayiro_refresh_token');
        }
      }
      if (cachedPhone) {
        api.getUserProfile(cachedPhone)
          .then(u => setActiveUser(normalizeUser(u)))
          .catch(_ => localStorage.removeItem('svayiro_active_phone'));
      }
    };
    restoreSession();
    return () => window.clearTimeout(splashTimer);
  }, []);

  // Sync loaded notifications with internal seen reference Set
  useEffect(() => {
    if (notifications.length > 0 && seenNotifIdsRef.current.size === 0) {
      notifications.forEach(n => seenNotifIdsRef.current.add(n.id));
    }
  }, [notifications]);

  // Dynamic order polling to alert when customer places a live order
  useEffect(() => {
    const notificationSignature = (items: Notification[]) =>
      items.map(n => `${n.id}:${n.type}:${n.title}:${n.message}:${n.isActive}:${n.createdAt || n.date || ''}`).join('|');

    const handlePoll = async () => {
      try {
        const latestNotifs = await api.getNotifications();
        
        // Match brand new 'order' type items that have not been registered in the seen list
        const newOrders = latestNotifs.filter(
          n => n.type === 'order' && !seenNotifIdsRef.current.has(n.id)
        );

        const hasNotificationChanges = notificationSignature(latestNotifs) !== notificationSignature(notifications);

        if (newOrders.length > 0) {
          // Play a friendly chimes sound alerting of incoming orders
          if (currentMode === 'admin') {
            try {
              const chime = new Audio('https://assets.mixkit.co/active_storage/sfx/1013/1013-84.wav');
              chime.play().catch(() => {});
            } catch (_) {}
          }

          // Push into seen set
          newOrders.forEach(n => seenNotifIdsRef.current.add(n.id));

          // Set active notification state on parent
          setNotifications(latestNotifs);

          // Render instant beautiful toast notification
          if (currentMode === 'admin') {
            newOrders.forEach(o => {
              showToast(`🔔 ${o.title}: ${o.message}`, 'info');
            });
          }
        } else if (hasNotificationChanges) {
          // Keep sync with updates and deletions
          latestNotifs.forEach(n => seenNotifIdsRef.current.add(n.id));
          setNotifications(latestNotifs);
        }
      } catch (err) {
        console.error("Failed background notification fetch:", err);
      }
    };

    // Poll every 6 seconds in background
    const intervalId = setInterval(handlePoll, 6000);
    return () => clearInterval(intervalId);
  }, [notifications, currentMode]);

  const handleModeSwitch = (mode: 'customer' | 'admin') => {
    if (mode === 'customer' && isWorkerStaffUser(activeUser)) {
      handleLogout();
    }
    setCurrentMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('svayiro_app_mode', mode);
    }
    window.setTimeout(() => {
      loadCentralResources(mode);
    }, 0);
  };



  const handleLoginSuccess = (user: User) => {
    const normalizedUser = normalizeUser(user);
    setActiveUser(normalizedUser);
    if (/^[6-9]\d{9}$/.test(String(normalizedUser.phone || ''))) {
      localStorage.setItem('svayiro_active_phone', normalizedUser.phone);
    } else {
      localStorage.removeItem('svayiro_active_phone');
    }
  };

  const handleLogout = () => {
    setActiveUser(null);
    localStorage.removeItem('svayiro_active_phone');
    localStorage.removeItem('svayiro_auth_token');
    localStorage.removeItem('svayiro_refresh_token');
    showToast('Logged out from SVAYIRO secure session.', 'success');
  };

  const handleAdminRequestOtp = async () => {
    setAdminMessage('');
    const digits = adminPhone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setAdminMessage('Wrong phone number. Enter exactly 10 digits.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setAdminMessage('Wrong phone number. Indian mobile numbers must start with 6, 7, 8, or 9.');
      return;
    }
    setAdminLoginLoading(true);
    try {
      const res = await api.sendOtp(digits);
      setAdminPhone(digits);
      setAdminOtpSent(true);
      setAdminMessage(res.message);
      setAdminOtpExpiresAt(Date.now() + (res.expiresInSeconds ?? 300) * 1000);
      setAdminOtpResendAt(Date.now() + (res.resendAfterSeconds ?? 120) * 1000);
      setAdminOtpSecondsLeft(res.expiresInSeconds ?? 300);
    } catch (err: any) {
      setAdminMessage(err.message || 'Unable to send OTP.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminVerifyOtp = async () => {
    setAdminMessage('');
    const digits = adminPhone.replace(/\D/g, '');
    if (!/^\d{6}$/.test(adminOtp.trim())) {
      setAdminMessage('Enter the 6-digit OTP.');
      return;
    }
    setAdminLoginLoading(true);
    try {
      const res = await api.verifyOtp(digits, adminOtp.trim(), 'SVAYIRO Admin');
      const user = normalizeUser(res.user);
      if (!isConsoleUser(user)) {
        localStorage.removeItem('svayiro_auth_token');
        setAdminMessage('This phone is not an owner or worker account. Owner must create worker accounts first.');
        return;
      }
      if (res.token) localStorage.setItem('svayiro_auth_token', res.token);
      if (res.refreshToken) localStorage.setItem('svayiro_refresh_token', res.refreshToken);
      handleLoginSuccess(user);
      setAdminOtp('');
      setAdminOtpSent(false);
      setAdminOtpExpiresAt(null);
      setAdminOtpResendAt(null);
      setAdminOtpSecondsLeft(0);
      setAdminMessage('');
      showToast('Admin access verified.', 'success');
    } catch (err: any) {
      setAdminMessage(err.message || 'Admin login failed.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminPasswordLogin = async () => {
    setAdminMessage('');
    const loginId = adminPhone.trim().toUpperCase();
    const digits = loginId.replace(/\D/g, '');
    const isOwnerPhone = /^[6-9]\d{9}$/.test(digits) && digits === loginId.replace(/\D/g, '');
    const isWorkerId = /^[A-Z]{2,6}-\d{4,6}$/.test(loginId);
    if (!isOwnerPhone && !isWorkerId) {
      setAdminMessage('Enter owner phone or worker ID, for example 9876543210 or INV-0001.');
      return;
    }
    if (!adminPassword) {
      setAdminMessage('Enter the password assigned by the owner.');
      return;
    }
    setAdminLoginLoading(true);
    try {
      const res = await api.loginConsole(isOwnerPhone ? digits : loginId, adminPassword);
      const user = normalizeUser(res.user);
      if (!isConsoleUser(user)) {
        setAdminMessage('This account is not registered for Admin Console access.');
        return;
      }
      if (res.token) localStorage.setItem('svayiro_auth_token', res.token);
      if (res.refreshToken) localStorage.setItem('svayiro_refresh_token', res.refreshToken);
      localStorage.setItem('svayiro_app_mode', 'admin');
      setCurrentMode('admin');
      handleLoginSuccess(user);
      setAdminPassword('');
      setAdminMessage('');
      showToast('Admin Console login successful.', 'success');
    } catch (err: any) {
      setAdminMessage(err.message || 'Admin Console login failed.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const renderStartupSplash = () => {
    const splashName = shop?.name || 'SVAYIRO';
    const splashLogo = shop?.logoUrl || '';
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col justify-center items-center gap-5 overflow-hidden">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
          <span className="absolute inset-3 rounded-full border border-emerald-400/40 animate-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl shadow-indigo-900/40">
            {splashLogo ? (
              <img src={splashLogo} alt={splashName} className="h-full w-full object-cover" />
            ) : (
              <ShoppingBag className="h-9 w-9 text-indigo-700" />
            )}
          </div>
        </div>
        <div className="text-center">
          <p className="font-serif text-2xl font-black tracking-wide text-white animate-pulse">{splashName}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-300">Fresh store loading</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    );
  };

  const renderRouteLoader = () => (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-[#0f172a] text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-indigo-100">Loading SVAYIRO</p>
      </div>
    </div>
  );

  if (loading || !startupSplashDone) {
    return renderStartupSplash();
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col justify-center items-center p-6 gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <p className="font-bold text-lg">Backend Communication Error</p>
        <p className="text-xs max-w-md opacity-80">{errorMessage}</p>
        <button 
          onClick={() => {
            setLoading(true);
            loadCentralResources();
          }} 
          className="bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-full"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const renderAdminLogin = () => (
    <div className={`min-h-screen flex items-center justify-center p-6 ${isDarkMode ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <div className={`w-full max-w-md rounded-xl border p-6 shadow-xl ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-5 space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <h1 className="font-serif text-xl font-black">Admin Login</h1>
          </div>
          <p className="text-xs opacity-70">Owner logs in with owner credentials. Workers log in with owner-created ID and password.</p>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase opacity-70">Owner Phone / Worker ID</label>
            <div className="flex gap-2">
              <input
                id="admin_login_identifier"
                name="admin_login_identifier"
                value={adminPhone}
                onChange={(event) => setAdminPhone(event.target.value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={16}
                placeholder="9876543210 or INV-0001"
                className={`w-full rounded-lg border px-3 py-2 font-mono outline-none focus:border-indigo-500 ${isDarkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white'}`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase opacity-70">Password</label>
            <div className="relative">
              <input
                id="admin_login_password"
                name="admin_login_password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                type={showAdminPassword ? 'text' : 'password'}
                placeholder="Owner or assigned worker password"
                className={`w-full rounded-lg border px-3 py-2 pr-11 outline-none focus:border-indigo-500 ${isDarkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white'}`}
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                title={showAdminPassword ? 'Hide password' : 'Show password'}
              >
                {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {adminMessage && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{adminMessage}</p>}

          <button
            type="button"
            disabled={adminLoginLoading}
            onClick={handleAdminPasswordLogin}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
          >
            {adminLoginLoading ? 'Checking...' : 'Login to Role Console'}
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button type="button" onClick={() => handleModeSwitch('customer')} className="font-bold text-indigo-600 hover:underline">
              Preview customer storefront
            </button>
            {activeUser && (
              <button type="button" onClick={handleLogout} className="font-bold text-rose-600 hover:underline">
                Clear current login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const activeCustomerUser = isCustomerOnlyUser(activeUser) ? activeUser : null;

  return (
    <div className={`min-h-screen min-h-dvh flex flex-col overflow-x-clip ${isDarkMode ? 'dark bg-[#0f172a] text-[#f8fafc]' : 'bg-[#f8fafc] text-[#0f172a]'}`}>
      
      {/* Render selected app configuration modes */}
      <Suspense fallback={renderRouteLoader()}>
        {currentMode === 'customer' && shop ? (
          <CustomerApp 
            shop={shop}
            categories={categories}
            products={products}
            banners={banners}
            notifications={notifications}
            activeUser={activeCustomerUser}
            onLoginSuccess={handleLoginSuccess}
            onRefreshData={loadCentralResources}
            onLoadMoreProducts={loadMoreCustomerProducts}
            isDarkMode={isDarkMode}
            showToast={showToast}
            onSwitchMode={isWorkerStaffUser(activeUser) ? undefined : handleModeSwitch}
            onLogout={handleLogout}
          />
        ) : shop && isConsoleUser(activeUser) ? (
          <AdminApp 
            shop={shop}
            categories={categories}
            products={products}
            banners={banners}
            notifications={notifications}
            activeUser={activeUser || undefined}
            onRefreshData={loadCentralResources}
            isDarkMode={isDarkMode}
            showToast={showToast}
            onSwitchMode={isAdminOwnerUser(activeUser) ? handleModeSwitch : undefined}
            onLogout={handleLogout}
          />
        ) : shop ? renderAdminLogin() : null}
      </Suspense>

      {/* Floating Toast Notification Container */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[250] flex flex-col gap-3 max-w-sm w-[calc(100%-2.5rem)] pointer-events-none items-center justify-center">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border-2 flex items-center gap-3.5 transition-all duration-300 transform scale-100 animate-slideIn backdrop-blur-md max-w-sm w-full ${
              toast.type === 'success'
                ? 'bg-white/95 dark:bg-slate-900/95 border-emerald-500 text-slate-900 dark:text-slate-100'
                : toast.type === 'warning'
                ? 'bg-white/95 dark:bg-slate-900/95 border-amber-500 text-slate-900 dark:text-slate-100'
                : toast.type === 'error'
                ? 'bg-white/95 dark:bg-slate-900/95 border-rose-500 text-slate-900 dark:text-slate-100'
                : 'bg-white/95 dark:bg-slate-900/95 border-indigo-500 text-slate-900 dark:text-slate-100'
            }`}
          >
            <div className="shrink-0">
              {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
              {toast.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              {toast.type === 'error' && <XCircle className="h-5 w-5 text-rose-500" />}
              {toast.type === 'info' && <Info className="h-5 w-5 text-indigo-500" />}
            </div>
            <div className="flex-1 text-xs font-bold leading-normal">
              {toast.message}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
