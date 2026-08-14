import React, { useEffect, useMemo, useState } from 'react';
import { X, MapPin, ShoppingBag, QrCode, Trash2 } from 'lucide-react';
import { Coupon, CustomerTab, ShopProfile, User as UserType } from '../../types';
import { commonStyles } from './commonStyles';
import { getDistrictsForState, getTaluksForDistrict, getCitiesForTaluk } from '../../data/indianPlaces';
import GoogleMapPicker from './GoogleMapPicker';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", 
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", 
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", 
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", 
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", 
  "Ladakh", "Lakshadweep", "Puducherry"
];

type SlotDay = 'today' | 'tomorrow';

function formatDateDDMMYYYYLocal(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function parseTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getSlotEndMinutes(slot: string) {
  const parts = slot.split('-');
  const end = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return parseTimeToMinutes(end.trim());
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  shop: ShopProfile;
  totals: {
    mrpTotal?: number;
    productTotal: number;
    offerSavings?: number;
    bagCost: number;
    deliveryCost: number;
    discount: number;
    loyaltyDiscount?: number;
    finalTotal: number;
    totalSavings?: number;
    deliveryDistanceKm?: number;
  };
  activeUser: UserType | null;
  deliveryMethod: 'delivery' | 'pickup';
  setDeliveryMethod: (method: 'delivery' | 'pickup') => void;
  selectedSlot: string;
  setSelectedSlot: (slot: string) => void;
  selectedAddressIndex: number;
  setSelectedAddressIndex: (idx: number) => void;
  couponCode: string;
  setCouponCode: (code: string) => void;
  handleApplyCoupon: () => void;
  couponError: string;
  couponSuccessMessage?: string;
  appliedCoupon: any;
  paymentMethod: 'cod' | 'upi';
  setPaymentMethod: (method: 'cod' | 'upi') => void;
  generatedUpiUrl: string;
  upiReference: string;
  setUpiReference: (ref: string) => void;
  isPlacingOrder: boolean;
  handlePlaceOrder: () => void;
  checkoutError: string;
  setActiveTab: (tab: CustomerTab) => void;
  bagOption: 'own' | 'need';
  setBagOption: (opt: 'own' | 'need') => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  handleSaveAddress?: () => Promise<void>;
  handleDeleteAddress?: (addressId: string, index?: number) => Promise<void>;
  isAddingAddress?: boolean;
  setIsAddingAddress?: (adding: boolean) => void;
  newAddress?: any;
  setNewAddress?: React.Dispatch<React.SetStateAction<any>>;
  isCalculatingDistance?: boolean;
  googleMapsDistanceText?: string;
  googleMapsDurationText?: string;
  selectedShopBranchId?: string;
  setSelectedShopBranchId?: (id: string) => void;
  upiPaymentStep?: 'idle' | 'redirecting' | 'waiting' | 'success';
  setUpiPaymentStep?: (step: 'idle' | 'redirecting' | 'waiting' | 'success') => void;
  upiCountdown?: number;
  handleFinalizeUpiOrder?: (refVal?: string) => Promise<void>;
  onCancelUpiPayment?: () => void;
  suggestedCoupons?: Coupon[];
  onUseCoupon?: (code: string) => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  isDarkMode,
  shop,
  totals,
  activeUser,
  deliveryMethod,
  setDeliveryMethod,
  selectedSlot,
  setSelectedSlot,
  selectedAddressIndex,
  setSelectedAddressIndex,
  couponCode,
  setCouponCode,
  handleApplyCoupon,
  couponError,
  couponSuccessMessage = '',
  appliedCoupon,
  paymentMethod,
  setPaymentMethod,
  generatedUpiUrl,
  upiReference,
  setUpiReference,
  isPlacingOrder,
  handlePlaceOrder,
  checkoutError,
  setActiveTab,
  bagOption,
  setBagOption,
  showToast,
  handleSaveAddress,
  handleDeleteAddress,
  isAddingAddress,
  setIsAddingAddress,
  newAddress,
  setNewAddress,
  isCalculatingDistance = false,
  googleMapsDistanceText = '',
  googleMapsDurationText = '',
  selectedShopBranchId = '',
  setSelectedShopBranchId,
  upiPaymentStep = 'idle',
  setUpiPaymentStep,
  upiCountdown = 5,
  handleFinalizeUpiOrder,
  onCancelUpiPayment,
  suggestedCoupons = [],
  onUseCoupon,
}: CheckoutModalProps) {
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [slotDay, setSlotDay] = useState<SlotDay>(selectedSlot.toLowerCase().includes('tomorrow') ? 'tomorrow' : 'today');
  const formatMoney = (value: number | undefined) => `₹${Math.round(Number(value || 0))}`;
  const deliverySlotsKey = useMemo(() => (shop.deliverySlots || []).join('|'), [shop.deliverySlots]);
  const configuredSlots = useMemo(
    () => deliverySlotsKey
      ? deliverySlotsKey.split('|').filter(Boolean)
      : ['07:00 AM - 10:00 AM', '11:00 AM - 02:00 PM', '04:00 PM - 07:00 PM'],
    [deliverySlotsKey]
  );
  const todayDate = useMemo(() => new Date(), []);
  const tomorrowDate = useMemo(() => {
    const next = new Date(todayDate);
    next.setDate(next.getDate() + 1);
    return next;
  }, [todayDate]);
  const nowMinutes = todayDate.getHours() * 60 + todayDate.getMinutes();
  const selectedTimeSlot = useMemo(
    () => configuredSlots.find((slot) => selectedSlot.includes(slot)) || configuredSlots[0] || '',
    [configuredSlots, selectedSlot]
  );
  const buildScheduledSlot = (day: SlotDay, slot: string) => {
    const label = day === 'today' ? 'Today' : 'Tomorrow';
    const date = day === 'today' ? todayDate : tomorrowDate;
    return `${label} (${formatDateDDMMYYYYLocal(date)}) - ${slot}`;
  };
  const isPastTodaySlot = (slot: string) => {
    const endMinutes = getSlotEndMinutes(slot);
    return endMinutes !== null && endMinutes <= nowMinutes;
  };
  const todayAvailableSlots = useMemo(
    () => configuredSlots.filter((slot) => !isPastTodaySlot(slot)),
    [configuredSlots, nowMinutes]
  );

  useEffect(() => {
    if (!isOpen || configuredSlots.length === 0) return;
    const selectedSlotText = selectedSlot || '';
    const currentDay: SlotDay = selectedSlotText.toLowerCase().includes('tomorrow') ? 'tomorrow' : 'today';
    if (selectedSlotText && currentDay !== slotDay) {
      setSlotDay(currentDay);
      return;
    }
    const currentTime = configuredSlots.find((slot) => selectedSlot.includes(slot));
    const fallbackSlot = (slotDay === 'today' ? todayAvailableSlots[0] : configuredSlots[0]) || configuredSlots[0];
    const expectedDate = formatDateDDMMYYYYLocal(slotDay === 'today' ? todayDate : tomorrowDate);
    const nextValue = buildScheduledSlot(slotDay, fallbackSlot);
    if (!currentTime || (slotDay === 'today' && isPastTodaySlot(currentTime)) || !selectedSlotText.includes(expectedDate)) {
      if (selectedSlotText !== nextValue) {
        setSelectedSlot(nextValue);
      }
    }
  }, [isOpen, configuredSlots, selectedSlot, setSelectedSlot, slotDay, todayAvailableSlots, todayDate, tomorrowDate]);

  if (!isOpen) return null;

  if (upiPaymentStep !== 'idle') {
    return (
      <div className={`${commonStyles.modalOverlay} z-[999] overflow-y-auto px-3 py-4 sm:px-6`}>
        <div className={`${commonStyles.modalContent} mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col items-center overflow-y-auto border border-indigo-150 p-4 text-center shadow-2xl dark:border-indigo-950 sm:p-5`}>
          
          {upiPaymentStep === 'redirecting' && (
            <div className="space-y-5 py-6 animate-fadeIn flex flex-col items-center">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <div className="absolute font-sans font-semibold text-indigo-600 text-[10px] uppercase tracking-wider">
                  UPI
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white tracking-normal">Identifying UPI Application...</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mx-auto leading-relaxed">
                  Redirecting your device to your default secure payment app (Google Pay, PhonePe, Paytm, or BHIM) to pay <strong className="text-indigo-600 dark:text-indigo-400 font-sans">₹{totals.finalTotal}</strong>.
                </p>
              </div>
              <div className="flex justify-center gap-2.5 pt-2">
                <span className="bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold px-2.5 py-1 rounded-lg text-slate-500 uppercase">Google Pay</span>
                <span className="bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold px-2.5 py-1 rounded-lg text-slate-500 uppercase">PhonePe</span>
                <span className="bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold px-2.5 py-1 rounded-lg text-slate-500 uppercase">Paytm</span>
              </div>
            </div>
          )}

          {upiPaymentStep === 'waiting' && (
            <div className="space-y-2 py-2 animate-fadeIn w-full flex flex-col items-center">
              <div className="relative flex items-center justify-center">
                <div className="w-9 h-9 rounded-full border-4 border-emerald-150 border-t-emerald-600 animate-spin"></div>
                <div className="absolute font-sans font-semibold text-emerald-600 text-[8px] uppercase tracking-wider animate-pulse">
                  PAYING
                </div>
              </div>
              
              <div className="space-y-1.5 text-center">
                <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white tracking-normal">Awaiting UPI Payment</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mx-auto leading-relaxed">
                  Pay exactly <strong className="text-emerald-600 dark:text-emerald-400 font-sans text-sm font-bold">₹{totals.finalTotal}</strong> to complete your order.
                </p>
              </div>

              {/* Dynamic Scan & Pay QR Code Card */}
              <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-3 rounded-2xl border-2 border-indigo-100 dark:border-indigo-950 flex flex-col items-center gap-2 shadow-sm">
                <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-400">Scan QR to Pay Instantly</span>
                
                <div className="p-2 bg-white rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(generatedUpiUrl)}`} 
                    alt="Scan to Pay QR Code"
                    className="h-32 w-32 object-contain rounded sm:h-40 sm:w-40"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 max-w-[240px] leading-normal font-sans">
                  Open any UPI app like GPay, PhonePe, Paytm, or BHIM, and scan this code to pay.
                </p>

                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left dark:border-amber-900/60 dark:bg-amber-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Important after payment
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Copy the UTR / transaction reference from your UPI app payment success screen or transaction history, then paste it below. The shop will verify only the correct UTR before accepting the order.
                  </p>
                </div>

                {/* Direct UPI Redirection / Fallback button */}
                <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-3 flex flex-col gap-1.5 items-center">
                  <a 
                    href={generatedUpiUrl}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold underline transition-all"
                  >
                    <span>Or Tap to Pay directly via mobile UPI app</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shop.upiId || 'svayiro.essentials@upi');
                      showToast('📋 UPI ID copied to clipboard.', 'success');
                    }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-mono transition-all"
                  >
                    UPI ID: {shop.upiId || 'svayiro.essentials@upi'} (Copy)
                  </button>
                </div>
              </div>

              <div className="w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-150 dark:border-slate-850 text-left space-y-2 max-w-sm">
                <div className="flex justify-between text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  <span>Merchant:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{shop.name || 'SVAYIRO'}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  <span>Amount Due:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">₹{totals.finalTotal}</span>
                </div>
                
                <div className="border-t border-dashed border-slate-200 dark:border-slate-850 pt-3 space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold text-[10px] uppercase tracking-wider">
                    Enter 12-Digit UPI Ref / UTR Number <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    id="checkout_upi_reference"
                    name="checkout_upi_reference"
                    type="text" 
                    placeholder="e.g. 211029103901" 
                    value={upiReference} 
                    onChange={(e) => setUpiReference && setUpiReference(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                    className="w-full bg-white dark:bg-slate-900 border-2 border-indigo-500/30 dark:border-indigo-900/40 p-2 rounded-xl font-mono text-sm text-slate-850 dark:text-slate-100 font-bold focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all text-center tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:font-normal" 
                    required
                  />
                  <span className="text-[9px] opacity-75 block text-slate-500 dark:text-slate-400 leading-normal font-sans text-center">
                    Copy this from your UPI app after payment succeeds. Orders with wrong or missing UTR will not be accepted by the shop.
                  </span>
                </div>
              </div>

              <div className="w-full pt-1 flex flex-col gap-1.5 max-w-sm">
                <button 
                  type="button"
                  onClick={() => {
                    if (!upiReference.trim()) {
                      showToast('Please enter the 12-digit UPI Transaction Ref (UTR) number from your payment app.', 'error');
                      return;
                    }
                    if (upiReference.trim().length < 8) {
                      showToast('Please enter a valid Transaction Ref ID (usually 12 digits).', 'error');
                      return;
                    }
                    if (handleFinalizeUpiOrder) {
                      handleFinalizeUpiOrder(upiReference);
                    }
                  }}
                  disabled={isPlacingOrder}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-emerald-600/15 uppercase tracking-wider transition-all"
                >
                  ✓ Submit Order & Verify Payment
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    onCancelUpiPayment?.();
                    setUpiPaymentStep && setUpiPaymentStep('idle');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold py-1.5 transition-all"
                >
                  Cancel & Return to Cart
                </button>
              </div>
            </div>
          )}

          {upiPaymentStep === 'success' && (
            <div className="space-y-5 py-8 animate-fadeIn flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20 animate-scaleUp">
                ✓
              </div>
              <div className="space-y-1 text-center">
                <h3 className="font-serif text-xl font-semibold text-emerald-600 dark:text-emerald-400 tracking-normal">UPI Reference Submitted</h3>
                <p className="font-serif text-lg font-bold text-slate-950 dark:text-white">Order placed for owner verification</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mx-auto leading-relaxed">
                  The owner will verify the payment in the bank or UPI app before accepting and preparing this order.
                </p>
              </div>
              <div className="font-mono text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Transaction ID: {upiReference}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  const selectedAddress = (activeUser && activeUser.savedAddresses && activeUser.savedAddresses.length > 0)
    ? activeUser.savedAddresses[selectedAddressIndex]
    : null;
  const isOutOfRange = deliveryMethod === 'delivery' && !!selectedAddress && (totals.deliveryDistanceKm ?? 0) > (shop.deliveryRadius || 10);

  return (
    <div className={`${commonStyles.modalOverlay} overflow-y-auto`}>
      <div className={`${commonStyles.modalContent} max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-800 p-5 shrink-0">
          <h3 className="font-bold text-lg font-serif text-slate-900 dark:text-slate-100">Secure Cart Checkout</h3>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 dark:text-slate-500 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-5 text-xs overflow-y-auto p-5 pr-4 flex-1">
          
          {/* Delivery method toggle */}
          <div className="space-y-2">
            <label className="block font-bold leading-normal text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
              Fulfillment preference
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button" 
                onClick={() => setDeliveryMethod('delivery')}
                className={`flex items-center gap-2 p-3 border rounded-xl select-none text-left transition-all ${
                  deliveryMethod === 'delivery' 
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold text-indigo-600 dark:text-indigo-400' 
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 opacity-80'
                }`}
              >
                <MapPin className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Delivery Doorstep</p>
                  <span className="text-[10px] opacity-70">Radius: {shop.deliveryRadius} kms</span>
                </div>
              </button>

              <button 
                type="button" 
                onClick={() => {
                  setDeliveryMethod('pickup');
                  setIsAddingAddress?.(false);
                }}
                className={`flex items-center gap-2 p-3 border rounded-xl select-none text-left transition-all ${
                  deliveryMethod === 'pickup' 
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold text-indigo-600 dark:text-indigo-400' 
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 opacity-80'
                }`}
              >
                <ShoppingBag className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Store Self-Pickup</p>
                  <span className="text-[10px] opacity-70">No delivery fees</span>
                </div>
              </button>
            </div>
          </div>

          {/* BRANCH STORE SELECTION */}
          {shop.addresses && shop.addresses.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
              <label className="block font-bold leading-normal text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
                🏢 Choose SVAYIRO Branch Store
              </label>
              <p className="text-[10px] opacity-70 mb-1.5">Select your nearest store branch. Delivery routes and self-pickup maps will be calculated from this store location.</p>
              
              <div className="space-y-2">
                <select
                  id="checkout_branch_store"
                  name="checkout_branch_store"
                  value={selectedShopBranchId}
                  onChange={(e) => setSelectedShopBranchId?.(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl font-sans text-xs focus:ring-1 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100"
                >
                  {shop.addresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.branchName} ({addr.cityOrVillage || addr.taluk}, {addr.district}) {addr.isDefault ? '[Main Branch]' : ''}
                    </option>
                  ))}
                </select>

                {/* Display Chosen Branch Details */}
                {(() => {
                  const activeBranch = shop.addresses.find(b => b.id === selectedShopBranchId) || shop.addresses.find(b => b.isDefault) || shop.addresses[0];
                  if (!activeBranch) return null;
                  return (
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/80 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        <span>📍 {activeBranch.branchName} Location Details</span>
                        {activeBranch.isDefault && (
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 rounded">Main Branch</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">
                        🏠 {activeBranch.flatAndHouse}, {activeBranch.areaAndStreet}, {activeBranch.landmark ? `Near: ${activeBranch.landmark}, ` : ''}{activeBranch.cityOrVillage}, {activeBranch.taluk}, {activeBranch.district}, {activeBranch.state} - {activeBranch.pincode}
                      </p>
                      {activeBranch.phone && (
                        <p className="text-[10px] text-slate-700 dark:text-slate-300 font-bold">
                          📞 Direct Store Contact: {activeBranch.phone}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Delivery slot selection */}
          <div className="space-y-2">
            <label className="block font-bold text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
              {deliveryMethod === 'pickup' ? 'Pickup schedule slot' : 'Delivery schedule slot'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'today' as const, label: 'Today', date: formatDateDDMMYYYYLocal(todayDate), disabled: todayAvailableSlots.length === 0 },
                { key: 'tomorrow' as const, label: 'Tomorrow', date: formatDateDDMMYYYYLocal(tomorrowDate), disabled: false }
              ]).map((day) => (
                <button
                  key={day.key}
                  type="button"
                  disabled={day.disabled}
                  onClick={() => {
                    setSlotDay(day.key);
                    const nextSlot = day.key === 'today'
                      ? configuredSlots.find((slot) => !isPastTodaySlot(slot)) || configuredSlots[0]
                      : configuredSlots[0];
                    if (nextSlot) setSelectedSlot(buildScheduledSlot(day.key, nextSlot));
                  }}
                  className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    slotDay === day.key
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-950/30 dark:text-indigo-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  <span className="block text-xs font-semibold">{day.label}</span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-70">{day.date}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {configuredSlots.map((slot, idx) => {
                const disabled = slotDay === 'today' && isPastTodaySlot(slot);
                const active = selectedTimeSlot === slot && selectedSlot.includes(slotDay === 'today' ? 'Today' : 'Tomorrow');
                return (
                  <button
                    key={`${slot}_${idx}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedSlot(buildScheduledSlot(slotDay, slot))}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'border-slate-200 bg-white font-bold text-slate-700 hover:border-emerald-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                    }`}
                  >
                    <span className="block">{slot}</span>
                    <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide opacity-60">
                      {disabled ? 'Time passed for today' : active ? 'Selected' : 'Available'}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] opacity-70 italic block text-slate-500 dark:text-slate-400">
              {deliveryMethod === 'pickup'
                ? 'Choose today or tomorrow and select when you want to collect your order from the selected store branch.'
                : 'Choose today or tomorrow and select the delivery time. Past slots are disabled automatically.'}
            </span>
          </div>

          {/* Address Picker if Delivery is true */}
          {deliveryMethod === 'delivery' && (
            <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <label className="font-bold text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
                  Select Delivery Address
                </label>
                {activeUser?.savedAddresses && activeUser.savedAddresses.length > 0 && !isAddingAddress && (
                  <button 
                    type="button"
                    onClick={() => setIsAddingAddress?.(true)}
                    className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 px-2.5 py-1 rounded-lg font-bold transition-all"
                  >
                    + Add New Address
                  </button>
                )}
              </div>

              {/* Inline adding form */}
              {isAddingAddress ? (
                <div className="p-4 border border-indigo-200 dark:border-indigo-950/60 bg-indigo-50/10 dark:bg-indigo-950/20 rounded-xl space-y-3 text-xs">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 text-xs flex items-center gap-1">
                    <span>🏠 Register Address Details properly</span>
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500">
                    Step 1: select state, district, taluk and city. Step 2: pin exact location. Step 3: add house and contact details.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Address Label</label>
                      <input 
                        id="checkout_address_label"
                        name="checkout_address_label"
                        type="text" 
                        value={newAddress?.label || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, label: e.target.value })}
                        className={commonStyles.input} 
                        placeholder="e.g. Home, Office"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Select State (India) <span className="text-rose-500">*</span></label>
                      <select 
                        id="checkout_address_state"
                        name="checkout_address_state"
                        value={newAddress?.state || ''} 
                        onChange={(e) => setNewAddress?.({ 
                          ...newAddress, 
                          state: e.target.value, 
                          district: '', 
                          taluk: '', 
                          cityOrVillage: '' 
                        })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg font-sans text-xs focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Choose State --</option>
                        {INDIAN_STATES.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">District Name <span className="text-rose-500">*</span></label>
                      <select 
                        id="checkout_address_district"
                        name="checkout_address_district"
                        value={newAddress?.district || ''} 
                        disabled={!newAddress?.state}
                        onChange={(e) => setNewAddress?.({ 
                          ...newAddress, 
                          district: e.target.value, 
                          taluk: '', 
                          cityOrVillage: '' 
                        })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg font-sans text-xs focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="">-- Choose District --</option>
                        {newAddress?.state && getDistrictsForState(newAddress.state).map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Taluk Name <span className="text-rose-500">*</span></label>
                      <select 
                        id="checkout_address_taluk"
                        name="checkout_address_taluk"
                        value={newAddress?.taluk || ''} 
                        disabled={!newAddress?.district}
                        onChange={(e) => setNewAddress?.({ 
                          ...newAddress, 
                          taluk: e.target.value, 
                          cityOrVillage: '' 
                        })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg font-sans text-xs focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="">-- Choose Taluk --</option>
                        {newAddress?.state && newAddress?.district && getTaluksForDistrict(newAddress.state, newAddress.district).map(taluk => (
                          <option key={taluk} value={taluk}>{taluk}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">City / Village Name <span className="text-rose-500">*</span></label>
                      <select 
                        id="checkout_address_city"
                        name="checkout_address_city"
                        value={newAddress?.cityOrVillage || ''} 
                        disabled={!newAddress?.taluk}
                        onChange={(e) => setNewAddress?.({ ...newAddress, cityOrVillage: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg font-sans text-xs focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="">-- Choose City / Village --</option>
                        {newAddress?.state && newAddress?.district && newAddress?.taluk && getCitiesForTaluk(newAddress.state, newAddress.district, newAddress.taluk).map(city => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Pincode (6 digits) <span className="text-rose-500">*</span></label>
                      <input 
                        id="checkout_address_pincode"
                        name="checkout_address_pincode"
                        type="text" 
                        maxLength={6}
                        value={newAddress?.pincode || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, pincode: e.target.value.replace(/\D/g, '') })}
                        className={commonStyles.input} 
                        placeholder="e.g. 560001"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-900 dark:bg-slate-950">
                    <div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Pin exact delivery location</p>
                        <p className="text-[10px] font-semibold text-slate-500">Required for accurate Google Maps road distance and delivery charge.</p>
                      </div>
                    </div>
                    <GoogleMapPicker
                      className="mt-3"
                      lat={newAddress?.lat}
                      lng={newAddress?.lng}
                      onChange={(coords) => setNewAddress?.({ ...newAddress, lat: coords.lat, lng: coords.lng })}
                      onResolvedAddress={(resolved) => setNewAddress?.((prev: any) => ({
                        ...prev,
                        state: resolved.state || prev?.state || '',
                        district: resolved.district || prev?.district || '',
                        cityOrVillage: resolved.city || prev?.cityOrVillage || '',
                        pincode: resolved.pincode || prev?.pincode || ''
                      }))}
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        id="checkout_address_latitude"
                        name="checkout_address_latitude"
                        type="text"
                        value={newAddress?.lat ?? ''}
                        onChange={(e) => setNewAddress?.({ ...newAddress, lat: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className={commonStyles.input}
                        placeholder="Latitude e.g. 12.9715987"
                      />
                      <input
                        id="checkout_address_longitude"
                        name="checkout_address_longitude"
                        type="text"
                        value={newAddress?.lng ?? ''}
                        onChange={(e) => setNewAddress?.({ ...newAddress, lng: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className={commonStyles.input}
                        placeholder="Longitude e.g. 77.5945627"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      For accurate delivery pointing, add exact latitude and longitude from Google Maps: open your location, long-press/right-click the pin, then copy the coordinates.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Near Location / Landmark <span className="text-rose-500">*</span></label>
                      <input 
                        id="checkout_address_landmark"
                        name="checkout_address_landmark"
                        type="text" 
                        value={newAddress?.landmark || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, landmark: e.target.value })}
                        className={commonStyles.input} 
                        placeholder="Landmark reference"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Correct Home Address (Flat, House No., Building Name) <span className="text-rose-500">*</span></label>
                      <input 
                        id="checkout_address_flat_house"
                        name="checkout_address_flat_house"
                        type="text" 
                        value={newAddress?.flatAndHouse || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, flatAndHouse: e.target.value })}
                        className={commonStyles.input} 
                        placeholder="e.g. Door No. 12, Gagan Residency"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Area, Street Name, Colony <span className="text-rose-500">*</span></label>
                      <input 
                        id="checkout_address_area_street"
                        name="checkout_address_area_street"
                        type="text" 
                        value={newAddress?.areaAndStreet || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, areaAndStreet: e.target.value })}
                        className={commonStyles.input} 
                        placeholder="e.g. MG Road, Ward 4"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-indigo-200/20 pt-2">
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Pickup Contact Phone (10-digit) <span className="text-rose-500">*</span></label>
                      <input 
                        id="checkout_pickup_phone"
                        name="checkout_pickup_phone"
                        type="text" 
                        maxLength={10}
                        value={newAddress?.pickupPersonPhone || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, pickupPersonPhone: e.target.value.replace(/\D/g, '') })}
                        className={commonStyles.input} 
                        placeholder="e.g. 9876543210"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] opacity-75 text-slate-500 font-bold uppercase">Pickup Contact Name <span className="text-slate-400 font-normal">(Optional)</span></label>
                      <input 
                        id="checkout_pickup_name"
                        name="checkout_pickup_name"
                        type="text" 
                        value={newAddress?.pickupPersonName || ''} 
                        onChange={(e) => setNewAddress?.({ ...newAddress, pickupPersonName: e.target.value })}
                        className={commonStyles.input} 
                        placeholder="Contact person name"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsAddingAddress?.(false)} 
                      className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleSaveAddress} 
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wide"
                    >
                      Save & Use Address
                    </button>
                  </div>
                </div>
              ) : activeUser?.savedAddresses && activeUser.savedAddresses.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold italic">
                    💡 Please select one of your registered addresses below, or click "+ Add New Address" above if you need to deliver to a different location:
                  </p>
                  
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {activeUser.savedAddresses.map((addr, ix) => (
                      <div 
                        key={addr.id}
                        onClick={() => setSelectedAddressIndex(ix)}
                        className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                          selectedAddressIndex === ix 
                            ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/25' 
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <input 
                          id={`checkout_delivery_address_${addr.id || ix}`}
                          type="radio" 
                          name="delivery_address" 
                          checked={selectedAddressIndex === ix}
                          onChange={() => setSelectedAddressIndex(ix)}
                          className="mt-1.5 accent-indigo-600" 
                        />
                        <div className="space-y-1 font-mono text-[11px] flex-1">
                          <div className="flex flex-wrap gap-1.5 items-center mb-1">
                            <span className="font-bold select-none text-[9px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 uppercase px-1.5 py-0.5 rounded">
                              {addr.label}
                            </span>
                            {addr.state && (
                              <span className="text-[9px] bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded">
                                {addr.cityOrVillage ? `${addr.cityOrVillage}, ` : ''}{addr.taluk}, {addr.district}, {addr.state}
                              </span>
                            )}
                          </div>
                          <p className="font-bold select-none text-slate-800 dark:text-slate-200">
                            📞 Contact: {addr.pickupPersonName || addr.name || 'N/A'} ({addr.pickupPersonPhone || addr.phone || 'N/A'})
                          </p>
                          <p className="opacity-80 select-none text-slate-600 dark:text-slate-400 leading-normal">
                            🏠 {addr.flatAndHouse}, {addr.areaAndStreet}
                          </p>
                          <p className="text-[10px] opacity-75">
                            📍 Pin: <span className="font-bold">{addr.pincode}</span> {addr.landmark ? `| Near: ${addr.landmark}` : ''}
                          </p>
                        </div>

                        {handleDeleteAddress && (
                          <div onClick={(e) => e.stopPropagation()} className="shrink-0 self-start ml-2">
                            {deletingAddressId === addr.id ? (
                              <div className="flex flex-col sm:flex-row gap-1 items-stretch sm:items-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDeleteAddress(addr.id, ix);
                                    setDeletingAddressId(null);
                                  }}
                                  className="text-[9px] font-bold px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-500 transition-colors shadow-sm uppercase tracking-wider text-center"
                                >
                                  Delete?
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingAddressId(null)}
                                  className="text-[9px] font-bold px-1.5 py-1 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-center"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingAddressId(addr.id)}
                                title="Delete Address"
                                className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/25 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-rose-200 dark:border-rose-900 bg-rose-50/5 rounded-xl space-y-3 text-center">
                  <p className="opacity-75 text-rose-600 dark:text-rose-400 font-medium">
                    ⚠ You don't have any registered delivery addresses in your profile! Please register your address properly below to proceed with doorstep home delivery:
                  </p>
                  
                  <button 
                    type="button"
                    onClick={() => setIsAddingAddress?.(true)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all uppercase tracking-wider"
                  >
                    + Register My Address Now
                  </button>
                </div>
              )}

              {/* Dynamic distance calculation and billing details */}
              {activeUser?.savedAddresses && activeUser.savedAddresses.length > 0 && !isAddingAddress && (
                (() => {
                  const selectedAddress = activeUser.savedAddresses[selectedAddressIndex];
                  if (!selectedAddress) return null;
                  
                  // Calculate distance and check limits
                  const dist = totals.deliveryDistanceKm ?? 0;
                  const isOutOfRange = dist > (shop.deliveryRadius || 10);
                  
                  return (
                    <div className={`p-3.5 rounded-xl border font-mono text-[11px] space-y-2.5 ${
                      isOutOfRange 
                        ? 'border-rose-200 bg-rose-50/30 dark:border-rose-950/20 dark:bg-rose-950/10' 
                        : 'border-emerald-150 bg-emerald-50/10 dark:border-emerald-950/10'
                    }`}>
                      <div className="border-b border-dashed border-slate-150 dark:border-slate-800 pb-1.5 mb-1.5">
                        <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">🚴 Live Bike Route Routing (Google Maps):</span>
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-sans leading-tight">
                          From: <strong className="text-slate-700 dark:text-slate-200">{shop.address || 'Shop Facility'}</strong>
                        </div>
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-sans leading-tight mt-0.5">
                          To: <strong className="text-slate-700 dark:text-slate-200">{selectedAddress.flatAndHouse}, {selectedAddress.areaAndStreet}, {selectedAddress.cityOrVillage || selectedAddress.taluk}</strong>
                        </div>
                      </div>

                      {isCalculatingDistance ? (
                        <div className="flex items-center justify-center py-2 text-indigo-600 dark:text-indigo-400 font-semibold gap-2 animate-pulse">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          <span>Calculating actual bike transport distance...</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-500">📍 Bike Transport Distance:</span>
                            <span className={`font-bold text-xs ${isOutOfRange ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {googleMapsDistanceText || `${dist} km`}
                            </span>
                          </div>

                          {googleMapsDurationText && (
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-500">⏱ Estimated Bike Travel Time:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                ~ {googleMapsDurationText}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      
                      <div className="flex justify-between">
                        <span className="text-slate-500">🏬 Maximum Facility Radius Limit:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{shop.deliveryRadius || 10} km</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Free Delivery Limit:</span>
                        <span className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                          Free up to {shop.freeDeliveryRadiusKm ?? 0} km. Extra distance uses base + per-km charge.
                        </span>
                      </div>
                      
                      <div className="flex justify-between border-t border-slate-150/50 dark:border-slate-800 pt-1.5">
                        <span className="text-slate-500">⚙ Configured Delivery Rates:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">₹{shop.baseDeliveryCharge ?? 30} base + ₹{shop.deliveryChargePerKm ?? 12}/km</span>
                      </div>

                      <div className="flex justify-between font-bold pt-1 border-t border-dashed border-slate-150/50 dark:border-slate-800">
                        <span className="text-slate-700 dark:text-slate-200">💰 Delivery Fee:</span>
                        <span className={`text-[12px] ${isOutOfRange ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
                          {isOutOfRange ? '🚫 OUT OF DELIVERY RANGE' : `₹${totals.deliveryCost}`}
                        </span>
                      </div>
                      
                      {isOutOfRange && (
                        <p className="text-[10px] text-rose-500 dark:text-rose-400 font-bold mt-1 text-center leading-normal animate-pulse">
                          ⚠ This location is too far! We only deliver up to {shop.deliveryRadius || 10} km. Please select or add an address closer to our store facility.
                        </p>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Coupon codes box */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
            <label className="block font-bold text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
              Apply promotion code
            </label>
            <div className="flex gap-2">
              <input 
                id="checkout_coupon_code"
                name="checkout_coupon_code"
                type="text" 
                placeholder="e.g. SVAYIROFIRST, FLAT50" 
                value={couponCode} 
                onChange={(e) => setCouponCode(e.target.value)}
                className={`flex-1 ${commonStyles.input} uppercase`}
              />
              <button 
                onClick={handleApplyCoupon} 
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors uppercase tracking-wider shrink-0"
              >
                Verify
              </button>
            </div>
            {couponError && <p className="text-[10px] text-red-500 font-bold">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block animate-fadeIn">
                ✓ Code Applied! Discount: {appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}%` : `₹${appliedCoupon.discountValue}`}
              </p>
            )}
          </div>

            {appliedCoupon && (
              <div className="animate-fadeIn rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                <p className="text-[10px] font-semibold uppercase tracking-wide">
                  Code applied - {appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}%` : `Rs ${appliedCoupon.discountValue}`} saved
                </p>
                <p className="mt-1 text-[11px] font-bold leading-relaxed">
                  {couponSuccessMessage || 'Yay! Your coupon is applied successfully. Enjoy your saving on this order.'}
                </p>
                {appliedCoupon.metadata?.campaignEligibility && (
                  <p className="mt-1 text-[10px] font-semibold leading-relaxed text-emerald-700/80 dark:text-emerald-200/80">
                    Special-offer coupon: discount is calculated only on eligible campaign items in your bag.
                  </p>
                )}
              </div>
            )}

            {suggestedCoupons.length > 0 && !appliedCoupon && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestedCoupons.slice(0, 3).map((coupon) => (
                  <button
                    key={coupon.id || coupon.code}
                    type="button"
                    onClick={() => onUseCoupon?.(coupon.code)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    Use {coupon.code}
                    {coupon.metadata?.campaignEligibility && <span className="ml-1 opacity-70">offer only</span>}
                  </button>
                ))}
              </div>
            )}

          {/* Payment Methods */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <label className="block font-bold text-[11px] uppercase opacity-75 text-slate-700 dark:text-slate-300">
              Select instant payment method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button" 
                onClick={() => setPaymentMethod('cod')}
                className={`flex items-center gap-2 p-3 border rounded-xl select-none transition-all ${
                  paymentMethod === 'cod' 
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold text-indigo-600 dark:text-indigo-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900'
                }`}
              >
                <span className="font-semibold">💸 Cash on Delivery</span>
              </button>

              <button 
                type="button" 
                onClick={() => setPaymentMethod('upi')}
                className={`flex items-center gap-2 p-3 border rounded-xl select-none transition-all ${
                  paymentMethod === 'upi' 
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold text-indigo-600 dark:text-indigo-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900'
                }`}
              >
                <span className="font-semibold">📱 Direct UPI Pay</span>
              </button>
            </div>

            {paymentMethod === 'upi' && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs font-semibold text-indigo-900 animate-fadeIn dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200">
                <p className="font-semibold uppercase tracking-wide">UPI selected</p>
                <p className="mt-1 leading-relaxed">
                  Click the submit button below. The next screen will show one payment QR, direct UPI app link, and the UTR/reference input after the order is reserved.
                </p>
                <p className="mt-2 font-mono text-[10px] text-indigo-700 dark:text-indigo-300">
                  Merchant UPI: {shop.upiId || 'svayiro.essentials@upi'}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-xs shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Savings & Payment Review
              </span>
              {(totals.totalSavings || 0) > 0 && (
                <span className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white">
                  Saved {formatMoney(totals.totalSavings)}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span>MRP total</span>
                <span>{formatMoney(totals.mrpTotal || totals.productTotal)}</span>
              </div>
              {(totals.offerSavings || 0) > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-300">
                  <span>Product offer saving</span>
                  <span>-{formatMoney(totals.offerSavings)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span>Offer price subtotal</span>
                <span>{formatMoney(totals.productTotal)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-300">
                  <span>Coupon saving ({appliedCoupon.code})</span>
                  <span>-{formatMoney(totals.discount)}</span>
                </div>
              )}
              {(totals.loyaltyDiscount || 0) > 0 && (
                <div className="flex justify-between font-semibold text-indigo-700 dark:text-indigo-300">
                  <span>Savings Points redeemed</span>
                  <span>-{formatMoney(totals.loyaltyDiscount)}</span>
                </div>
              )}
              {bagOption === 'need' && (
                <div className="flex justify-between text-slate-700 dark:text-slate-200">
                  <span>Smart bags</span>
                  <span>{formatMoney(totals.bagCost)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span>Delivery</span>
                <span>{deliveryMethod === 'pickup' ? '₹0' : totals.deliveryCost === 0 ? 'FREE' : formatMoney(totals.deliveryCost)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-emerald-200 pt-2 text-sm font-semibold text-indigo-700 dark:border-emerald-900 dark:text-indigo-300">
                <span>Final payable</span>
                <span>{formatMoney(totals.finalTotal)}</span>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-medium leading-relaxed text-emerald-800 dark:text-emerald-200">
              This is the final review. For UPI, your order is submitted only for owner verification after you enter the payment UTR/reference.
            </p>
          </div>

          {/* Checkout Bill calculation summary */}
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-150 dark:border-slate-800/80 p-4 rounded-xl font-mono text-xs space-y-1.5">
            <span className="font-bold uppercase text-[9px] opacity-75 text-indigo-600 dark:text-indigo-400 block pb-1 border-b border-dashed border-slate-200 dark:border-slate-800">
              Payout metrics
            </span>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>Product Total</span>
              <span className="font-bold">₹{totals.productTotal}</span>
            </div>
            {bagOption === 'need' && (
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>Smart Bags Fee</span>
                <span className="font-bold">₹{totals.bagCost}</span>
              </div>
            )}
            {deliveryMethod === 'delivery' && (
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>Doorstep radius fee</span>
                <span className="font-bold">₹{totals.deliveryCost}</span>
              </div>
            )}
            {appliedCoupon && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                <span>Coupon Promo</span>
                <span>-₹{totals.discount}</span>
              </div>
            )}
            {(totals.loyaltyDiscount || 0) > 0 && (
              <div className="flex justify-between text-indigo-600 dark:text-indigo-300 font-bold">
                <span>Savings Points redemption</span>
                <span>-Rs {totals.loyaltyDiscount}</span>
              </div>
            )}
            <div className="border-t border-slate-200 dark:border-slate-850 pt-2 mt-2 flex justify-between font-semibold text-sm text-indigo-600 dark:text-indigo-400">
              <span>Grand Payout due</span>
              <span>₹{totals.finalTotal}</span>
            </div>
          </div>

          {checkoutError && <p className="text-[11px] text-red-500 font-bold">{checkoutError}</p>}

        </div>

        {/* Action Button Footer */}
        <div className="border-t border-slate-150 dark:border-slate-800 p-5 shrink-0 bg-slate-50 dark:bg-slate-900 flex flex-col gap-2">
          <button 
            disabled={isPlacingOrder || (deliveryMethod === 'delivery' && !!isAddingAddress) || isOutOfRange || (deliveryMethod === 'delivery' && (!activeUser?.savedAddresses || activeUser.savedAddresses.length === 0))}
            onClick={handlePlaceOrder}
            className={`${commonStyles.buttonPrimary} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPlacingOrder 
              ? 'Validating stock transaction...' 
              : deliveryMethod === 'delivery' && isAddingAddress 
              ? 'Please Save or Cancel Address Form First'
              : isOutOfRange 
              ? 'Cannot Deliver: Address Out of Range'
              : paymentMethod === 'upi'
                ? `Submit for UPI Verification (${formatMoney(totals.finalTotal)})`
                : `Place Order (${formatMoney(totals.finalTotal)})`
            }
          </button>
          
          {deliveryMethod === 'delivery' && (!activeUser?.savedAddresses || activeUser.savedAddresses.length === 0) && (
            <p className="text-[10px] text-center text-rose-500 dark:text-rose-400 font-semibold animate-pulse leading-normal">
              ⚠ Please register at least one Delivery Address properly above to continue.
            </p>
          )}

          {deliveryMethod === 'delivery' && isOutOfRange && (
            <p className="text-[10px] text-center text-rose-500 dark:text-rose-400 font-bold animate-pulse leading-normal">
              ⚠ Selected address is too far ({totals.deliveryDistanceKm} km) and exceeds maximum delivery range ({shop.deliveryRadius} km).
            </p>
          )}

          {deliveryMethod === 'delivery' && isAddingAddress && (
            <p className="text-[10px] text-center text-indigo-500 font-semibold leading-normal">
              💡 Please complete or cancel the address registration form above.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
