import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Compass, MapPin, MessageSquare, HelpCircle, Info, Settings, 
  ChevronRight, Star, Phone, Check, Trash2, ShieldCheck, BookOpen, 
  Sliders, LogOut, Heart, Map, ArrowRight, Menu, X, FileText,
  AlertTriangle, Clock, CheckCircle, XCircle, Ticket, Mail, Globe,
  Smartphone, Monitor, Bell, Volume2, Wifi, ArrowLeft, BadgePercent, Sparkles, Copy, Trophy, Gift
} from 'lucide-react';
import { Category, Coupon, CustomerTab, ShopProfile, User as UserType } from '../../types';
import { api } from '../../api';
import { commonStyles } from './commonStyles';
import { getDistrictsForState, getTaluksForDistrict } from '../../data/indianPlaces';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '../ui/shadcn';
import GoogleMapPicker from './GoogleMapPicker';
import TermsContent from './TermsContent';
import StoreStory from './StoreStory';
import { disablePushNotifications, enablePushNotifications } from '../../utils/pushNotifications';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", 
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", 
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", 
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", 
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", 
  "Ladakh", "Lakshadweep", "Puducherry"
];

function isBirthdayCoupon(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'birthday' || metadata.birthdayOnly === true || /(BDAY|BIRTHDAY|BIRTH|HBD)/i.test(coupon.code || '');
}

function isReferralCoupon(coupon: Coupon) {
  const metadata = coupon.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  return type === 'referral' || metadata.referralOnly === true || /(REFER|REFERRAL|FRIEND)/i.test(coupon.code || '');
}

function couponValueText(coupon: Coupon) {
  return coupon.discountType === 'percentage'
    ? `${coupon.discountValue}% off`
    : `Rs ${coupon.discountValue} off`;
}

interface ProfileViewProps {
  activeUser: UserType | null;
  setIsAuthOpen: (open: boolean) => void;
  categories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  setActiveTab: (tab: CustomerTab) => void;
  isDarkMode: boolean;
  onRefreshData: () => void;
  shop: ShopProfile;
  enableSound: boolean;
  setEnableSound: (enable: boolean) => void;
  enableLocalAlerts: boolean;
  setEnableLocalAlerts: (enable: boolean) => void;
  newsletterSubscribed: boolean;
  setNewsletterSubscribed: (sub: boolean) => void;
  handleSaveAddress: () => Promise<void>;
  handleDeleteAddress: (addressId: string, index?: number) => Promise<void>;
  isAddingAddress: boolean;
  setIsAddingAddress: (adding: boolean) => void;
  newAddress: any;
  setNewAddress: (addr: any) => void;
  onSwitchMode?: (mode: 'customer' | 'admin') => void;
  onLogout?: () => void;
  showToast?: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  loyaltySummary?: {
    points: number;
    totalSpend: number;
    totalOrders: number;
    nextRewardAt?: number;
    earnRateAmount?: number;
    redeemBlockPoints?: number;
    redeemBlockValue?: number;
  };
  suggestedCoupons?: Coupon[];
  onUseCoupon?: (code: string) => void;
}

export default function ProfileView({
  activeUser,
  setIsAuthOpen,
  categories,
  selectedCategory,
  setSelectedCategory,
  setActiveTab,
  isDarkMode,
  onRefreshData,
  shop,
  enableSound,
  setEnableSound,
  enableLocalAlerts,
  setEnableLocalAlerts,
  newsletterSubscribed,
  setNewsletterSubscribed,
  handleSaveAddress,
  handleDeleteAddress,
  isAddingAddress,
  setIsAddingAddress,
  newAddress,
  setNewAddress,
  onSwitchMode,
  onLogout,
  showToast,
  loyaltySummary,
  suggestedCoupons = [],
  onUseCoupon
}: ProfileViewProps) {
  const [profileSubSection, setProfileSubSection] = useState<'menu' | 'addresses' | 'feedback' | 'complaints' | 'referrals' | 'help' | 'terms' | 'about' | 'settings'>('menu');
  const profileContentRef = useRef<HTMLDivElement | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackType, setFeedbackType] = useState<'feedback' | 'support'>('feedback');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  
  // Complaint/Ticketing state
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('delivery');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [complaintPriority, setComplaintPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [complaintSuccess, setComplaintSuccess] = useState('');
  const [complaintError, setComplaintError] = useState('');
  const [pushSaving, setPushSaving] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqQuestionLoading, setFaqQuestionLoading] = useState(false);
  const [faqQuestionSuccess, setFaqQuestionSuccess] = useState('');
  const [faqQuestionError, setFaqQuestionError] = useState('');
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountText, setDeleteAccountText] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [referralInfo, setReferralInfo] = useState<{ code: string; referrals: any[]; leaderboard: any[]; receivedReferral?: any } | null>(null);
  const [referralInput, setReferralInput] = useState('');
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMessage, setReferralMessage] = useState('');
  const [referralError, setReferralError] = useState('');
  const rewardPoints = loyaltySummary?.points || 0;
  const nextRewardAt = loyaltySummary?.nextRewardAt || 100;
  const pointsUntilReward = activeUser ? Math.max(0, nextRewardAt - (rewardPoints % nextRewardAt || nextRewardAt)) : nextRewardAt;
  const rewardProgress = activeUser ? Math.min(100, ((rewardPoints % nextRewardAt) / nextRewardAt) * 100) : 0;
  const referralCoupons = suggestedCoupons.filter(isReferralCoupon);
  const regularCoupons = suggestedCoupons.filter((coupon) => !isBirthdayCoupon(coupon) && !isReferralCoupon(coupon));

  // Load user tickets
  useEffect(() => {
    if (activeUser && profileSubSection === 'complaints') {
      loadUserTickets();
    }
  }, [activeUser, profileSubSection]);

  useEffect(() => {
    if (activeUser && profileSubSection === 'help') {
      loadUserTickets();
    }
  }, [activeUser, profileSubSection]);

  useEffect(() => {
    if (activeUser && profileSubSection === 'referrals') {
      loadReferralInfo();
    }
  }, [activeUser, profileSubSection]);

  const loadUserTickets = async () => {
    if (!activeUser) return;
    try {
      const data = await api.getComplaints(activeUser.phone);
      setUserTickets(data.tickets || []);
    } catch (err) {
      console.error('Failed to load tickets', err);
    }
  };

  const loadReferralInfo = async () => {
    if (!activeUser) return;
    setReferralLoading(true);
    setReferralError('');
    try {
      const data = await api.getMyReferrals();
      setReferralInfo(data);
    } catch (err: any) {
      setReferralError(err.message || 'Failed to load referral details');
    } finally {
      setReferralLoading(false);
    }
  };

  const handleApplyReferralCode = async () => {
    setReferralMessage('');
    setReferralError('');
    const cleanCode = referralInput.trim().toUpperCase();
    if (!cleanCode) {
      setReferralError('Enter the referral code you received.');
      return;
    }
    try {
      await api.applyReferralCode(cleanCode);
      setReferralInput('');
      setReferralMessage('Referral linked. Reward unlocks after your first UPI-paid order of Rs 100 or more.');
      loadReferralInfo();
    } catch (err: any) {
      setReferralError(err.message || 'Failed to apply referral code');
    }
  };

  const getReferralInviteText = () => {
    const code = referralInfo?.code || '';
    const configuredUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
    const fallbackUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
    const isLocalUrl = (url: string) => /localhost|127\.0\.0\.1/i.test(url);
    const appUrl = ((configuredUrl && !isLocalUrl(configuredUrl)) ? configuredUrl : fallbackUrl).replace(/\/$/, '');
    const inviteUrl = appUrl && code ? `${appUrl}?ref=${encodeURIComponent(code)}` : appUrl;
    return [
      `You are invited to shop with SVAYIRO.`,
      `Use referral code ${code} after registration.`,
      `Referral rewards unlock only after the new customer completes a UPI-paid order of Rs 100 or more.`,
      inviteUrl ? `Visit SVAYIRO: ${inviteUrl}` : ''
    ].filter(Boolean).join('\n');
  };

  const handleShareReferralInvite = async () => {
    if (!referralInfo?.code) {
      showToast?.('Referral code is still loading. Tap Refresh and try again.', 'warning');
      return;
    }
    const text = getReferralInviteText();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'SVAYIRO Refer & Win',
          text
        });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast?.('Invite message copied. Paste it in WhatsApp, SMS, or any messaging app.', 'success');
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        showToast?.('Could not open share menu. Invite message copied if clipboard is available.', 'info');
      }
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    if (!complaintSubject.trim() || !complaintDescription.trim()) {
      setComplaintError('Please fill in all fields');
      return;
    }
    setComplaintLoading(true);
    setComplaintError('');
    setComplaintSuccess('');
    try {
      const data = await api.createComplaint({
        userId: activeUser.id,
        customerName: activeUser.name,
        customerPhone: activeUser.phone,
        subject: complaintSubject.trim(),
        category: complaintCategory,
        description: complaintDescription.trim(),
        priority: complaintPriority
      });
      setComplaintSuccess('Complaint raised successfully! Ticket #' + data.ticket.id.slice(0, 8).toUpperCase());
      setComplaintSubject('');
      setComplaintDescription('');
      setComplaintCategory('delivery');
      setComplaintPriority('medium');
      loadUserTickets();
    } catch (err: any) {
      setComplaintError(err.message || 'Error submitting complaint');
    } finally {
      setComplaintLoading(false);
    }
  };

  const handleSubmitFaqQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) {
      setFaqQuestionError('Please login before asking a question.');
      return;
    }
    if (!faqQuestion.trim()) {
      setFaqQuestionError('Type your question before submitting.');
      return;
    }
    setFaqQuestionLoading(true);
    setFaqQuestionError('');
    setFaqQuestionSuccess('');
    try {
      await api.createComplaint({
        userId: activeUser.id,
        customerName: activeUser.name,
        customerPhone: activeUser.phone,
        subject: 'Customer FAQ Question',
        category: 'faq_question',
        description: faqQuestion.trim(),
        priority: 'low'
      });
      setFaqQuestion('');
      setFaqQuestionSuccess('Question sent to the admin. You can track the reply in Complaints & Tickets.');
      loadUserTickets();
    } catch (err: any) {
      setFaqQuestionError(err.message || 'Failed to send your question.');
    } finally {
      setFaqQuestionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteAccountError('');
    if (deleteAccountText.trim().toLowerCase() !== 'delete') {
      setDeleteAccountError('Type delete exactly to continue.');
      return;
    }
    const confirmed = window.confirm('Final warning: this account and related customer data will be permanently deleted, including saved addresses, wishlist, cart profile data, complaints, reservations, orders, invoices, and payment records linked to this customer. Continue?');
    if (!confirmed) return;
    setDeleteAccountLoading(true);
    try {
      await api.deleteCurrentUser(deleteAccountText);
      showToast?.('Customer account permanently deleted.', 'success');
      setIsDeleteAccountOpen(false);
      setDeleteAccountText('');
      onLogout?.();
    } catch (err: any) {
      setDeleteAccountError(err.message || 'Failed to delete account');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  const handleCustomerPushToggle = async () => {
    if (!activeUser) {
      showToast?.('Login first to enable order and offer notifications.', 'warning');
      setIsAuthOpen(true);
      return;
    }
    setPushSaving(true);
    try {
      if (enableLocalAlerts) {
        await disablePushNotifications('customer');
        setEnableLocalAlerts(false);
        showToast?.('Push notifications disabled on this device.', 'info');
      } else {
        await enablePushNotifications('customer');
        setEnableLocalAlerts(true);
        showToast?.('Push notifications enabled on this device.', 'success');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Unable to update push notifications.', 'error');
    } finally {
      setPushSaving(false);
    }
  };

  // Mobile bottom nav items
  const mobileNavItems = [
    { id: 'home', label: 'Home', icon: Compass },
    { id: 'orders', label: 'Orders', icon: FileText },
    { id: 'cart', label: 'Cart', icon: Heart },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  // Quick menu cards for mobile
  const quickMenuCards = [
    { id: 'addresses', label: 'My Addresses', desc: 'Delivery locations', icon: MapPin, color: 'bg-indigo-500' },
    { id: 'referrals', label: 'Refer & Win', desc: 'Invite friends', icon: Gift, color: 'bg-emerald-500' },
    { id: 'feedback', label: 'Feedback', desc: 'Rate your experience', icon: Star, color: 'bg-amber-500' },
    { id: 'complaints', label: 'Complaints', desc: 'Raise a ticket', icon: AlertTriangle, color: 'bg-rose-500' },
    { id: 'settings', label: 'Settings', desc: 'App preferences', icon: Settings, color: 'bg-slate-500' },
    { id: 'help', label: 'Help & FAQ', desc: 'Get support', icon: HelpCircle, color: 'bg-indigo-500' },
    { id: 'about', label: 'About Store', desc: 'Our story', icon: Info, color: 'bg-emerald-500' },
    { id: 'terms', label: 'Terms', desc: 'Policies', icon: ShieldCheck, color: 'bg-blue-500' }
  ];

  // Mobile: Show bottom nav + menu cards only
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 py-2 pb-24 md:pb-8">
      
      {/* Mobile Profile Header */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-semibold flex items-center justify-center text-lg shadow-lg">
              {activeUser?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">{activeUser?.name}</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">+91 {activeUser?.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {!activeUser ? (
        <div className="max-w-md mx-auto my-8 animate-fadeIn">
          <div className={`p-8 text-center rounded-3xl border shadow-xl ${isDarkMode ? 'border-[#1e293b] bg-slate-900/60' : 'border-slate-100 bg-white'}`}>
            <div className="inline-flex p-4 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 mb-5">
              <User className="h-10 w-10" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-slate-900 dark:text-white tracking-tight mb-2">Customer Hub</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-sm mx-auto mb-6">
              Access your profile, addresses, orders, and support tickets.
            </p>
            <button 
              onClick={() => setIsAuthOpen(true)} 
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-all uppercase tracking-wider"
            >
              Login or Create Account
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Desktop Header */}
          <div className="hidden sm:block relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-semibold flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/15 uppercase">
                  {activeUser.name.charAt(0) || 'U'}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white">{activeUser.name}</h2>
                    {activeUser.roles?.includes('admin') && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[10px] font-semibold uppercase tracking-wider">Admin</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">+91 {activeUser.phone}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Verified</span>
                    <span className="flex items-center gap-1"><Ticket className="h-3 w-3" /> {userTickets.length} Tickets</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onSwitchMode && activeUser.roles?.includes('admin') && (
                  <button onClick={() => onSwitchMode('admin')} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:scale-105 transition">
                    Switch to Admin
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${isDarkMode ? 'border-slate-700 bg-slate-900/95 shadow-[0_12px_28px_rgba(0,0,0,0.22)]' : 'border-slate-100 bg-white'}`}>
            <div className="grid gap-3">
              <details className={`group min-w-0 rounded-xl border ${isDarkMode ? 'border-slate-700 bg-slate-950/80' : 'border-slate-100 bg-slate-50'}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-500">Account</p>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Registered details & savings rules</h3>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-300">
                      Tap to view verified profile details and how Savings Points work.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 sm:inline-flex">Verified</span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
                  </div>
                </summary>

                <div className="border-t border-slate-200/70 px-3 pb-3 pt-3 dark:border-slate-800">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'}`}>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">Name</p>
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{activeUser.name || 'Not added'}</p>
                    </div>
                    <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'}`}>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">Verified phone</p>
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">+91 {activeUser.phone}</p>
                    </div>
                    <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'}`}>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">Verified email</p>
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{activeUser.email || 'Not added'}</p>
                    </div>
                    <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'}`}>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">Date of birth</p>
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{activeUser.dateOfBirth || 'Not added'}</p>
                    </div>
                  </div>

                  <div className={`mt-3 rounded-xl border p-3 text-[11px] font-semibold leading-relaxed ${isDarkMode ? 'border-indigo-900/60 bg-indigo-950/20 text-indigo-100' : 'border-indigo-100 bg-indigo-50 text-indigo-900'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide">Savings Points Rules</p>
                        <p className="mt-1">Only UPI-paid orders earn Savings Points: 1 point for each Rs {loyaltySummary?.earnRateAmount || 200} paid.</p>
                        <p className="mt-1">At checkout, {loyaltySummary?.redeemBlockPoints || 10} points can be redeemed for Rs {loyaltySummary?.redeemBlockValue || 20} discount. Redeemed points are reduced from the account.</p>
                        <p className="mt-1">Referral points are added only after the referred customer completes a UPI-paid Rs 100+ order.</p>
                      </div>
                      <div className={`shrink-0 rounded-xl border p-3 sm:min-w-[180px] ${isDarkMode ? 'border-indigo-900/70 bg-slate-950/50' : 'border-indigo-100 bg-white'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[9px] font-semibold uppercase text-indigo-600 dark:text-indigo-300">Current Points</p>
                          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <p className="mt-1 text-2xl font-semibold text-indigo-900 dark:text-white">{rewardPoints}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-indigo-700" style={{ width: `${rewardProgress}%` }} />
                        </div>
                        <p className="mt-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          UPI-paid Rs {loyaltySummary?.earnRateAmount || 200} = 1 point.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <section className={`hidden rounded-2xl border p-4 shadow-sm sm:rounded-3xl sm:p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-100 bg-white'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-500">Registered details</p>
                <h3 className="mt-1 font-serif text-lg font-semibold text-slate-900 dark:text-white">Account Information</h3>
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Phone and email are verified and locked for account safety.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Name</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">{activeUser.name || 'Not added'}</p>
              </div>
              <div className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Verified Phone</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">+91 {activeUser.phone}</p>
              </div>
              <div className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Verified Email</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">{activeUser.email || 'Not added'}</p>
              </div>
              <div className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date of Birth</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">{activeUser.dateOfBirth || 'Not added'}</p>
              </div>
            </div>
          </section>

          <section className={`hidden rounded-2xl border p-4 shadow-sm ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-500">Member benefits</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">Savings that customers can actually use</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className={`rounded-xl border p-4 ${isDarkMode ? 'border-indigo-900/60 bg-indigo-950/30' : 'border-indigo-100 bg-indigo-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Savings Points</p>
                    <p className="mt-1 text-3xl font-semibold text-indigo-900 dark:text-white">{rewardPoints}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2 text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-700" style={{ width: `${rewardProgress}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Earn 1 point for every UPI-paid Rs {loyaltySummary?.earnRateAmount || 200}. Redeem 10 points for Rs 20 off during checkout.
                </p>
              </div>

              <div className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                <BadgePercent className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <p className="mt-3 text-xs font-semibold uppercase text-slate-900 dark:text-white">Refer & Win</p>
                {referralCoupons.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {referralCoupons.slice(0, 3).map((coupon) => (
                      <button
                        key={coupon.id || coupon.code}
                        type="button"
                        onClick={() => onUseCoupon?.(coupon.code)}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                      >
                        {coupon.code} · {couponValueText(coupon)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Invite friends from the Refer & Win page. Rewards unlock only after the referred customer completes a UPI-paid Rs 100+ order.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setProfileSubSection('referrals')}
                  className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-semibold uppercase text-white hover:bg-emerald-500"
                >
                  Open Refer & Win
                </button>
              </div>

            </div>

            {regularCoupons.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
                {regularCoupons.slice(0, 5).map((coupon) => (
                  <button
                    key={coupon.id || coupon.code}
                    type="button"
                    onClick={() => onUseCoupon?.(coupon.code)}
                    className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
                  >
                    <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{coupon.code}</p>
                    <p className="mt-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">{couponValueText(coupon)}</p>
                    <p className="text-[10px] font-bold text-slate-500">Min order Rs {coupon.minOrderValue || 0}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

            <div className="grid min-w-0 gap-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-4">
            <aside className={`sticky top-24 z-20 hidden rounded-2xl border p-3 backdrop-blur lg:block lg:self-start ${isDarkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-100 bg-white/95'} shadow-sm`}>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
                {quickMenuCards.map(card => {
                  const Icon = card.icon;
                  const active = profileSubSection === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setProfileSubSection(card.id as any)}
                      className={`flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition lg:w-full lg:gap-3 lg:px-3 lg:py-2.5 ${
                        active
                          ? 'bg-indigo-600 text-white shadow'
                          : isDarkMode
                            ? 'text-slate-300 hover:bg-slate-800'
                            : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-9 lg:w-9 ${active ? 'bg-white/15' : `${card.color} text-white`}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap text-[11px] font-semibold lg:text-xs lg:whitespace-normal">{card.label}</span>
                        <span className={`hidden text-[10px] lg:block ${active ? 'text-indigo-100' : isDarkMode ? 'text-slate-300' : 'text-slate-400'}`}>{card.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section ref={profileContentRef} className="min-w-0 max-w-full overflow-hidden scroll-mt-32 space-y-4">
          {profileSubSection !== 'menu' && (
            <button
              type="button"
              onClick={() => setProfileSubSection('menu')}
              className={`flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left text-xs font-semibold sm:hidden ${
                isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-100 bg-white text-slate-800'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to profile menu
            </button>
          )}

          {profileSubSection === 'menu' && (
            <div className="space-y-4 animate-fadeIn">
              <div className={`rounded-2xl border p-4 sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-700 bg-slate-900/95 shadow-[0_12px_28px_rgba(0,0,0,0.24)]' : 'border-slate-100 bg-white'}`}>
                <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white">Customer Profile</h3>
                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">Choose what you want to manage.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {quickMenuCards.map(card => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={`menu-${card.id}`}
                      type="button"
                      onClick={() => setProfileSubSection(card.id as any)}
                      className={`min-h-28 rounded-2xl border p-3 text-left transition active:scale-[0.98] sm:min-h-32 sm:p-4 ${
                        isDarkMode ? 'border-slate-700 bg-slate-900/95 hover:bg-slate-800 shadow-[0_10px_24px_rgba(0,0,0,0.20)]' : 'border-slate-100 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${card.color} text-white shadow-sm`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white">{card.label}</span>
                      <span className="mt-1 block text-[10px] font-medium leading-snug text-slate-500 dark:text-slate-300">{card.desc}</span>
                    </button>
                  );
                })}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold ${
                    isDarkMode ? 'border-rose-900/60 bg-rose-950/20 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-600'
                  }`}
                >
                  <LogOut className="h-4 w-4" />
                  Logout from customer account
                </button>
              )}
            </div>
          )}

          {profileSubSection === 'referrals' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white">Refer & Win</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Share your system-generated invite code. Rewards unlock only after your friend completes a UPI-paid order of Rs 100 or more.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadReferralInfo}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-semibold uppercase text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>

              {referralLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500 dark:border-slate-800">Loading referral details...</div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-emerald-100 bg-emerald-50'}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Your valid invite code</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1 rounded-xl bg-white px-4 py-3 font-mono text-xl font-semibold tracking-widest text-emerald-800 shadow-sm dark:bg-slate-950 dark:text-emerald-200">
                          {referralInfo?.code || 'Loading'}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!referralInfo?.code) return;
                            navigator.clipboard.writeText(referralInfo.code);
                            showToast?.('Referral code copied.', 'success');
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white"
                        >
                          <Copy className="h-4 w-4" /> Copy
                        </button>
                        <button
                          type="button"
                          onClick={handleShareReferralInvite}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-xs font-semibold text-white hover:bg-indigo-600"
                        >
                          <ArrowRight className="h-4 w-4" /> Share & Invite
                        </button>
                      </div>
                      <div className={`mt-3 rounded-xl border p-3 text-[11px] font-semibold leading-relaxed ${isDarkMode ? 'border-emerald-900/50 bg-slate-950/50 text-emerald-100' : 'border-emerald-100 bg-white text-emerald-900'}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide">Invite message preview</p>
                        <p className="mt-1 whitespace-pre-line">{referralInfo?.code ? getReferralInviteText() : 'Your invite text appears after the referral code loads.'}</p>
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-emerald-800/80 dark:text-emerald-200/80">
                        This code is created by SVAYIRO for your account. It is valid unless the account is deleted or blocked.
                      </p>
                      <div className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                        <p className="rounded-xl bg-white/80 p-3 dark:bg-slate-950/60">1. Friend registers and applies your code.</p>
                        <p className="rounded-xl bg-white/80 p-3 dark:bg-slate-950/60">2. Friend pays by UPI for Rs 100 or more.</p>
                        <p className="rounded-xl bg-white/80 p-3 dark:bg-slate-950/60">3. You receive 5 Savings Points.</p>
                      </div>
                    </div>

                    {!referralInfo?.receivedReferral && (
                      <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">Have a referral code?</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            id="profile_referral_code"
                            name="profile_referral_code"
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold uppercase outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950"
                            value={referralInput}
                            onChange={(event) => setReferralInput(event.target.value.toUpperCase())}
                            placeholder="Enter code"
                          />
                          <button type="button" onClick={handleApplyReferralCode} className="rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white">
                            Apply Code
                          </button>
                        </div>
                      </div>
                    )}

                    {(referralMessage || referralError) && (
                      <p className={`rounded-xl px-3 py-2 text-xs font-bold ${referralError ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
                        {referralError || referralMessage}
                      </p>
                    )}

                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your referral history</p>
                      {(referralInfo?.referrals || []).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-500 dark:border-slate-800">
                          No referrals yet. Share your code with regular buyers.
                        </div>
                      ) : (
                        referralInfo?.referrals.map((referral) => (
                          <div key={referral.id} className={`rounded-xl border p-3 text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white">{referral.referred_name || 'Customer'} · {referral.referred_phone}</p>
                                <p className="text-[10px] text-slate-500">Min UPI-paid order: Rs 100 · Reward: 5 points</p>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${referral.status === 'qualified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                                {referral.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">Yearly Leaderboard</p>
                        <p className="text-[10px] font-semibold text-slate-500">Top 3 referrers can receive owner-created year-end coupons.</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {(referralInfo?.leaderboard || []).length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-500 dark:border-slate-800">No qualified referrals yet this year.</p>
                      ) : (
                        referralInfo?.leaderboard.slice(0, 3).map((row, index) => (
                          <div key={row.id || row.phone} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs shadow-sm dark:bg-slate-900">
                            <span className="font-semibold text-slate-900 dark:text-white">#{index + 1} {row.name || 'Customer'}</span>
                            <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300">{row.qualified_referrals} refs</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== ADDRESSES SECTION ==================== */}
          {profileSubSection === 'addresses' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white">Address Book</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Manage delivery destinations</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(true)}
                  className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 sm:w-auto sm:py-2"
                >
                  + Add New Address
                </button>
              </div>
              
              {isAddingAddress && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await handleSaveAddress();
                  }}
                  className={`mb-5 rounded-2xl border p-3 sm:p-4 ${isDarkMode ? 'border-indigo-900 bg-indigo-950/20' : 'border-indigo-100 bg-indigo-50/40'}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">New Delivery Address</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Step 1: select region. Step 2: pin exact location. Step 3: add house details.</p>
                    </div>
                    <button type="button" onClick={() => setIsAddingAddress(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      value={newAddress.label || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                      placeholder="Label: Home, Shop, Office"
                      className="order-6 text-xs"
                      required
                    />
                    <Input
                      value={newAddress.flatAndHouse || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, flatAndHouse: e.target.value })}
                      placeholder="Flat / House / Building"
                      className="order-7 text-xs"
                      required
                    />
                    <Input
                      value={newAddress.areaAndStreet || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, areaAndStreet: e.target.value })}
                      placeholder="Area / Street"
                      className="order-8 text-xs"
                      required
                    />
                    <Input
                      value={newAddress.landmark || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, landmark: e.target.value })}
                      placeholder="Landmark"
                      className="order-9 text-xs"
                    />
                    <Input
                      value={newAddress.cityOrVillage || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, cityOrVillage: e.target.value })}
                      placeholder="City / Village"
                      className="order-4 text-xs"
                      required
                    />
                    <Input
                      value={newAddress.pincode || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      placeholder="6-digit pincode"
                      className="order-10 text-xs"
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      required
                    />
                    <select
                      id="profile_address_state"
                      name="profile_address_state"
                      value={newAddress.state || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value, district: '', taluk: '' })}
                      className="order-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
                      required
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map(state => <option key={state} value={state}>{state}</option>)}
                    </select>
                    <select
                      id="profile_address_district"
                      name="profile_address_district"
                      value={newAddress.district || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value, taluk: '' })}
                      className="order-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
                      required
                    >
                      <option value="">Select district</option>
                      {getDistrictsForState(newAddress.state || '').map(district => <option key={district} value={district}>{district}</option>)}
                    </select>
                    <select
                      id="profile_address_taluk"
                      name="profile_address_taluk"
                      value={newAddress.taluk || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, taluk: e.target.value })}
                      className="order-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
                    >
                      <option value="">Select taluk</option>
                      {getTaluksForDistrict(newAddress.state || '', newAddress.district || '').map(taluk => <option key={taluk} value={taluk}>{taluk}</option>)}
                    </select>
                    <div className="order-5 rounded-xl border border-indigo-100 bg-white p-3 dark:border-indigo-900 dark:bg-slate-950 md:col-span-2">
                      <div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Pin exact delivery location</p>
                          <p className="text-[10px] font-semibold text-slate-500">Required for accurate Google Maps road distance and delivery charge.</p>
                        </div>
                      </div>
                      <GoogleMapPicker
                        className="mt-3"
                        lat={newAddress.lat}
                        lng={newAddress.lng}
                        onChange={(coords) => setNewAddress({ ...newAddress, lat: coords.lat, lng: coords.lng })}
                        onResolvedAddress={(resolved) => setNewAddress((prev: any) => ({
                          ...prev,
                          state: resolved.state || prev.state,
                          district: resolved.district || prev.district,
                          cityOrVillage: resolved.city || prev.cityOrVillage,
                          pincode: resolved.pincode || prev.pincode
                        }))}
                      />
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Input
                          value={newAddress.lat ?? ''}
                          onChange={(e) => setNewAddress({ ...newAddress, lat: e.target.value === '' ? undefined : Number(e.target.value) })}
                          placeholder="Latitude e.g. 12.9715987"
                          className="text-xs"
                          inputMode="decimal"
                          required
                        />
                        <Input
                          value={newAddress.lng ?? ''}
                          onChange={(e) => setNewAddress({ ...newAddress, lng: e.target.value === '' ? undefined : Number(e.target.value) })}
                          placeholder="Longitude e.g. 77.5945627"
                          className="text-xs"
                          inputMode="decimal"
                          required
                        />
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        For accurate delivery pointing, add exact latitude and longitude from Google Maps: open your location, long-press/right-click the pin, then copy the coordinates.
                      </p>
                    </div>
                    <label className="order-11 flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      <input
                        id="profile_address_default"
                        name="profile_address_default"
                        type="checkbox"
                        checked={Boolean(newAddress.isDefault)}
                        onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                      />
                      Set as default address
                    </label>
                  </div>
                  <Button type="submit" className="mt-4 w-full rounded-xl text-xs font-semibold uppercase tracking-wider">
                    Save Address
                  </Button>
                </form>
              )}

              {/* Address List */}
              <div className="space-y-3">
                {activeUser.savedAddresses.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    No saved addresses yet. Add your first delivery location.
                  </div>
                ) : (
                  activeUser.savedAddresses.map((addr, idx) => (
                    <div key={addr.id} className={`p-4 rounded-2xl border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">{addr.label}</span>
                            {addr.isDefault && <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">DEFAULT</span>}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{addr.flatAndHouse}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{addr.areaAndStreet}, {addr.landmark}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{addr.cityOrVillage}, {addr.district}, {addr.state} - {addr.pincode}</p>
                        </div>
                        <button onClick={() => handleDeleteAddress(addr.id, idx)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ==================== FEEDBACK SECTION ==================== */}
          {profileSubSection === 'feedback' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">Feedback Desk</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">Sent to the admin alert desk as general store feedback.</p>
              
              {feedbackSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                  {feedbackSuccess}
                </div>
              )}
              {feedbackError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {feedbackError}
                </div>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                setFeedbackLoading(true);
                setFeedbackSuccess('');
                setFeedbackError('');
                if (!feedbackText.trim()) {
                  setFeedbackError('Please write your feedback before submitting.');
                  setFeedbackLoading(false);
                  return;
                }
                try {
                  await api.submitFeedback({
                    customerName: activeUser.name,
                    customerPhone: activeUser.phone,
                    rating: feedbackRating,
                    feedbackText: feedbackText.trim(),
                    type: feedbackType
                  });
                  setFeedbackSuccess('Thank you! Your feedback has been submitted.');
                  setFeedbackText('');
                  setFeedbackRating(5);
                } catch (err: any) {
                  setFeedbackError(err.message || 'Failed to submit feedback');
                } finally {
                  setFeedbackLoading(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Rating</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(star => (
                      <button key={star} type="button" onClick={() => setFeedbackRating(star)} className="p-1">
                        <Star className={`h-7 w-7 ${star <= feedbackRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['feedback', 'support'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFeedbackType(type)}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase ${feedbackType === type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Message</label>
                  <textarea 
                    id="profile_feedback_message"
                    name="profile_feedback_message"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-medium h-32"
                    placeholder="Tell us about your experience..."
                  />
                </div>
                <button type="submit" disabled={feedbackLoading} className="w-full py-3 bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wider rounded-xl disabled:opacity-60">
                  {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </form>
            </div>
          )}

          {/* ==================== COMPLAINTS/TICKETS SECTION ==================== */}
          {profileSubSection === 'complaints' && (
            <Card className={`animate-fadeIn rounded-2xl sm:rounded-3xl ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
                <CardTitle className="font-serif text-lg font-semibold text-slate-900 dark:text-white">Raise a Complaint</CardTitle>
                <CardDescription className="text-[11px]">Submit a support ticket and track resolution</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              
              {complaintSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                  {complaintSuccess}
                </div>
              )}
              {complaintError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {complaintError}
                </div>
              )}

              <form onSubmit={handleSubmitComplaint} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Category</label>
                  <select id="profile_complaint_category" name="profile_complaint_category" value={complaintCategory} onChange={(e) => setComplaintCategory(e.target.value)} className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl text-xs text-slate-900 dark:text-slate-100">
                    <option value="delivery">Delivery Issue</option>
                    <option value="product">Product Quality</option>
                    <option value="billing">Billing / Payment</option>
                    <option value="support">Customer Support</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Subject</label>
                  <Input
                    value={complaintSubject}
                    onChange={(e) => setComplaintSubject(e.target.value)}
                    maxLength={160}
                    className="text-xs"
                    placeholder="Brief summary of your complaint"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Priority</label>
                  <div className="flex gap-2">
                    {['low', 'medium', 'high'].map(p => (
                      <button key={p} type="button" onClick={() => setComplaintPriority(p as any)} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${complaintPriority === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Description</label>
                  <Textarea
                    value={complaintDescription}
                    onChange={(e) => setComplaintDescription(e.target.value)}
                    maxLength={1500}
                    className="h-28 text-xs"
                    placeholder="Provide detailed description of your complaint..."
                  />
                </div>
                <Button type="submit" disabled={complaintLoading} className="w-full bg-rose-600 py-3 text-xs font-semibold uppercase tracking-wider hover:bg-rose-500">
                  {complaintLoading ? 'Submitting...' : 'Submit Complaint'}
                </Button>
              </form>

              {/* My Tickets */}
              <div className="mt-8">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">My Tickets</h4>
                <div className="space-y-2">
                  {userTickets.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">No complaints raised yet</p>
                  ) : (
                    userTickets.map(ticket => (
                      <div key={ticket.id} className={`p-3 rounded-xl border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{ticket.subject}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{ticket.category} • {ticket.priority} priority</p>
                          </div>
                          <Badge className={`text-[9px] ${
                            ticket.status === 'open' ? 'bg-amber-100 text-amber-700' :
                            ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>{ticket.status}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              </CardContent>
            </Card>
          )}

          {/* ==================== HELP & FAQ SECTION ==================== */}
          {profileSubSection === 'help' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">Help & Support</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">Find answers and get assistance</p>
              
              <div className="space-y-3">
                {[
                  { q: 'How do I place an order?', a: 'Browse products, add to cart, and checkout with COD or UPI payment.' },
                  { q: 'How to return a product?', a: 'Contact support within 24 hours of delivery for damaged items.' },
                  { q: 'Is UPI payment secure?', a: 'Yes, all UPI transactions are encrypted and secure.' },
                  { q: 'How to change delivery address?', a: 'Go to Profile > Address Book and add/edit addresses.' }
                ].map((faq, idx) => (
                  <details key={idx} className={`group rounded-2xl border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                    <summary className="p-4 text-xs font-bold text-slate-900 dark:text-white cursor-pointer list-none flex items-center justify-between">
                      {faq.q}
                      <ChevronRight className="h-4 w-4 text-slate-400 group-open:rotate-90 transition" />
                    </summary>
                    <div className="px-4 pb-4 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>

              <form onSubmit={handleSubmitFaqQuestion} className={`mt-5 rounded-2xl border p-4 ${isDarkMode ? 'border-indigo-900/60 bg-indigo-950/20' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Any more questions?</h4>
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Ask the admin directly. The answer will be tracked as a support ticket.
                </p>
                {faqQuestionSuccess && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {faqQuestionSuccess}
                  </div>
                )}
                {faqQuestionError && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    {faqQuestionError}
                  </div>
                )}
                <Textarea
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  maxLength={1000}
                  className="mt-3 h-28 text-xs"
                  placeholder="Type your question for the admin..."
                />
                <Button type="submit" disabled={faqQuestionLoading} className="mt-3 w-full bg-indigo-600 py-3 text-xs font-semibold uppercase tracking-wider hover:bg-indigo-500">
                  {faqQuestionLoading ? 'Sending...' : 'Ask Admin'}
                </Button>
              </form>
            </div>
          )}

          {/* ==================== TERMS & CONDITIONS ==================== */}
          {profileSubSection === 'terms' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <TermsContent shop={shop} isDarkMode={isDarkMode} />
            </div>
          )}

          {/* ==================== OUR STORY ==================== */}
          {profileSubSection === 'about' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">Our Story</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">From Sri Ram Enterprises to SVAYIRO</p>
              <StoreStory shop={shop} />
            </div>
          )}

          {/* ==================== SETTINGS SECTION ==================== */}
          {profileSubSection === 'settings' && (
            <div className={`rounded-2xl border p-4 animate-fadeIn sm:rounded-3xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">App Preferences</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">Configure your experience</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Haptic Sounds</p>
                    <p className="text-[10px] text-slate-400">Play sounds on actions</p>
                  </div>
                  <button onClick={() => setEnableSound(!enableSound)} className={`w-12 h-6 rounded-full transition ${enableSound ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${enableSound ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Push Notifications</p>
                    <p className="text-[10px] text-slate-400">Order updates & offers</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCustomerPushToggle}
                    disabled={pushSaving}
                    className={`w-12 h-6 rounded-full transition disabled:opacity-60 ${enableLocalAlerts ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${enableLocalAlerts ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Newsletter</p>
                    <p className="text-[10px] text-slate-400">Promotional emails</p>
                  </div>
                  <button onClick={() => setNewsletterSubscribed(!newsletterSubscribed)} className={`w-12 h-6 rounded-full transition ${newsletterSubscribed ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${newsletterSubscribed ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-rose-900/60 bg-rose-950/20' : 'border-rose-200 bg-rose-50'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Delete Account</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-rose-600/80 dark:text-rose-300/80">
                        Permanently remove your customer account and related customer records from SVAYIRO.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteAccountText('');
                        setDeleteAccountError('');
                        setIsDeleteAccountOpen(true);
                      }}
                      className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-rose-500"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
            </section>
          </div>
        </div>
      )}

      {isDeleteAccountOpen && (
        <div className={commonStyles.modalOverlay}>
          <div className={`${commonStyles.modalContent} max-w-md`}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-serif text-lg font-semibold text-rose-700 dark:text-rose-300">Delete Account</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This action is permanent.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteAccountOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 pt-4 text-sm">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold leading-relaxed text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                Warning: your customer account and related customer data will be permanently deleted, including saved addresses, wishlist, saved cart profile data, complaints, reservations, orders, invoices, and payment records linked to this customer.
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Type delete to confirm
                </label>
                <Input
                  value={deleteAccountText}
                  onChange={(event) => setDeleteAccountText(event.target.value)}
                  placeholder="delete"
                  className="text-sm"
                />
              </div>
              {deleteAccountError && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{deleteAccountError}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsDeleteAccountOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteAccountLoading || deleteAccountText.trim().toLowerCase() !== 'delete'}
                  onClick={handleDeleteAccount}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteAccountLoading ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
