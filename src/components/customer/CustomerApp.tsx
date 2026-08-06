/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, AlertTriangle, Store, Heart, ShoppingBag, FileText, User, 
  MapPin, Clipboard, QrCode 
} from 'lucide-react';
import { api } from '../../api';
import { 
  ShopProfile, Category, Product, Banner, Notification, Order, Address, Coupon, User as UserType, CheckoutBagInfo, Bag, CustomerTab, Review
} from '../../types';
import { isValidDDMMYYYY, parseDDMMYYYYToISO } from '../../utils/date';

import CustomerHeader from './CustomerHeader';
import CustomerFooter from './CustomerFooter';
import { commonStyles } from './commonStyles';
import AuthModal from './AuthModal';
import CheckoutModal from './CheckoutModal';
import AdvanceRequestModal from './AdvanceRequestModal';
import QrScannerModal from './QrScannerModal';

const HomeView = lazy(() => import('./HomeView'));
const SearchResultsView = lazy(() => import('./SearchResultsView'));
const CategoriesView = lazy(() => import('./CategoriesView'));
const WishlistView = lazy(() => import('./WishlistView'));
const CartView = lazy(() => import('./CartView'));
const OrdersView = lazy(() => import('./OrdersView'));
const ProfileView = lazy(() => import('./ProfileView'));
const ProductDetailView = lazy(() => import('./ProductDetailView'));

interface CustomerAppProps {
  shop: ShopProfile;
  categories: Category[];
  products: Product[];
  homeProducts?: Product[];
  homeProductPage?: { page: number; pageSize: number; total: number; categoryId: string | null; isLoading: boolean };
  banners: Banner[];
  notifications: Notification[];
  activeUser: UserType | null;
  onLoginSuccess: (user: UserType) => void;
  onRefreshData: () => void;
  onChangeHomeProductPage?: (params?: { categoryId?: string | null; page?: number; pageSize?: number }) => Promise<number>;
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  onSwitchMode?: (mode: 'customer' | 'admin') => void;
  onLogout?: () => void;
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isBirthdayCouponCode(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'birthday' || metadata.birthdayOnly === true || /(BDAY|BIRTHDAY|BIRTH|HBD)/i.test(coupon.code || '');
}

function isWelcomeCouponCode(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'welcome' || metadata.welcomeOnly === true || /(WELCOME|FIRSTORDER|FIRST_ORDER|NEWUSER|NEW_USER)/i.test(coupon.code || '');
}

function isReferralCouponCode(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'referral' || metadata.referralOnly === true || /(REFER|REFERRAL|FRIEND)/i.test(coupon.code || '');
}

function couponAppliedMessage(coupon: Coupon) {
  if (isBirthdayCouponCode(coupon)) return 'Yay! Your birthday coupon is applied. Celebrate the day with this special saving from SVAYIRO.';
  if (isWelcomeCouponCode(coupon)) return 'Yay! Your welcome coupon is applied. Enjoy your first special saving with SVAYIRO.';
  if (isReferralCouponCode(coupon)) return 'Yay! Your Refer & Win coupon is applied. Thanks for growing the SVAYIRO family.';
  return 'Yay! Your coupon is applied successfully. Enjoy your saving on this order.';
}

function CustomerViewLoader() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12">
          <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300 shadow-[0_0_22px_rgba(253,224,71,0.75)]" />
          <span className="absolute inset-0 animate-spin rounded-full">
            <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.85)]" />
          </span>
        </div>
        <p className="text-[10px] font-normal lowercase tracking-wide text-indigo-500">loading..</p>
      </div>
    </div>
  );
}

function isEffectiveBirthdayToday(dateOfBirth?: string) {
  const raw = String(dateOfBirth || '').trim();
  const displayMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const match = displayMatch || isoMatch;
  if (!match) return false;
  const birthDay = Number(displayMatch ? match[1] : match[3]);
  const birthMonth = Number(displayMatch ? match[2] : match[2]);
  const today = new Date();
  const feb29InNonLeap = birthMonth === 2 && birthDay === 29 && !isLeapYear(today.getFullYear());
  const effectiveMonth = feb29InNonLeap ? 3 : birthMonth;
  const effectiveDay = feb29InNonLeap ? 1 : birthDay;
  return today.getMonth() + 1 === effectiveMonth && today.getDate() === effectiveDay;
}

export function calculateDistanceInKm(address: Address | null): number {
  if (!address) return 0;

  // Let's build a unified address text
  const userAddrText = `${address.flatAndHouse || ''} ${address.areaAndStreet || ''} ${address.landmark || ''} ${address.cityOrVillage || ''} ${address.pincode || ''}`.toLowerCase();

  // 1. Explicit distance parsing (e.g., "300m", "300 meters", "0.3 km")
  const mMatch = userAddrText.match(/\b(\d+)\s*(?:m|meters|metres|mtrs|mtr)\b/);
  if (mMatch) {
    const meters = parseFloat(mMatch[1]);
    if (meters > 0 && meters < 5000) {
      return Math.round((meters / 1000) * 10) / 10;
    }
  }

  const kmMatch = userAddrText.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kms|kilometers|kilometres)\b/);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    if (km > 0 && km < 50) {
      return km;
    }
  }

  // 2. Keyword/Layout/Neighborhood matching with the shop (e.g. Maruti/Maruthi Layout, Vasantapura)
  const shopKeywordsClean = ['maruti', 'maruti layout', 'vasantapura', 'vasanthapura', 'subramanyapura', 'subramanyapra', 'ekalavya'];
  
  const normalizeWord = (w: string) => w.replace(/[^a-z0-9]/g, '');
  const cleanWordForMatching = (w: string) => {
    return w.replace(/th/g, 't').replace(/sh/g, 's').replace(/ph/g, 'f');
  };

  const stopWords = new Set(['and', 'the', 'near', 'opposite', 'behind', 'beside', 'layout', 'cross', 'road', 'street', 'bengaluru', 'bangalore', 'karnataka', 'india', 'flat', 'house', 'floor', 'block', 'pincode', 'main', 'first', 'second', 'third', '1st', '2nd', '3rd', 'enterprises', 'shop', 'branch']);

  const userWords = userAddrText
    .split(/[\s,]+/)
    .map(normalizeWord)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .map(cleanWordForMatching);

  const shopWordsClean = shopKeywordsClean.map(cleanWordForMatching);

  const localMatch = userWords.some(w => shopWordsClean.includes(w));
  if (localMatch) {
    console.log("[Smart Client Distance] Local layout matching word found. Setting distance to 0.3 km.");
    return 0.3; // 300 meters!
  }

  // 3. Pincode matching fallback
  const userPin = address.pincode.replace(/\D/g, '');
  const shopPin = '560061'; // main branch pin

  if (userPin && shopPin) {
    if (userPin === shopPin) {
      return 1.2; // nearby, same pincode
    }

    if (userPin.startsWith('560') && shopPin.startsWith('560')) {
      const op = parseInt(shopPin, 10);
      const dp = parseInt(userPin, 10);
      const diff = Math.abs(op - dp);
      const estKm = Math.min(25, Math.max(1.5, 1.5 + (diff % 10) * 1.2));
      return Math.round(estKm * 10) / 10;
    }
  }

  // Deterministic fallback based on pincode + street address length
  const pincodeNum = parseInt(address.pincode.replace(/\D/g, ''), 10) || 110001;
  const addressLen = (address.areaAndStreet?.length || 0) + (address.flatAndHouse?.length || 0);
  const seed = (pincodeNum + addressLen * 17) % 130;
  const distance = 1.5 + seed / 10;
  return Math.round(distance * 10) / 10; // e.g. 5.4, 11.2, etc.
}

function normalizeCartItems(items: unknown): { productId: string; quantity: number }[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => ({
      productId: typeof item?.productId === 'string' ? item.productId : '',
      quantity: Math.max(1, Math.floor(Number(item?.quantity ?? 1)))
    }))
    .filter((item) => item.productId && Number.isFinite(item.quantity));
}

const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

function normalizeGmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidGmail(value: string) {
  const email = normalizeGmail(value);
  return emailRegex.test(email) && email.endsWith('@gmail.com');
}

export default function CustomerApp({
  shop,
  categories,
  products,
  homeProducts,
  homeProductPage,
  banners,
  notifications,
  activeUser: rawActiveUser,
  onLoginSuccess,
  onRefreshData,
  onChangeHomeProductPage,
  isDarkMode,
  showToast,
  onSwitchMode,
  onLogout
}: CustomerAppProps) {
  const formatDobForDisplay = (value?: string) => {
    const raw = String(value || '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    return /^\d{2}-\d{2}-\d{4}$/.test(raw) ? raw : '';
  };

  const activeUser = useMemo<UserType | null>(() => {
    if (!rawActiveUser) return null;
    const user = rawActiveUser as any;
    return {
      ...rawActiveUser,
      dateOfBirth: formatDobForDisplay(user.dateOfBirth || user.date_of_birth),
      savedAddresses: Array.isArray(user.savedAddresses)
        ? user.savedAddresses
        : Array.isArray(user.saved_addresses)
          ? user.saved_addresses
          : [],
      savedForLater: Array.isArray(user.savedForLater)
        ? user.savedForLater
        : Array.isArray(user.saved_for_later)
          ? user.saved_for_later
          : [],
      wishlist: Array.isArray(user.wishlist) ? user.wishlist : []
    };
  }, [rawActiveUser]);

  // Mobile Bottom Navigation Tabs: 'home' | 'search' | 'categories' | 'wishlist' | 'cart' | 'orders' | 'profile'
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [serverFilteredProducts, setServerFilteredProducts] = useState<Product[] | null>(null);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [searchUseDelay, setSearchUseDelay] = useState(true);
  const [searchDelayMs, setSearchDelayMs] = useState(400);
  const [searchSort, setSearchSort] = useState<'relevance' | 'price_low' | 'price_high' | 'newest'>('relevance');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(localStorage.getItem('svayiro_search_history') || '[]');
      return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(localStorage.getItem('svayiro_read_notifications') || '[]');
      return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(-300) : [];
    } catch {
      return [];
    }
  });

  // App settings mock preferences
  const [enableSound, setEnableSound] = useState<boolean>(true);
  const [enableLocalAlerts, setEnableLocalAlerts] = useState<boolean>(true);
  const [newsletterSubscribed, setNewsletterSubscribed] = useState<boolean>(true);
  
  // Banner slider state
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  
  // Modals & Details states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const hydratedProductIdsRef = useRef<Set<string>>(new Set());
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [detailQty, setDetailQty] = useState(1);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const handleShareProduct = async (product: Product) => {
    const productPrice = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
    const shareUrl = `${window.location.origin}${window.location.pathname}?product=${product.id}`;
    const shareText = `Check out "${product.name}" on SVAYIRO!  ₹${productPrice}. 🌾🛍️`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.log("System share closed:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard! Share it with your friends.', 'success');
      } catch (err) {
        showToast('Failed to copy product link', 'error');
      }
    }
  };
  
  // Review Formulation state
  const [tempRating, setTempRating] = useState(5);
  const [tempComment, setTempComment] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  
  // Future dates booking system state
  const [reqProductName, setReqProductName] = useState('');
  const [reqQuantity, setReqQuantity] = useState(1);
  const [reqTargetDate, setReqTargetDate] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  // Cart operations (Stored in local state + persisted to cloud back for logged users)
  const [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]);
  const homePageLoadKeyRef = useRef('all');

  useEffect(() => {
    let mounted = true;
    api.getSearchConfig()
      .then((config) => {
        if (!mounted) return;
        setSearchUseDelay(Boolean(config.useDelay));
        setSearchDelayMs(Number.isFinite(Number(config.delayMs)) ? Math.max(0, Number(config.delayMs)) : 400);
      })
      .catch(() => {
        if (!mounted) return;
        setSearchUseDelay(true);
        setSearchDelayMs(400);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const search = searchQuery.trim();
    const shouldQueryBackend = Boolean(search);
    if (!shouldQueryBackend) {
      setServerFilteredProducts(null);
      setIsSearchingProducts(false);
      return;
    }

    let cancelled = false;
    const delayMs = searchUseDelay ? searchDelayMs : 0;
    const timer = window.setTimeout(async () => {
      setIsSearchingProducts(true);
      try {
        const result = await api.searchProducts({ search, limit: 20, offset: 0, summary: true });
        if (!cancelled) setServerFilteredProducts(result);
      } catch (err) {
        console.error('Product search failed', err);
        if (!cancelled) setServerFilteredProducts(null);
      } finally {
        if (!cancelled) setIsSearchingProducts(false);
      }
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searchUseDelay, searchDelayMs]);

  useEffect(() => {
    if (!onChangeHomeProductPage) return;
    const key = selectedCategory || 'all';
    if (homePageLoadKeyRef.current === key) return;
    homePageLoadKeyRef.current = key;
    onChangeHomeProductPage({ categoryId: selectedCategory, page: 1, pageSize: homeProductPage?.pageSize || 20 })
      .catch((err) => {
        console.error('Product page load failed', err);
      });
  }, [selectedCategory, onChangeHomeProductPage, homeProductPage?.pageSize]);

  useEffect(() => {
    if (!selectedProduct?.id || hydratedProductIdsRef.current.has(selectedProduct.id)) return;
    let cancelled = false;
    const productId = selectedProduct.id;
    hydratedProductIdsRef.current.add(productId);
    api.getProduct(productId)
      .then((product) => {
        if (cancelled) return;
        setSelectedProduct((current) => current?.id === productId ? { ...current, ...product } : current);
      })
      .catch((err) => {
        hydratedProductIdsRef.current.delete(productId);
        console.error('Product detail load failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('svayiro_search_history', JSON.stringify(searchHistory.slice(0, 8)));
    }
  }, [searchHistory]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('svayiro_read_notifications', JSON.stringify(readNotificationIds.slice(-300)));
    }
  }, [readNotificationIds]);

  // Selected address state during checkout
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number>(0);
  const [selectedShopBranchId, setSelectedShopBranchId] = useState<string>('');
  const [googleMapsDistanceKm, setGoogleMapsDistanceKm] = useState<number | null>(null);
  const [googleMapsDistanceText, setGoogleMapsDistanceText] = useState<string>('');
  const [googleMapsDurationText, setGoogleMapsDurationText] = useState<string>('');
  const [isCalculatingDistance, setIsCalculatingDistance] = useState<boolean>(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('delivery');

  // Recalculate Google Maps distance when address/shop branch changes
  useEffect(() => {
    const recalcDistance = async () => {
      if (deliveryMethod !== 'delivery') {
        setGoogleMapsDistanceKm(null);
        setGoogleMapsDistanceText('');
        setGoogleMapsDurationText('');
        return;
      }

      if (!activeUser || activeUser.savedAddresses.length === 0 || !shop) {
        setGoogleMapsDistanceKm(null);
        setGoogleMapsDistanceText('');
        setGoogleMapsDurationText('');
        return;
      }

      const selectedAddr = activeUser.savedAddresses[selectedAddressIndex];
      if (!selectedAddr) return;

      // Build full address strings
      const customerAddr = `${selectedAddr.flatAndHouse}, ${selectedAddr.areaAndStreet}, ${selectedAddr.landmark}, ${selectedAddr.cityOrVillage}, ${selectedAddr.taluk}, ${selectedAddr.district}, ${selectedAddr.state} - ${selectedAddr.pincode}`;
      
      // Find selected shop branch address
      const branch = shop.addresses?.find(a => a.id === selectedShopBranchId);
      const shopAddr = branch 
        ? `${branch.flatAndHouse}, ${branch.areaAndStreet}, ${branch.landmark}, ${branch.cityOrVillage}, ${branch.taluk}, ${branch.district}, ${branch.state} - ${branch.pincode}`
        : shop.address;

      if (!customerAddr || !shopAddr) return;
      if (!branch?.lat || !branch?.lng || !selectedAddr.lat || !selectedAddr.lng) {
        setGoogleMapsDistanceKm(null);
        setGoogleMapsDistanceText('Pin shop branch and delivery address to calculate route');
        setGoogleMapsDurationText('');
        return;
      }

      setIsCalculatingDistance(true);
      try {
        const result = await api.calculateDistance(shopAddr, customerAddr, branch.lat, branch.lng, selectedAddr.lat, selectedAddr.lng);
        setGoogleMapsDistanceKm(result.distanceKm);
        setGoogleMapsDistanceText(result.distanceText);
        setGoogleMapsDurationText(result.durationText);
      } catch (err) {
        console.error('Accurate distance calculation failed:', err);
        setGoogleMapsDistanceKm(null);
        setGoogleMapsDistanceText('Could not calculate exact road distance');
        setGoogleMapsDurationText('');
      } finally {
        setIsCalculatingDistance(false);
      }
    };

    const timeout = setTimeout(recalcDistance, 300);
    return () => clearTimeout(timeout);
  }, [deliveryMethod, selectedAddressIndex, selectedShopBranchId, activeUser, shop]);

  // Select default branch ID if any
  useEffect(() => {
    if (shop?.addresses && shop.addresses.length > 0) {
      const defaultBranch = shop.addresses.find(b => b.isDefault) || shop.addresses[0];
      setSelectedShopBranchId(defaultBranch.id);
    }
  }, [shop]);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<Address>>({
    label: 'Home',
    name: '',
    phone: '',
    flatAndHouse: '',
    areaAndStreet: '',
    landmark: '',
    pincode: '',
    state: '',
    district: '',
    taluk: '',
    cityOrVillage: '',
    pickupPersonName: '',
    pickupPersonPhone: '',
    isDefault: false,
    lat: undefined,
    lng: undefined
  });

  // Checkout choices
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('09:00 AM - 11:30 AM');
  const [bagOption, setBagOption] = useState<'own' | 'need'>('need');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponSuccessMessage, setCouponSuccessMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi'>('cod');
  const [upiReference, setUpiReference] = useState('');
  const [upiPaymentId, setUpiPaymentId] = useState<string | null>(null);
  const [upiPaymentUrl, setUpiPaymentUrl] = useState('');
  const [pendingUpiOrderPayload, setPendingUpiOrderPayload] = useState<Parameters<typeof api.placeOrder>[0] | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  const [upiPaymentStep, setUpiPaymentStep] = useState<'idle' | 'redirecting' | 'waiting' | 'success'>('idle');
  const [upiCountdown, setUpiCountdown] = useState(5);

  const handleSetDeliveryMethod = (method: 'pickup' | 'delivery') => {
    setDeliveryMethod(method);
    setCheckoutError('');
    const firstOwnerSlot = shop.deliverySlots?.[0] || '07:00 AM - 10:00 AM';
    if (method === 'pickup') {
      setIsAddingAddress(false);
      setGoogleMapsDistanceKm(null);
      setGoogleMapsDistanceText('');
      setGoogleMapsDurationText('');
      setSelectedSlot(firstOwnerSlot);
    } else if (!selectedSlot || /pickup/i.test(selectedSlot)) {
      setSelectedSlot(firstOwnerSlot);
    }
  };

  // Authentication Dialog states
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDob, setAuthDob] = useState('');
  const [authTermsAccepted, setAuthTermsAccepted] = useState(false);
  const [authOtp, setAuthOtp] = useState('');
  const [otpSentMessage, setOtpSentMessage] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [authError, setAuthError] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpResendAt, setOtpResendAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);

  // Loaded user's orders history
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loyaltyAccount, setLoyaltyAccount] = useState<{
    points: number;
    earnedPoints: number;
    redeemedPoints: number;
    totalSpend: number;
    totalOrders: number;
    earnRateAmount: number;
    redeemBlockPoints: number;
    redeemBlockValue: number;
    nextRewardAt: number;
  } | null>(null);
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0);

  useEffect(() => {
    if (!isOtpSent || !otpExpiresAt) return;

    const updateTimer = () => {
      const secondsLeft = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setOtpSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        setIsOtpSent(false);
        setAuthOtp('');
        setOtpSentMessage('');
        setOtpExpiresAt(null);
        setOtpResendAt(null);
        setAuthError('OTP expired. Please request a new code.');
      }
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(intervalId);
  }, [isOtpSent, otpExpiresAt]);

  // Load smart carrier bags configuration from server
  useEffect(() => {
    api.getBags()
      .then(res => {
        setBags(Array.isArray(res) ? res : []);
      })
      .catch(err => {
        console.error("Failed loading active smart bags:", err);
        setBags([]);
      });
  }, []);

  useEffect(() => {
    api.getCoupons()
      .then((rows) => setCoupons(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        console.error('Failed loading customer offers:', err);
        setCoupons([]);
      });
  }, []);

  const fetchReviews = async () => {
    try {
      const rows = await api.getReviews();
      setReviews(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('Failed loading reviews:', err);
      setReviews([]);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  // Sync cart with activeUser.savedForLater or local
  useEffect(() => {
    if (activeUser) {
      setCart(normalizeCartItems(activeUser.savedForLater));
      fetchUserOrders();
      fetchLoyaltySummary();
    } else {
      setLoyaltyAccount(null);
      setLoyaltyRedeemPoints(0);
      const cachedCart = localStorage.getItem('svayiro_cart');
      if (cachedCart) {
        try {
          setCart(normalizeCartItems(JSON.parse(cachedCart)));
        } catch (_) {}
      }
    }
  }, [activeUser]);

  const fetchLoyaltySummary = async () => {
    try {
      const summary = await api.getLoyaltySummary();
      setLoyaltyAccount(summary);
      setLoyaltyRedeemPoints((current) => Math.min(current, summary.points));
    } catch (err) {
      console.error('Failed loading loyalty summary:', err);
      setLoyaltyAccount(null);
      setLoyaltyRedeemPoints(0);
    }
  };

  // Sync orders list when activeTab switches to 'orders'
  useEffect(() => {
    if (activeTab === 'orders' && activeUser) {
      fetchUserOrders();
    }
    if ((activeTab === 'orders' || activeTab === 'profile' || activeTab === 'cart') && activeUser) {
      fetchLoyaltySummary();
    }
  }, [activeTab, activeUser]);

  // Banner slideshow auto-interval
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prevIndex) => (prevIndex + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Set default selected slot when shop profile loads
  const configuredDeliverySlotsKey = useMemo(() => (shop.deliverySlots || []).join('|'), [shop.deliverySlots]);
  useEffect(() => {
    const slots = configuredDeliverySlotsKey
      ? configuredDeliverySlotsKey.split('|').filter(Boolean)
      : [];
    if (slots.length > 0 && !selectedSlot) {
      setSelectedSlot(slots[0]);
    }
  }, [configuredDeliverySlotsKey, selectedSlot]);

  // Reset indices and quantities when product is selected
  useEffect(() => {
    if (selectedProduct) {
      setActiveImageIndex(0);
      setDetailQty(1);
    }
  }, [selectedProduct]);

  // Clear selected product view when active tab changes
  useEffect(() => {
    setSelectedProduct(null);
  }, [activeTab]);

  // Scroll to top of the page when changing tabs or selecting a product
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab, selectedProduct]);

  // Deep link parsing for shared product URLs
  useEffect(() => {
    if (products && products.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const prodId = params.get('product');
      if (prodId) {
        const found = products.find(p => p.id === prodId);
        if (found) {
          setSelectedProduct(found);
        }
      }
    }
  }, [products]);

  // Persist cart
  const updateCartState = async (newCart: typeof cart) => {
    setCart(newCart);
    if (activeUser) {
      try {
        await api.updateSaveLater(activeUser.phone, newCart);
      } catch (err) {
        console.error("Cart save failed:", err);
      }
    } else {
      localStorage.setItem('svayiro_cart', JSON.stringify(newCart));
    }
  };

  const fetchUserOrders = async (silent = false) => {
    if (!activeUser) return;
    if (!silent) setLoadingOrders(true);
    try {
      const res = await api.customerOrders(activeUser.phone);
      setOrders(res);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  };

  // Add cart trigger
  const addToCart = (productId: string, qty: number = 1, silent = false) => {
    if (!activeUser) {
      if (!silent) requireCustomerLogin('shopping bag');
      return;
    }
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    
    // Check stock limit
    const existing = cart.find(item => item.productId === productId);
    const totalNewQty = (existing?.quantity || 0) + qty;
    if (totalNewQty > prod.stockCount) {
      if (!silent) {
        showToast(`Buy Now! Only ${prod.stockCount} left in stock.`, 'warning');
      }
      return;
    }

    let nextCart = [...cart];
    if (existing) {
      nextCart = cart.map(item => 
        item.productId === productId ? { ...item, quantity: totalNewQty } : item
      );
    } else {
      nextCart.push({ productId, quantity: qty });
    }
    updateCartState(nextCart);
    if (!silent) {
      showToast(`Added ${prod.name} to cart!`, 'success');
    }
  };

  const updateCartQty = (productId: string, quantity: number) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    if (quantity <= 0) {
      const nextCart = cart.filter(item => item.productId !== productId);
      updateCartState(nextCart);
      showToast(`Removed ${prod.name} from cart`, 'info');
      return;
    }

    if (quantity > prod.stockCount) {
      showToast(`No More stock limit (${prod.stockCount} units).`, 'warning');
      return;
    }

    const nextCart = cart.map(item => 
      item.productId === productId ? { ...item, quantity } : item
    );
    updateCartState(nextCart);
  };

  const removeFromCart = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    const nextCart = cart.filter(item => item.productId !== productId);
    updateCartState(nextCart);
    if (prod) {
      showToast(`Removed ${prod.name} from cart`, 'info');
    }
  };

  const clearCart = (silent = false) => {
    updateCartState([]);
    if (!silent) {
      showToast('Cleared all items in your cart', 'info');
    }
  };

  // Customer registration/login handlers
  const handleRequestOtp = async () => {
    setAuthError('');
    const email = normalizeGmail(authEmail);
    if (!isValidGmail(email)) {
      setAuthError('Enter your registered Gmail address ending with @gmail.com.');
      return;
    }
    if (authPassword.length < 8 || !/[A-Za-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setAuthError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    try {
      setAuthEmail(email);
      const res = await api.sendPasswordResetOtp(email);
      setOtpSentMessage(res.message);
      setIsOtpSent(true);
      setOtpExpiresAt(Date.now() + (res.expiresInSeconds ?? 300) * 1000);
      setOtpResendAt(Date.now() + (res.resendAfterSeconds ?? 120) * 1000);
      setOtpSecondsLeft(res.expiresInSeconds ?? 300);
    } catch (err: any) {
      setAuthError(err.message || 'OTP delivery failed');
    }
  };

  const handleRequestRegistrationOtp = async () => {
    setAuthError('');
    const cleanName = authName.trim();
    const email = normalizeGmail(authEmail);
    if (!cleanName || !/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(cleanName)) {
      setAuthError('Name can use letters, spaces, apostrophes, periods, or hyphens only.');
      return;
    }
    if (!isValidGmail(email)) {
      setAuthError('Enter a valid Gmail address ending with @gmail.com.');
      return;
    }
    const phoneDigits = authPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setAuthError('Wrong phone number. Enter exactly 10 digits.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
      setAuthError('Wrong phone number. Indian mobile numbers must start with 6, 7, 8, or 9.');
      return;
    }
    if (!isValidDDMMYYYY(authDob)) {
      setAuthError('Enter date of birth in dd-mm-yyyy format.');
      return;
    }
    if (new Date(`${parseDDMMYYYYToISO(authDob)}T00:00:00`).getTime() > Date.now()) {
      setAuthError('Date of birth cannot be in the future.');
      return;
    }
    if (!authTermsAccepted) {
      setAuthError('Please read and accept the Terms & Conditions before registration.');
      return;
    }
    if (authPassword.length < 8 || !/[A-Za-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setAuthError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    try {
      setAuthEmail(email);
      const res = await api.sendRegistrationOtp(email, phoneDigits);
      setOtpSentMessage(res.message);
      setIsOtpSent(true);
      setOtpExpiresAt(Date.now() + (res.expiresInSeconds ?? 300) * 1000);
      setOtpResendAt(Date.now() + (res.resendAfterSeconds ?? 120) * 1000);
      setOtpSecondsLeft(res.expiresInSeconds ?? 300);
    } catch (err: any) {
      setAuthError(err.message || 'Gmail OTP delivery failed');
    }
  };

  const handleRegisterCustomer = async () => {
    setAuthError('');
    const cleanName = authName.trim();
    if (!cleanName || !/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(cleanName)) {
      setAuthError('Name can use letters, spaces, apostrophes, periods, or hyphens only.');
      return;
    }
    const email = normalizeGmail(authEmail);
    if (!isValidGmail(email)) {
      setAuthError('Enter a valid Gmail address ending with @gmail.com.');
      return;
    }
    const phoneDigits = authPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setAuthError('Wrong phone number. Enter exactly 10 digits.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
      setAuthError('Wrong phone number. Indian mobile numbers must start with 6, 7, 8, or 9.');
      return;
    }
    if (!isValidDDMMYYYY(authDob)) {
      setAuthError('Enter date of birth in dd-mm-yyyy format.');
      return;
    }
    if (new Date(`${parseDDMMYYYYToISO(authDob)}T00:00:00`).getTime() > Date.now()) {
      setAuthError('Date of birth cannot be in the future.');
      return;
    }
    if (!authTermsAccepted) {
      setAuthError('Please read and accept the Terms & Conditions before registration.');
      return;
    }
    if (!isOtpSent) {
      setAuthError('Please verify your Gmail OTP before creating the account.');
      return;
    }
    if (!/^\d{6}$/.test(authOtp.trim())) {
      setAuthError('Enter the 6-digit Gmail verification code.');
      return;
    }
    if (authPassword.length < 8 || !/[A-Za-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setAuthError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    try {
      const res = await api.registerCustomer({
        name: cleanName,
        email,
        phone: phoneDigits,
        code: authOtp.trim(),
        password: authPassword,
        dateOfBirth: authDob,
        termsAccepted: authTermsAccepted
      });
      if (res.user) {
        if (res.token) {
          localStorage.setItem('svayiro_auth_token', res.token);
        }
        if (res.refreshToken) {
          localStorage.setItem('svayiro_refresh_token', res.refreshToken);
        }
        onLoginSuccess(res.user);
        setIsOtpSent(false);
        setIsAuthOpen(false);
        setAuthOtp('');
        setOtpExpiresAt(null);
        setOtpResendAt(null);
        setOtpSecondsLeft(0);
        setAuthPassword('');
        setActiveTab('profile');
        setIsAddingAddress(true);
        // Sync local cart to profiles
        if (cart.length > 0 && /^[6-9]\d{9}$/.test(String(res.user.phone || ''))) {
          await api.updateSaveLater(res.user.phone, cart);
        }
        showToast('Registration complete. Add your delivery address in profile.', 'success');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
    }
  };

  const handleCustomerLogin = async () => {
    setAuthError('');
    const email = normalizeGmail(authEmail);
    if (!isValidGmail(email)) {
      setAuthError('Enter your registered Gmail address ending with @gmail.com.');
      return;
    }
    if (!authPassword) {
      setAuthError('Password is required.');
      return;
    }
    try {
      const res = await api.loginCustomer(email, authPassword);
      if (res.user) {
        if (res.token) {
          localStorage.setItem('svayiro_auth_token', res.token);
        }
        if (res.refreshToken) {
          localStorage.setItem('svayiro_refresh_token', res.refreshToken);
        }
        onLoginSuccess(res.user);
        setIsOtpSent(false);
        setIsAuthOpen(false);
        setAuthOtp('');
        setOtpExpiresAt(null);
        setOtpResendAt(null);
        setOtpSecondsLeft(0);
        setAuthPassword('');
        if (cart.length > 0 && /^[6-9]\d{9}$/.test(String(res.user.phone || ''))) {
          await api.updateSaveLater(res.user.phone, cart);
        }
        showToast(`Welcome ${res.user.name || 'back'}!`, 'success');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    }
  };

  const handleResetPassword = async () => {
    setAuthError('');
    const email = normalizeGmail(authEmail);
    if (!isValidGmail(email)) {
      setAuthError('Enter your registered Gmail address ending with @gmail.com.');
      return;
    }
    if (!isOtpSent) {
      setAuthError('Please request OTP before resetting password.');
      return;
    }
    if (!/^\d{6}$/.test(authOtp.trim())) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }
    if (authPassword.length < 8 || !/[A-Za-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setAuthError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    try {
      await api.resetPassword(email, authOtp.trim(), authPassword);
      setAuthMode('login');
      setIsOtpSent(false);
      setAuthOtp('');
      setAuthPassword('');
      setOtpExpiresAt(null);
      setOtpResendAt(null);
      setOtpSecondsLeft(0);
      showToast('Password reset successfully. Login with your new password.', 'success');
    } catch (err: any) {
      setAuthError(err.message || 'Password reset failed');
    }
  };

  const toggleWishlist = async (productId: string) => {
    if (!activeUser) {
      setIsAuthOpen(true);
      return;
    }
    const isInside = activeUser.wishlist.includes(productId);
    const nextWish = isInside 
      ? activeUser.wishlist.filter(id => id !== productId)
      : [...activeUser.wishlist, productId];
    
    try {
      const res = await api.updateWishlist(activeUser.phone, nextWish);
      if (res.user) {
        onLoginSuccess(res.user);
        const prod = products.find(p => p.id === productId);
        const prodName = prod ? prod.name : 'Product';
        if (isInside) {
          showToast(`Removed "${prodName}" from wishlist`, 'info');
        } else {
          showToast(`❤️ Added "${prodName}" to wishlist!`, 'success');
        }
      }
    } catch (err) {
      console.error("Wishlist saving error", err);
    }
  };

  const handleSaveAddress = async () => {
    if (!activeUser) return;
    
    // 1. Validate State
    if (!newAddress.state) {
      showToast('Please select a State in India.', 'warning');
      return;
    }
    // 2. Validate District
    if (!newAddress.district || !newAddress.district.trim()) {
      showToast('Please specify the District.', 'warning');
      return;
    }
    // 3. Validate Taluk
    if (!newAddress.taluk || !newAddress.taluk.trim()) {
      showToast('Please specify the Taluk.', 'warning');
      return;
    }
    // 3.5. Validate City/Village
    if (!newAddress.cityOrVillage || !newAddress.cityOrVillage.trim()) {
      showToast('Please specify the City / Village.', 'warning');
      return;
    }
    // 4. Validate Pincode (Exactly 6 digits)
    const pinRegex = /^\d{6}$/;
    if (!newAddress.pincode || !pinRegex.test(newAddress.pincode.trim())) {
      showToast('Please specify a valid 6-digit Pincode.', 'warning');
      return;
    }
    // 5. Validate home address (Flat & House, Area & Street)
    if (!newAddress.flatAndHouse || !newAddress.flatAndHouse.trim()) {
      showToast('Please provide your Flat, House No., or Building details.', 'warning');
      return;
    }
    if (!newAddress.areaAndStreet || !newAddress.areaAndStreet.trim()) {
      showToast('Please provide your Street Name or Colony details.', 'warning');
      return;
    }
    // 6. Validate Landmark (Near location)
    if (!newAddress.landmark || !newAddress.landmark.trim()) {
      showToast('Please specify a Near Location / Landmark.', 'warning');
      return;
    }
    // 7. Address contact phone defaults to the verified account phone.
    const rawAddressPhone = newAddress.pickupPersonPhone || newAddress.phone || activeUser.phone || '';
    const phoneDigits = String(rawAddressPhone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const phoneTrimmed = phoneDigits.slice(-10);
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneTrimmed || !phoneRegex.test(phoneTrimmed)) {
      showToast('Please specify a valid 10-digit Phone Number.', 'warning');
      return;
    }
    const lat = Number(newAddress.lat);
    const lng = Number(newAddress.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      showToast('Please pin your exact location or enter valid latitude and longitude.', 'warning');
      return;
    }

    // Set fallback name / contact person name if not provided
    const finalContactName = (newAddress.pickupPersonName && newAddress.pickupPersonName.trim()) 
      ? newAddress.pickupPersonName.trim() 
      : activeUser.name || 'Customer';

    const createdAddress: Address = {
      id: generateId('addr'),
      label: newAddress.label || 'Home',
      flatAndHouse: newAddress.flatAndHouse.trim(),
      areaAndStreet: newAddress.areaAndStreet.trim(),
      landmark: newAddress.landmark.trim(),
      pincode: newAddress.pincode.trim(),
      state: newAddress.state,
      district: newAddress.district.trim(),
      taluk: newAddress.taluk.trim(),
      cityOrVillage: newAddress.cityOrVillage.trim(),
      phone: phoneTrimmed,
      pickupPersonName: finalContactName,
      pickupPersonPhone: phoneTrimmed,
      lat,
      lng,
      isDefault: activeUser.savedAddresses.length === 0
    };

    const nextAddrs = [...activeUser.savedAddresses, createdAddress];
    try {
      const res = await api.updateProfile(activeUser.phone, { savedAddresses: nextAddrs });
      if (res.user) {
        onLoginSuccess(res.user);
        setSelectedAddressIndex(res.user.savedAddresses.length - 1);
        setIsAddingAddress(false);
        showToast('🎉 Address saved successfully!', 'success');
        setNewAddress({
          label: 'Home',
          phone: '',
          flatAndHouse: '',
          areaAndStreet: '',
          landmark: '',
          pincode: '',
          state: '',
          district: '',
          taluk: '',
          cityOrVillage: '',
          pickupPersonName: '',
          pickupPersonPhone: '',
          lat: undefined,
          lng: undefined,
          isDefault: false
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Error saving address details.', 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string, index?: number) => {
    if (!activeUser) return;
    
    let nextAddrs = [];
    let deletedIndex = -1;
    
    if (index !== undefined) {
      deletedIndex = index;
      nextAddrs = activeUser.savedAddresses.filter((_, idx) => idx !== index);
    } else if (addressId) {
      deletedIndex = activeUser.savedAddresses.findIndex(addr => addr.id === addressId);
      if (deletedIndex !== -1) {
        nextAddrs = activeUser.savedAddresses.filter((_, idx) => idx !== deletedIndex);
      } else {
        nextAddrs = activeUser.savedAddresses.filter(addr => addr.id !== addressId);
      }
    } else {
      return;
    }

    try {
      const res = await api.updateProfile(activeUser.phone, { savedAddresses: nextAddrs });
      if (res.user) {
        onLoginSuccess(res.user);
        
        // Adjust selectedAddressIndex
        if (deletedIndex !== -1) {
          if (selectedAddressIndex === deletedIndex) {
            // Selected address was deleted. Reset selection to first address.
            setSelectedAddressIndex(0);
          } else if (deletedIndex < selectedAddressIndex) {
            // Deleted address was before selected address. Decrement selected index to keep the same address active.
            setSelectedAddressIndex(prev => Math.max(0, prev - 1));
          }
        }
        
        // Ensure index is within range of the updated list
        const newLen = res.user.savedAddresses.length;
        setSelectedAddressIndex(prev => {
          if (newLen === 0) return 0;
          if (prev >= newLen) return newLen - 1;
          return prev;
        });

        showToast('🗑️ Address deleted successfully!', 'success');
      }
    } catch (err) {
      console.error("Error deleting address:", err);
      showToast('Error deleting address. Please try again.', 'error');
    }
  };

  // Coupon validation
  const handleApplyCoupon = async () => {
    setCouponError('');
    setCouponSuccessMessage('');
    if (!couponCode) return;
    try {
      const res = await api.validateCoupon(couponCode, totals.productTotal);
      if (res.valid) {
        setAppliedCoupon(res.coupon);
        setCouponSuccessMessage(couponAppliedMessage(res.coupon));
      }
    } catch (err: any) {
      setCouponError(err.message || 'Coupon validation failed');
      setAppliedCoupon(null);
      setCouponSuccessMessage('');
    }
  };

  // Submit Product Request for future bookings
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess('');
    
    if (!activeUser) {
      setRequestError('Please login before creating an advance booking.');
      setAuthMode('login');
      setIsAuthOpen(true);
      return;
    }

    const requestPhone = activeUser.phone || '';
    const today = new Date().toISOString().slice(0, 10);
    if (!reqProductName.trim() || !reqTargetDate || reqQuantity < 1) {
      setRequestError('Please supply product name, quantity and a target delivery date.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(requestPhone)) {
      setRequestError('Please sign in or enter a valid Indian mobile number before sending the request.');
      return;
    }
    if (reqTargetDate < today) {
      setRequestError('Target date cannot be in the past.');
      return;
    }

    try {
      await api.createAdvanceRequest({
        userId: activeUser?.id,
        customerName: activeUser.name || 'Customer',
        customerPhone: requestPhone,
        productName: reqProductName.trim(),
        quantity: reqQuantity,
        targetDate: reqTargetDate,
        note: reqNote.trim()
      });
      setRequestSuccess(`🎉 Thank you! Your SVAYIRO future request for "${reqProductName}" has been submitted securely`);
      setReqProductName('');
      setReqQuantity(1);
      setReqTargetDate('');
      setReqNote('');
      onRefreshData();
    } catch (err: any) {
      setRequestError(err.message || 'Submit request failed');
    }
  };

  // Submit user product review
  const handleSubmittingReview = async () => {
    if (!selectedProduct) return;
    if (!activeUser) {
      showToast('Please sign in before reviewing a product.', 'error');
      setIsAuthOpen(true);
      return;
    }
    const activePhone = String(activeUser.phone || '').replace(/\D/g, '');
    const existingReview = reviews.find((review) => {
      if (review.productId !== selectedProduct.id) return false;
      if (activeUser.id && review.userId === activeUser.id) return true;
      return activePhone && String(review.customerPhone || '').replace(/\D/g, '') === activePhone;
    });
    try {
      await api.createReview({
        productId: selectedProduct.id,
        customerName: activeUser?.name || 'Anonymous patron',
        customerPhone: activeUser?.phone,
        rating: tempRating,
        comment: tempComment.trim()
      });
      showToast(existingReview ? 'Rating updated successfully.' : 'Rating submitted successfully. Thank you for the helpful feedback.', 'success');
      setTempComment('');
      setTempRating(5);
      await fetchReviews();
      onRefreshData();
      // reload selected products to refresh reviews
      const updated = products.find(p => p.id === selectedProduct.id);
      if (updated) setSelectedProduct(updated);
    } catch (err: any) {
      showToast(err.message || 'Error publishing review', 'error');
    }
  };

  // Checkout totals calculator
  const totals = useMemo(() => {
    let productTotal = 0;
    let totalWeightGrams = 0;
    const itemsList: { product: Product; quantity: number }[] = [];

    for (const cartItem of cart) {
      const prod = products.find(p => p.id === cartItem.productId);
      if (prod) {
        const activePrice = prod.offerPrice > 0 ? prod.offerPrice : prod.basePrice;
        productTotal += activePrice * cartItem.quantity;
        totalWeightGrams += prod.weight * cartItem.quantity;
        itemsList.push({ product: prod, quantity: cartItem.quantity });
      }
    }

    const sortedBags = bags
      .filter((bag) => bag.isEnabled !== false && Number(bag.capacityGrams) > 0)
      .map((bag) => ({
        ...bag,
        capacityGrams: Number(bag.capacityGrams),
        price: Number(bag.price || 0)
      }));
    let computedBags: CheckoutBagInfo[] = [];
    let bagCost = 0;

    if (bagOption === 'need' && totalWeightGrams > 0 && sortedBags.length > 0) {
      let remaining = totalWeightGrams;
      const ascendingBags = [...sortedBags].sort((a,b) => a.capacityGrams - b.capacityGrams);
      const addComputedBag = (bag: typeof ascendingBags[number], count = 1) => {
        const existing = computedBags.find(b => b.size === bag.size);
        if (existing) {
          existing.count += count;
          existing.cost += count * bag.price;
        } else {
          computedBags.push({ size: bag.size, count, cost: count * bag.price });
        }
      };
      const largestBag = ascendingBags[ascendingBags.length - 1];
      if (remaining > largestBag.capacityGrams) {
        const count = Math.floor(remaining / largestBag.capacityGrams);
        addComputedBag(largestBag, count);
        remaining -= count * largestBag.capacityGrams;
      }
      if (remaining > 0) {
        const fittingBag = ascendingBags.find(b => b.capacityGrams >= remaining) || largestBag;
        addComputedBag(fittingBag, 1);
      }
      bagCost = computedBags.reduce((acc, b) => acc + b.cost, 0);
    }

    // Selected address for distance calculation
    const selectedAddress = (activeUser && activeUser.savedAddresses && activeUser.savedAddresses.length > 0)
      ? activeUser.savedAddresses[selectedAddressIndex]
      : null;
    const deliveryDistanceKm = googleMapsDistanceKm !== null ? googleMapsDistanceKm : 0;

    // Dynamic delivery fees matching shop's configurations
    let deliveryCost = 0;
    if (deliveryMethod === 'delivery' && productTotal > 0 && selectedAddress) {
      const base = shop.baseDeliveryCharge ?? 30;
      const perKm = shop.deliveryChargePerKm ?? 12;
      const freeRadius = Math.max(0, Number(shop.freeDeliveryRadiusKm ?? 0));
      const billableDistanceKm = Math.max(0, deliveryDistanceKm - freeRadius);
      deliveryCost = billableDistanceKm > 0 ? Math.round(base + (billableDistanceKm * perKm)) : 0;
    }

    // Discounts
    let discount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.discountType === 'percentage') {
        discount = Math.round((productTotal * appliedCoupon.discountValue) / 100);
      } else {
        discount = appliedCoupon.discountValue;
      }
    }

    const loyaltyBlockPoints = loyaltyAccount?.redeemBlockPoints || 10;
    const loyaltyBlockValue = loyaltyAccount?.redeemBlockValue || 20;
    const usableLoyaltyPoints = activeUser ? Math.min(loyaltyRedeemPoints, loyaltyAccount?.points || 0) : 0;
    const effectiveLoyaltyPoints = Math.floor(usableLoyaltyPoints / loyaltyBlockPoints) * loyaltyBlockPoints;
    const loyaltyDiscount = effectiveLoyaltyPoints > 0
      ? Math.min(
          Math.max(0, productTotal + bagCost + deliveryCost - discount),
          (effectiveLoyaltyPoints / loyaltyBlockPoints) * loyaltyBlockValue
        )
      : 0;

    const finalTotal = Math.max(0, productTotal + bagCost + deliveryCost - discount - loyaltyDiscount);

    return {
      productTotal,
      totalWeightGrams,
      bagCost,
      deliveryCost,
      discount,
      loyaltyDiscount,
      loyaltyRedeemPoints: loyaltyDiscount > 0 ? effectiveLoyaltyPoints : 0,
      finalTotal,
      computedBags,
      itemsList,
      deliveryDistanceKm
    };
  }, [cart, products, bags, bagOption, deliveryMethod, appliedCoupon, shop, activeUser, loyaltyAccount, loyaltyRedeemPoints, selectedAddressIndex, googleMapsDistanceKm]);

  const loyaltySummary = useMemo(() => {
    if (loyaltyAccount) return loyaltyAccount;
    const validOrders = orders.filter((order) => order.status !== 'cancelled');
    const totalSpend = validOrders.reduce((sum, order) => sum + Number(order.finalTotal ?? (order as any).final_amount ?? 0), 0);
    return {
      totalOrders: validOrders.length,
      totalSpend,
      points: Math.floor(totalSpend / 200),
      earnedPoints: Math.floor(totalSpend / 200),
      redeemedPoints: 0,
      earnRateAmount: 200,
      redeemBlockPoints: 10,
      redeemBlockValue: 20,
      nextRewardAt: 10
    };
  }, [orders, loyaltyAccount]);

  const suggestedCoupons = useMemo(() => {
    const isBirthday = Boolean(activeUser && isEffectiveBirthdayToday(activeUser.dateOfBirth));
    const isFirstOrder = activeUser ? orders.filter((order) => order.status !== 'cancelled').length === 0 : true;
    const currentYear = new Date().getFullYear();
    const hasUsedBirthdayCouponThisYear = orders.some((order) => {
      const code = String(order.couponCode || '').toUpperCase();
      const orderYear = order.createdAt ? new Date(order.createdAt).getFullYear() : 0;
      return order.status !== 'cancelled' && orderYear === currentYear && /(BDAY|BIRTHDAY|BIRTH|HBD)/i.test(code);
    });

    return coupons
      .filter((coupon) => {
        if (!coupon?.code) return false;
        const isWelcome = isWelcomeCouponCode(coupon);
        const hasUsedThisWelcomeCoupon = orders.some((order) => {
          const code = String(order.couponCode || '').toUpperCase();
          return order.status !== 'cancelled' && code === String(coupon.code || '').toUpperCase();
        });
        if (isBirthdayCouponCode(coupon) && !isBirthday) return false;
        if (isBirthdayCouponCode(coupon) && hasUsedBirthdayCouponThisYear) return false;
        if (isWelcome && hasUsedThisWelcomeCoupon) return false;
        if (!isBirthdayCouponCode(coupon) && !isWelcome && coupon.expiryDate && new Date(`${coupon.expiryDate}T23:59:59`).getTime() < Date.now()) return false;
        if (!isBirthdayCouponCode(coupon) && !isWelcome && coupon.usageLimit !== undefined && coupon.usageLimit !== null && Number(coupon.currentUsage || 0) >= Number(coupon.usageLimit)) return false;
        return true;
      })
      .map((coupon) => {
        const code = coupon.code.toUpperCase();
        let priority = totals.productTotal >= Number(coupon.minOrderValue || 0) ? 20 : 0;
        if (isBirthday && isBirthdayCouponCode(coupon)) priority += 80;
        else if (isBirthday && /BDAY|BIRTH|WISH/i.test(code)) priority += 50;
        if (isFirstOrder && /FIRST|NEW|WELCOME/i.test(code)) priority += 45;
        if (coupon.discountType === 'percentage') priority += Math.min(20, Number(coupon.discountValue || 0));
        else priority += Math.min(20, Number(coupon.discountValue || 0) / 10);
        return { coupon, priority };
      })
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.coupon)
      .slice(0, 6);
  }, [activeUser, coupons, orders, totals.productTotal]);

  const isBirthdayTodayForActiveUser = Boolean(activeUser && isEffectiveBirthdayToday(activeUser.dateOfBirth));

  const handleUseCoupon = (code: string) => {
    setCouponCode(code.toUpperCase());
    setCouponError('');
    setActiveTab('cart');
    showToast(`Coupon ${code.toUpperCase()} copied to checkout. Tap Verify to apply.`, 'info');
  };

  // Execute purchase
  const handlePlaceOrder = async () => {
    setCheckoutError('');
    if (!activeUser) {
      setIsAuthOpen(true);
      return;
    }
    const customerPhoneDigits = String(activeUser.phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(customerPhoneDigits)) {
      setCheckoutError('Valid 10-digit customer phone number is required before invoice generation.');
      showToast('Valid 10-digit customer phone number is required before invoice generation.', 'error');
      return;
    }

    if (deliveryMethod === 'delivery') {
      if (activeUser.savedAddresses.length === 0) {
        setCheckoutError('Please provide a delivery address.');
        return;
      }
      const activeAddress = activeUser.savedAddresses[selectedAddressIndex];
      if (!activeAddress) {
        setCheckoutError('Please select or register a delivery address.');
        return;
      }
      if (!activeAddress.lat || !activeAddress.lng) {
        setCheckoutError('Please pin your exact delivery location before checkout.');
        return;
      }
      if (googleMapsDistanceKm === null) {
        setCheckoutError('Exact Google Maps road distance is required before checkout. Please select a pinned shop branch and pinned customer address.');
        return;
      }
      const dist = googleMapsDistanceKm;
      if (dist > (shop.deliveryRadius || 10)) {
        setCheckoutError(`Selected delivery address (${dist} km) exceeds our maximum delivery radius of ${shop.deliveryRadius || 10} km. Please select/register another address within range.`);
        return;
      }
    }

    if (paymentMethod === 'upi') {
      setUpiReference(''); // Start empty so customer is forced to type real transaction ID/UTR
      setUpiPaymentStep('redirecting');
      setUpiPaymentId(null);
      setUpiPaymentUrl(generatedUpiUrl);

      try {
        const upiPayload = {
          userId: activeUser.id,
          customerName: activeUser.name,
          customerPhone: customerPhoneDigits,
          deliveryMethod,
          shopBranchId: selectedShopBranchId || null,
          deliveryAddress: deliveryMethod === 'delivery' ? activeUser.savedAddresses[selectedAddressIndex] : null,
          selectedSlot,
          bagOption,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          deliveryCharge: totals.deliveryCost,
          bagCharge: totals.bagCost,
          discountAmount: totals.discount,
          finalAmount: totals.finalTotal,
          loyaltyRedeemPoints: totals.loyaltyRedeemPoints,
          items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod: 'upi' as const,
          paymentStatus: 'submitted' as const,
          upiReference: null
        };

        setPendingUpiOrderPayload(upiPayload);

        try {
          window.location.href = generatedUpiUrl;
        } catch (e) {
          console.warn('Iframe redirection limit fallback', e);
        }
      } catch (err: any) {
        const errMsg = err.message || 'Unable to initiate UPI payment';
        setCheckoutError(errMsg);
        showToast(errMsg, 'error');
        setUpiPaymentStep('idle');
        setPendingUpiOrderPayload(null);
        return;
      }

      setTimeout(() => {
        setUpiPaymentStep('waiting');
      }, 1500);
      return;
    }

    setIsPlacingOrder(true);
    try {
      const activeAddress = deliveryMethod === 'delivery' ? activeUser.savedAddresses[selectedAddressIndex] : null;
      
      const payload = {
        userId: activeUser.id,
        customerName: activeUser.name,
        customerPhone: customerPhoneDigits,
        deliveryMethod,
        shopBranchId: selectedShopBranchId || null,
        deliveryAddress: activeAddress,
        selectedSlot,
        bagOption,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        deliveryCharge: totals.deliveryCost,
        bagCharge: totals.bagCost,
        discountAmount: totals.discount,
        finalAmount: totals.finalTotal,
        loyaltyRedeemPoints: totals.loyaltyRedeemPoints,
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
        paymentMethod,
        upiReference: null
      };

      const res = await api.placeOrder(payload);
      if (res.success && res.order) {
        setLastPlacedOrder(res.order);
        clearCart(true);
        setAppliedCoupon(null);
        setCouponSuccessMessage('');
        setCouponCode('');
        setUpiReference('');
        setIsCheckoutOpen(false);
        setActiveTab('orders');
        fetchUserOrders();
        fetchLoyaltySummary();
        onRefreshData();
        showToast('🎉 Order placed successfully! Thank you for shopping with us.', 'success');
      }
    } catch (err: any) {
      const errMsg = err.message || 'Fatal error processing order transaction levels.';
      setCheckoutError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleFinalizeUpiOrder = async (refVal?: string) => {
    const finalRef = (refVal || upiReference || '').trim();
    
    try {
      if (!pendingUpiOrderPayload) {
        setUpiPaymentStep('idle');
        throw new Error('No pending UPI checkout found. Please start checkout again.');
      }
      if (!/^[A-Za-z0-9-]{8,30}$/.test(finalRef)) {
        throw new Error('Enter the real UPI transaction reference before submitting payment.');
      }

      setIsPlacingOrder(true);
      const orderRes = await api.placeOrder({
        ...pendingUpiOrderPayload,
        paymentStatus: 'submitted',
        upiReference: finalRef
      });
      if (!orderRes.success || !orderRes.order) {
        throw new Error('Failed to place UPI order.');
      }

      setLastPlacedOrder(orderRes.order);
      clearCart(true);
      setAppliedCoupon(null);
      setCouponSuccessMessage('');
      setCouponCode('');
      setUpiReference('');
      setUpiPaymentId(null);
      setUpiPaymentUrl('');
      setPendingUpiOrderPayload(null);

      setTimeout(() => {
        setUpiPaymentStep('success');
        setTimeout(() => {
          setUpiPaymentStep('idle');
          setIsCheckoutOpen(false);
          setActiveTab('orders');
          fetchUserOrders();
          fetchLoyaltySummary();
          onRefreshData();
          showToast('UPI reference submitted. Order is placed and waiting for owner payment verification.', 'success');
        }, 1200);
      }, 200);
    } catch (err: any) {
      if (pendingUpiOrderPayload) {
        setUpiPaymentStep('waiting');
      }
      const errMsg = err.message || 'Fatal error processing UPI order finalize.';
      setCheckoutError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceUpiOrderDirectly = async (utr: string) => {
    if (!activeUser) {
      setIsAuthOpen(true);
      showToast('Please sign in to place your order with the scanned payment.', 'warning');
      throw new Error('Customer authentication required. Please sign in.');
    }
    if (cart.length === 0) {
      showToast('Your shopping bag is empty. Add items to bag before completing checkout.', 'error');
      throw new Error('Your shopping bag is empty.');
    }

    await handleFinalizeUpiOrder(utr);
    setIsQrScannerOpen(false);
  };

  const handleCancelUpiPayment = () => {
    setPendingUpiOrderPayload(null);
    setUpiPaymentId(null);
    setUpiPaymentUrl('');
    setUpiReference('');
    setUpiPaymentStep('idle');
    showToast('UPI payment cancelled. Your order was not placed.', 'info');
  };

  // Manual confirmation wait pattern - no automatic timer finalize to avoid fake completions
    useEffect(() => {
      // Intentional empty hook - auto-timer is removed to prevent fake success states.
    }, [upiPaymentStep]);

  // Generate UPI deep links
  const generatedUpiUrl = useMemo(() => {
    const upiId = (shop.upiId || 'svayiro.essentials@upi').trim();
    // Clean name: keep only letters and numbers to avoid space encoding issues in scanning apps
    const merchantName = (shop.name || 'SVAYIRO').replace(/[^a-zA-Z0-9]/g, '');
    // Standard decimal formatting (exactly 2 decimal places) for strict banking apps
    const amount = Number(totals.finalTotal).toFixed(2);
    // Clean alphanumeric reference ID
    const referee = generateId('ref').replace(/[^a-zA-Z0-9]/g, '');
    
    return `upi://pay?pa=${upiId}&pn=${merchantName}&am=${amount}&cu=INR&tn=OrderPayment&tr=${referee}`;
  }, [shop.name, shop.upiId, totals.finalTotal]);

  // Home catalog only follows category selection. Search has its own results page.
  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (selectedCategory) {
      const allowedCategoryIds = new Set<string>([selectedCategory]);
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
      list = list.filter((p) => {
        const assignedCategoryIds = Array.from(new Set([p.categoryId, (p as any).subcategoryId, ...(p.categoryIds || [])].filter(Boolean) as string[]));
        return assignedCategoryIds.some((categoryId) => allowedCategoryIds.has(categoryId));
      });
    }
    return list.filter(p => p.isEnabled);
  }, [products, categories, selectedCategory]);

  const searchResultsProducts = useMemo(() => {
    const query = submittedSearchQuery.trim().toLowerCase();
    let list = query && serverFilteredProducts ? [...serverFilteredProducts] : [...products];

    if (query && !serverFilteredProducts) {
      list = list.filter((p) => {
        const categoryName = Array.from(new Set([p.categoryId, (p as any).subcategoryId, ...(p.categoryIds || [])].filter(Boolean) as string[]))
          .map((categoryId) => categories.find((cat) => cat.id === categoryId)?.name)
          .filter(Boolean)
          .join(' ');
        const haystack = [
          p.name,
          p.description,
          p.sku,
          categoryName,
          ...(p.metadata?.keywords || []),
          ...(p.metadata?.tags || [])
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        return haystack.includes(query);
      });
    }

    const enabled = list.filter(p => p.isEnabled);
    const priceOf = (p: Product) => Number(p.offerPrice > 0 ? p.offerPrice : p.basePrice);
    if (searchSort === 'price_low') return [...enabled].sort((a, b) => priceOf(a) - priceOf(b));
    if (searchSort === 'price_high') return [...enabled].sort((a, b) => priceOf(b) - priceOf(a));
    if (searchSort === 'newest') return [...enabled].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return enabled;
  }, [products, categories, submittedSearchQuery, serverFilteredProducts, searchSort]);

  // Wishlisted products subset
  const wishlistedProducts = useMemo(() => {
    if (!activeUser) return [];
    return products.filter(p => activeUser.wishlist.includes(p.id));
  }, [products, activeUser]);

  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    const synonymMap: Record<string, string[]> = {
      atta: ['flour', 'wheat', 'chapati', 'roti', 'stone ground'],
      flour: ['atta', 'wheat', 'maida', 'besan'],
      rice: ['sona', 'basmati', 'akki', 'chawal'],
      dal: ['lentil', 'pulse', 'toor', 'moong', 'urad', 'gram'],
      pulses: ['dal', 'lentil', 'gram', 'beans'],
      oil: ['cooking oil', 'groundnut', 'sunflower', 'mustard'],
      ghee: ['clarified butter', 'butter'],
      sugar: ['jaggery', 'sweetener'],
      jaggery: ['sugar', 'bella', 'gud'],
      ragi: ['finger millet', 'millet'],
      millet: ['ragi', 'jowar', 'bajra'],
      spice: ['masala', 'powder'],
      masala: ['spice', 'powder']
    };

    const queryWords = query.split(/\s+/).filter(Boolean);
    const expandedWords = new Set<string>(queryWords);
    for (const word of queryWords) {
      for (const mapped of synonymMap[word] || []) {
        expandedWords.add(mapped);
      }
    }

    return products
      .filter((product) => product.isEnabled)
      .map((product) => {
        const categoryName = categories.find((cat) => cat.id === product.categoryId)?.name || '';
        const haystack = [
          product.name,
          product.description,
          product.sku,
          categoryName,
          ...(product.metadata?.keywords || []),
          ...(product.metadata?.tags || [])
        ].map((value) => String(value || '').toLowerCase()).join(' ');

        let score = 0;
        if (String(product.name || '').toLowerCase().includes(query)) score += 8;
        if (haystack.includes(query)) score += 5;
        for (const word of expandedWords) {
          if (haystack.includes(word)) score += queryWords.includes(word) ? 3 : 1;
        }
        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, 6)
      .map((item) => item.product);
  }, [products, categories, searchQuery]);

  const searchPlaceholderItems = useMemo(() => {
    const popularGroceryNames = [
      'atta',
      'rice',
      'dal',
      'cooking oil',
      'ghee',
      'sugar',
      'jaggery',
      'ragi',
      'jowar',
      'millets',
      'spices',
      'dry fruits',
      'fresh vegetables',
      'fruits',
      'dairy products'
    ];
    const cleanName = (name: string) => name
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b\d+(\.\d+)?\s*(kg|kgs|g|gm|gms|gram|grams|l|ltr|litre|litres|ml|pack|pcs|piece|pieces)\b/gi, ' ')
      .replace(/\b\d+\s*[xX]\s*\d+\b/g, ' ')
      .replace(/\b\d+(\.\d+)?\b/g, ' ')
      .replace(/\b(premium|special|organic|natural|fresh|pure|best|new|combo|offer|loose|packet|pack)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const scoredProducts = products
      .filter((product) => product.isEnabled)
      .map((product) => ({
        name: cleanName(product.name || ''),
        score: (product.isDailyEssential ? 3 : 0) + (product.isFeatured ? 2 : 0) + (product.stockCount > 0 ? 1 : 0)
      }))
      .filter((item) => item.name.length > 1)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const productNames = scoredProducts.map((item) => item.name);
    const categoryNames = categories
      .filter((category) => !category.parentId)
      .map((category) => cleanName(category.name || ''))
      .filter((name) => name.length > 1);

    return Array.from(new Set([...popularGroceryNames, ...productNames, ...categoryNames]))
      .filter((name) => name.length > 1 && name.length <= 24)
      .slice(0, 14);
  }, [products, categories]);

  const saveSearchHistory = (term: string) => {
    const cleanTerm = term.trim();
    if (cleanTerm.length < 2) return;
    setSearchHistory((current) => [cleanTerm, ...current.filter((item) => item.toLowerCase() !== cleanTerm.toLowerCase())].slice(0, 8));
  };

  const removeSearchHistory = (term: string) => {
    setSearchHistory((current) => current.filter((item) => item !== term));
  };

  const markNotificationsRead = (ids: string[]) => {
    if (ids.length === 0) return;
    setReadNotificationIds((current) => Array.from(new Set([...current, ...ids])).slice(-300));
  };

  const protectedTabs = new Set<CustomerTab>(['wishlist', 'cart', 'orders', 'profile']);
  const requireCustomerLogin = (target: string) => {
    if (activeUser) return true;
    setIsAuthOpen(true);
    showToast(`Please sign in to open ${target}.`, 'warning');
    return false;
  };

  const setProtectedActiveTab = (tab: CustomerTab) => {
    if (protectedTabs.has(tab) && !requireCustomerLogin(tab === 'cart' ? 'shopping bag' : tab)) return;
    setActiveTab(tab);
  };

  const setProtectedCheckoutOpen = (open: boolean) => {
    if (open && !requireCustomerLogin('checkout')) return;
    setIsCheckoutOpen(open);
  };

  useEffect(() => {
    if (!activeUser && protectedTabs.has(activeTab)) {
      setActiveTab('home');
    }
  }, [activeUser, activeTab]);

  function generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const openAdvanceRequest = (open: boolean) => {
    if (!open) {
      setIsRequestOpen(false);
      return;
    }
    if (!activeUser) {
      setRequestError('');
      setRequestSuccess('');
      setAuthMode('login');
      setIsAuthOpen(true);
      showToast('Please login before creating an advance booking.', 'warning');
      return;
    }
    setIsRequestOpen(true);
  };

  // Utility to handle shop closed status message
  const isShopClosed = shop.isOpen === false;

  return (
    <div className={`flex-1 flex flex-col pb-24 md:pb-12 overflow-x-clip ${isDarkMode ? 'bg-[#0f172a] text-[#f8fafc]' : 'bg-[#f8fafc] text-[#0f172a]'}`}>

      {/* Shared Common Header */}
      <CustomerHeader 
        shop={shop}
        activeUser={activeUser}
        cartCount={cart.length}
        wishlistCount={wishlistedProducts.length}
        activeTab={activeTab}
        setActiveTab={setProtectedActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSearchLoading={isSearchingProducts}
        searchDelayEnabled={searchUseDelay}
        searchSuggestions={searchSuggestions}
        searchPlaceholderItems={searchPlaceholderItems}
        searchHistory={searchHistory}
        onSubmitSearch={(term) => {
          const cleanTerm = term.trim();
          if (!cleanTerm) return;
          setSearchQuery(cleanTerm);
          setSubmittedSearchQuery(cleanTerm);
          saveSearchHistory(cleanTerm);
          setProtectedActiveTab('search');
        }}
        onClearSearch={() => {
          setSubmittedSearchQuery('');
          if (activeTab === 'search') {
            setActiveTab('home');
          }
        }}
        onRemoveHistory={removeSearchHistory}
        notifications={notifications}
        readNotificationIds={readNotificationIds}
        onMarkNotificationsRead={markNotificationsRead}
        onSelectSuggestion={(product) => {
          saveSearchHistory(searchQuery || product.name);
          setSelectedProduct(product);
        }}
        isDarkMode={isDarkMode}
        setIsAuthOpen={setIsAuthOpen}
        setIsRequestOpen={openAdvanceRequest}
      />
      <div
        aria-hidden="true"
        className={`${activeTab === 'home' || activeTab === 'search' ? 'h-[118px]' : 'h-[72px]'} shrink-0 md:h-[126px]`}
      />

      {/* Main Container */}
      <main className="flex-1 w-full px-4 py-6 flex flex-col">
        <Suspense fallback={<CustomerViewLoader />}>
        
        {/* Tab views conditional mapping */}
        {selectedProduct ? (
          <ProductDetailView 
            selectedProduct={selectedProduct}
            products={products}
            setSelectedProduct={setSelectedProduct}
            activeUser={activeUser}
            toggleWishlist={toggleWishlist}
            categories={categories}
            isDarkMode={isDarkMode}
            detailQty={detailQty}
            setDetailQty={setDetailQty}
            activeImageIndex={activeImageIndex}
            setActiveImageIndex={setActiveImageIndex}
            addToCart={addToCart}
            tempRating={tempRating}
            setTempRating={setTempRating}
            tempComment={tempComment}
            setTempComment={setTempComment}
            handleSubmittingReview={handleSubmittingReview}
            reviews={reviews}
            onShareProduct={handleShareProduct}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView 
                shop={shop}
                isShopClosed={isShopClosed}
                banners={banners}
                currentBannerIndex={currentBannerIndex}
                setCurrentBannerIndex={setCurrentBannerIndex}
                categories={categories}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                products={products}
                filteredProducts={homeProducts || filteredProducts}
                productPage={homeProductPage}
                onChangeProductPage={onChangeHomeProductPage}
                cart={cart}
                updateCartQty={updateCartQty}
                addToCart={addToCart}
                setSelectedProduct={setSelectedProduct}
                toggleWishlist={toggleWishlist}
                activeUser={activeUser}
                isDarkMode={isDarkMode}
                onShareProduct={handleShareProduct}
                isBirthdayToday={isBirthdayTodayForActiveUser}
                loyaltySummary={loyaltySummary}
                suggestedCoupons={suggestedCoupons}
                onUseCoupon={handleUseCoupon}
              />
            )}

            {activeTab === 'search' && (
              <SearchResultsView
                query={submittedSearchQuery || searchQuery}
                products={searchResultsProducts}
                categories={categories}
                cart={cart}
                updateCartQty={updateCartQty}
                addToCart={(pId) => addToCart(pId, 1)}
                setSelectedProduct={setSelectedProduct}
                toggleWishlist={toggleWishlist}
                activeUser={activeUser}
                isDarkMode={isDarkMode}
                onShareProduct={handleShareProduct}
                searchSort={searchSort}
                setSearchSort={setSearchSort}
              />
            )}

        {activeTab === 'categories' && (
          <CategoriesView 
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            setActiveTab={setProtectedActiveTab}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'wishlist' && (
          <WishlistView 
            wishlistedProducts={wishlistedProducts}
            toggleWishlist={toggleWishlist}
            addToCart={(pId) => addToCart(pId, 1)}
            setActiveTab={setProtectedActiveTab}
            isDarkMode={isDarkMode}
            onShareProduct={handleShareProduct}
            onSelectProduct={setSelectedProduct}
          />
        )}

        {activeTab === 'cart' && (
          <CartView 
            cart={cart}
            products={products}
            totals={totals}
            updateCartQty={updateCartQty}
            removeFromCart={removeFromCart}
            clearCart={() => clearCart()}
            setActiveTab={setProtectedActiveTab}
            bagOption={bagOption}
            setBagOption={setBagOption}
            appliedCoupon={appliedCoupon}
            isShopClosed={isShopClosed}
            activeUser={activeUser}
            setIsAuthOpen={setIsAuthOpen}
            setIsCheckoutOpen={setProtectedCheckoutOpen}
            isDarkMode={isDarkMode}
            shop={shop}
            deliveryMethod={deliveryMethod}
            setDeliveryMethod={handleSetDeliveryMethod}
            selectedAddressIndex={selectedAddressIndex}
            setSelectedAddressIndex={setSelectedAddressIndex}
            selectedShopBranchId={selectedShopBranchId}
            setSelectedShopBranchId={setSelectedShopBranchId}
            isCalculatingDistance={isCalculatingDistance}
            googleMapsDistanceText={googleMapsDistanceText}
            googleMapsDurationText={googleMapsDurationText}
            suggestedCoupons={suggestedCoupons}
            onUseCoupon={handleUseCoupon}
            loyaltySummary={loyaltySummary}
            loyaltyRedeemPoints={loyaltyRedeemPoints}
            setLoyaltyRedeemPoints={setLoyaltyRedeemPoints}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView 
            activeUser={activeUser}
            orders={orders}
            loadingOrders={loadingOrders}
            products={products}
            fetchUserOrders={fetchUserOrders}
            setOrders={setOrders}
            onRefreshData={onRefreshData}
            showToast={showToast}
            setActiveTab={setProtectedActiveTab}
            clearCart={() => clearCart(true)}
            addToCart={(pId, qty) => addToCart(pId, qty, true)}
            isDarkMode={isDarkMode}
            setIsAuthOpen={setIsAuthOpen}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView 
            activeUser={activeUser}
            setIsAuthOpen={setIsAuthOpen}
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            setActiveTab={setProtectedActiveTab}
            isDarkMode={isDarkMode}
            onRefreshData={onRefreshData}
            shop={shop}
            enableSound={enableSound}
            setEnableSound={setEnableSound}
            enableLocalAlerts={enableLocalAlerts}
            setEnableLocalAlerts={setEnableLocalAlerts}
            newsletterSubscribed={newsletterSubscribed}
            setNewsletterSubscribed={setNewsletterSubscribed}
            handleSaveAddress={handleSaveAddress}
            handleDeleteAddress={handleDeleteAddress}
            isAddingAddress={isAddingAddress}
            setIsAddingAddress={setIsAddingAddress}
            newAddress={newAddress}
            setNewAddress={setNewAddress}
            onSwitchMode={onSwitchMode}
            onLogout={onLogout}
            showToast={showToast}
            loyaltySummary={loyaltySummary}
            suggestedCoupons={suggestedCoupons}
            onUseCoupon={handleUseCoupon}
          />
        )}
          </>
        )}
        </Suspense>

      </main>

      {/* Shared Customer Footer */}
      <CustomerFooter 
        shop={shop}
        activeUser={activeUser}
        activeTab={activeTab}
        setActiveTab={setProtectedActiveTab}
        isDarkMode={isDarkMode}
        setIsAuthOpen={setIsAuthOpen}
        setIsRequestOpen={openAdvanceRequest}
        onSwitchMode={onSwitchMode ? () => onSwitchMode('admin') : undefined}
      />

      {/* Sticky Bottom Native-Style Tab Rail (for Mobile Users) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 border-t z-40 transition-all backdrop-blur-xl ${
        isDarkMode
          ? 'border-[#1e293b] bg-[#0f172a]/95 shadow-[0_-12px_35px_rgba(0,0,0,0.35)]'
          : 'border-slate-200 bg-white/95 shadow-[0_-12px_35px_rgba(15,23,42,0.10)]'
      }`}>
        <div className="max-w-md mx-auto flex justify-around items-center py-2 px-1">
          <button 
            onClick={() => setProtectedActiveTab('home')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <Store className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Store</span>
          </button>
          
          <button 
            onClick={() => setProtectedActiveTab('wishlist')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors relative ${activeTab === 'wishlist' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <Heart className="h-5 w-5" />
            {activeUser && activeUser.wishlist.length > 0 && (
              <span className="absolute top-1 right-2 bg-rose-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeUser.wishlist.length}</span>
            )}
            <span className="text-[10px] font-semibold">Wishlist</span>
          </button>

          <button 
            onClick={() => setProtectedActiveTab('cart')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors relative ${activeTab === 'cart' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <ShoppingBag className="h-5 w-5" />
            {cart.length > 0 && (
              <span className="absolute top-1 right-1 bg-indigo-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{cart.length}</span>
            )}
            <span className="text-[10px] font-semibold">Bag</span>
          </button>

          <button 
            onClick={() => setProtectedActiveTab('orders')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'orders' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <FileText className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Orders</span>
          </button>

          <button 
            onClick={() => setProtectedActiveTab('profile')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <User className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
        </div>
      </nav>

      {/* Modular Modals */}
      <AuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        isDarkMode={isDarkMode}
        shop={shop}
        authName={authName}
        setAuthName={setAuthName}
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        authPhone={authPhone}
        setAuthPhone={setAuthPhone}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authDob={authDob}
        setAuthDob={setAuthDob}
        authTermsAccepted={authTermsAccepted}
        setAuthTermsAccepted={setAuthTermsAccepted}
        authMode={authMode}
        setAuthMode={(mode) => {
          setAuthMode(mode);
          setAuthError('');
          setIsOtpSent(false);
          setAuthOtp('');
          setOtpExpiresAt(null);
          setOtpResendAt(null);
          setOtpSecondsLeft(0);
        }}
        isOtpSent={isOtpSent}
        otpSentMessage={otpSentMessage}
        authOtp={authOtp}
        setAuthOtp={setAuthOtp}
        authError={authError}
        handleRequestOtp={handleRequestOtp}
        handleRequestRegistrationOtp={handleRequestRegistrationOtp}
        handleRegisterCustomer={handleRegisterCustomer}
        handleCustomerLogin={handleCustomerLogin}
        handleResetPassword={handleResetPassword}
        otpSecondsLeft={otpSecondsLeft}
        canResendOtp={!otpResendAt || Date.now() >= otpResendAt}
      />

      <CheckoutModal 
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        isDarkMode={isDarkMode}
        shop={shop}
        totals={totals}
        activeUser={activeUser}
        deliveryMethod={deliveryMethod}
        setDeliveryMethod={handleSetDeliveryMethod}
        selectedSlot={selectedSlot}
        setSelectedSlot={setSelectedSlot}
        selectedAddressIndex={selectedAddressIndex}
        setSelectedAddressIndex={setSelectedAddressIndex}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        handleApplyCoupon={handleApplyCoupon}
        couponError={couponError}
        couponSuccessMessage={couponSuccessMessage}
        appliedCoupon={appliedCoupon}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        generatedUpiUrl={generatedUpiUrl}
        upiReference={upiReference}
        setUpiReference={setUpiReference}
        isPlacingOrder={isPlacingOrder}
        handlePlaceOrder={handlePlaceOrder}
        checkoutError={checkoutError}
        setActiveTab={setProtectedActiveTab}
        bagOption={bagOption}
        setBagOption={setBagOption}
        showToast={showToast}
        handleSaveAddress={handleSaveAddress}
        handleDeleteAddress={handleDeleteAddress}
        isAddingAddress={isAddingAddress}
        setIsAddingAddress={setIsAddingAddress}
        newAddress={newAddress}
        setNewAddress={setNewAddress}
        isCalculatingDistance={isCalculatingDistance}
        googleMapsDistanceText={googleMapsDistanceText}
        googleMapsDurationText={googleMapsDurationText}
        selectedShopBranchId={selectedShopBranchId}
        setSelectedShopBranchId={setSelectedShopBranchId}
        upiPaymentStep={upiPaymentStep}
        setUpiPaymentStep={setUpiPaymentStep}
        upiCountdown={upiCountdown}
        handleFinalizeUpiOrder={handleFinalizeUpiOrder}
        onCancelUpiPayment={handleCancelUpiPayment}
        suggestedCoupons={suggestedCoupons}
        onUseCoupon={handleUseCoupon}
      />

      <AdvanceRequestModal 
        isOpen={isRequestOpen}
        onClose={() => {
          setIsRequestOpen(false);
          setRequestSuccess('');
          setRequestError('');
        }}
        isDarkMode={isDarkMode}
        reqProductName={reqProductName}
        setReqProductName={setReqProductName}
        reqQuantity={reqQuantity}
        setReqQuantity={setReqQuantity}
        reqTargetDate={reqTargetDate}
        setReqTargetDate={setReqTargetDate}
        reqNote={reqNote}
        setReqNote={setReqNote}
        requestError={requestError}
        requestSuccess={requestSuccess}
        handleRequestSubmit={handleRequestSubmit}
      />

      <QrScannerModal 
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        shopName={shop.name}
        shopUpiId={shop.upiId}
        isDarkMode={isDarkMode}
        showToast={showToast}
        currentCartTotal={totals.finalTotal}
        handlePlaceUpiOrderDirectly={handlePlaceUpiOrderDirectly}
      />

    </div>
  );
}
