import React, { useEffect, useState } from 'react';
import { Coupon } from '../../types';
import { api } from '../../api';
import { Plus, Trash2, Copy, Gift, Check } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/date';

interface Props {
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500';
const sectionClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

function normalizeCouponRow(row: any): Coupon {
  const metadata = row?.metadata || {};
  const usageLimit = row?.usageLimit ?? row?.maxUses ?? row?.max_uses ?? undefined;
  const expiryValue = row?.expiryDate ?? row?.expiresAt ?? row?.expires_at ?? '';
  const expiryDate = expiryValue
    ? (typeof expiryValue === 'string' ? expiryValue.slice(0, 10) : new Date(expiryValue).toISOString().slice(0, 10))
    : '';

  return {
    ...row,
    id: row.id,
    code: row.code || '',
    description: row.description || '',
    discountType: row.discountType || row.discount_type || 'flat',
    discountValue: Number(row.discountValue ?? row.discount_value ?? 0),
    minOrderValue: Number(row.minOrderValue ?? row.min_order_value ?? 0),
    maxUses: usageLimit,
    usageLimit,
    currentUsage: Number(row.currentUsage ?? metadata.currentUsage ?? 0),
    expiryDate,
    metadata,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

export default function CouponsView({ isDarkMode, showToast }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [couponKind, setCouponKind] = useState<'normal' | 'welcome' | 'birthday' | 'referral' | 'leaderboard'>('normal');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const res = await api.getCoupons();
      setCoupons((res as any[]).map(normalizeCouponRow));
    } catch (err: any) {
      showToast(err.message || 'Failed to load coupons', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCoupons(); }, []);

  const handleCreate = async () => {
    const cleanCode = code.trim().toUpperCase();
    const parsedDiscount = Number(discountValue);
    const parsedMinOrder = Number(minOrderValue || 0);
    const parsedUsageLimit = couponKind === 'birthday' || couponKind === 'welcome' || usageLimit === '' ? undefined : Number(usageLimit);
    if (!/^[A-Z0-9_-]{3,30}$/.test(cleanCode)) { showToast('Coupon code must be 3-30 letters, numbers, underscores, or hyphens.', 'warning'); return; }
    if (!discountValue || parsedDiscount <= 0) { showToast('Discount value must be greater than 0.', 'warning'); return; }
    if (discountType === 'percentage' && parsedDiscount > 100) { showToast('Percentage discount cannot exceed 100.', 'warning'); return; }
    if (parsedMinOrder < 0) { showToast('Minimum order value cannot be negative.', 'warning'); return; }
    if (parsedUsageLimit !== undefined && (!Number.isInteger(parsedUsageLimit) || parsedUsageLimit < 1)) { showToast('Usage limit must be a positive whole number or blank.', 'warning'); return; }
    setSaving(true);
    try {
      const result = await api.createCoupon({
        code: cleanCode,
        discountType,
        discountValue: parsedDiscount,
        minOrderValue: parsedMinOrder,
        expiryDate: expiryDate || undefined,
        usageLimit: parsedUsageLimit,
        metadata: {
          couponType: couponKind,
          birthdayOnly: couponKind === 'birthday',
          welcomeOnly: couponKind === 'welcome',
          referralOnly: couponKind === 'referral',
          leaderboardOnly: couponKind === 'leaderboard',
          note: couponKind === 'birthday'
            ? 'Valid only on the customer birthday and once per year.'
            : couponKind === 'welcome'
              ? 'Reusable campaign coupon, but each customer account can redeem this code only once.'
            : couponKind === 'referral'
              ? 'Unlocks after at least one qualified referral.'
              : couponKind === 'leaderboard'
                ? 'Owner-issued year-end referral leaderboard coupon.'
                : ''
        }
      });
      setCode(''); setCouponKind('normal'); setDiscountValue(''); setMinOrderValue(''); setExpiryDate(''); setUsageLimit('');
      setShowForm(false);
      const savedCoupon = normalizeCouponRow(result.data);
      setCoupons((prev) => [savedCoupon, ...prev.filter((coupon) => coupon.id !== savedCoupon.id)]);
      showToast('Coupon created successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to create coupon', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this coupon?')) return;
    try {
      await api.deleteCoupon(id);
      showToast('Coupon deleted.', 'success');
      loadCoupons();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete coupon', 'error');
    }
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const isExpired = (date: string) => date && new Date(date) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black">Offers & Coupons</h2>
          <p className="text-xs opacity-70">Create and manage discount codes for your customers.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {showForm ? 'Cancel' : 'New Coupon'}
        </button>
      </div>

      {showForm && (
        <div className={sectionClass}>
          <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">
            <Gift className="h-4 w-4" /> Create New Coupon
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block"><span className={labelClass}>Coupon Code</span><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE20" /></label>
            <label className="block"><span className={labelClass}>Coupon Purpose</span>
              <select className={inputClass} value={couponKind} onChange={(e) => setCouponKind(e.target.value as any)}>
                <option value="normal">Normal public coupon</option>
                <option value="welcome">Welcome coupon - once per customer</option>
                <option value="birthday">Birthday coupon - account birthday only</option>
                <option value="referral">Refer & Win - qualified referrers only</option>
                <option value="leaderboard">Referral leaderboard coupon</option>
              </select>
            </label>
            <label className="block"><span className={labelClass}>Discount Type</span>
              <select className={inputClass} value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                <option value="flat">Flat (₹)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </label>
            <label className="block"><span className={labelClass}>Discount Value</span><input className={inputClass} type="number" min={1} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'flat' ? 'e.g. 50' : 'e.g. 10'} /></label>
            <label className="block"><span className={labelClass}>Min Order Value (₹)</span><input className={inputClass} type="number" min={0} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="0 = no minimum" /></label>
            <label className="block"><span className={labelClass}>Expiry Date</span><input className={inputClass} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
            <label className="block"><span className={labelClass}>{couponKind === 'birthday' ? 'Birthday Usage Rule' : couponKind === 'welcome' ? 'Welcome Usage Rule' : 'Usage Limit'}</span><input className={inputClass} type={couponKind === 'birthday' || couponKind === 'welcome' ? 'text' : 'number'} min={0} value={couponKind === 'birthday' ? '1 use per customer per birthday year' : couponKind === 'welcome' ? '1 use per customer account' : usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Leave empty = unlimited" disabled={couponKind === 'birthday' || couponKind === 'welcome'} /></label>
          </div>
          {couponKind === 'birthday' && (
            <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
              Birthday coupons are reusable for different customers. Each customer can redeem it only once in their birthday year.
            </p>
          )}
          {couponKind === 'welcome' && (
            <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
              Welcome coupons do not expire from global usage. Every customer account can redeem this coupon code once.
            </p>
          )}
          <button disabled={saving} onClick={handleCreate} className="mt-4 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create Coupon'}</button>
        </div>
      )}

      {loading ? (
        <div className="p-6 border rounded text-center">Loading coupons...</div>
      ) : coupons.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border py-12 text-sm opacity-70 dark:border-slate-700">
          <Gift className="h-10 w-10 mb-3 opacity-30" />
          <p>No coupons configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => {
            const expired = isExpired(coupon.expiryDate);
            return (
              <div key={coupon.id} className={`rounded-xl border p-4 shadow-sm ${expired ? 'opacity-60' : ''} ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black tracking-wider">{coupon.code}</span>
                    <button onClick={() => handleCopy(coupon.code, coupon.id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                      {copiedId === coupon.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {expired && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">Expired</span>}
                </div>
                <div className="text-lg font-black text-indigo-600">
                  {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}
                </div>
                <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {String(coupon.metadata?.couponType || 'normal')}
                </span>
                <div className="mt-2 space-y-1 text-[10px] opacity-70">
                  <p>Min order: ₹{coupon.minOrderValue}</p>
                  <p>Expires: {coupon.expiryDate ? formatDateDDMMYYYY(coupon.expiryDate) : 'Never'}</p>
                  <p>Usage: {coupon.currentUsage ?? 0}/{coupon.usageLimit ?? '∞'}</p>
                </div>
                <button onClick={() => handleDelete(coupon.id)} className="mt-3 rounded bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><Trash2 className="h-3 w-3" /> Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
