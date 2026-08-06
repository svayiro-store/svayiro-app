import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, ShoppingBag, AlertTriangle, DollarSign, Package, Clock, ArrowUp, ArrowDown, BarChart3, Gift, Search } from 'lucide-react';
import { Product } from '../../types';
import { api } from '../../api';
import { formatDateDDMMYYYY } from '../../utils/date';

interface Props {
  reportsLoading: boolean;
  isDarkMode: boolean;
  reports: any;
  lowStockProducts?: Product[];
  onOpenLowStockProduct?: (productId: string) => void;
}

type SalesPeriod = 'daily' | 'monthly' | 'yearly';

export default function DashboardView({ reportsLoading, isDarkMode, reports, lowStockProducts = [], onOpenLowStockProduct }: Props) {
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('daily');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [referralReport, setReferralReport] = useState<{ leaderboard: any[]; referrals: any[] }>({ leaderboard: [], referrals: [] });
  const [lowStockSearch, setLowStockSearch] = useState('');
  const [birthdaySearch, setBirthdaySearch] = useState('');
  const [referralSearch, setReferralSearch] = useState('');

  useEffect(() => {
    api.getAdminReferrals()
      .then(setReferralReport)
      .catch((err) => console.error('Failed loading referral report:', err));
  }, []);

  const statCards = [
    { label: 'Total Revenue', value: `Rs ${(reports.revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'emerald' },
    { label: 'Orders Placed', value: String(reports.totalOrdersPlaced ?? 0), icon: ShoppingBag, color: 'indigo' },
    { label: 'Low / Out Stock Items', value: String(reports.lowStockCount ?? 0), icon: AlertTriangle, color: 'rose' },
    { label: 'Total Profit', value: `Rs ${(reports.totalProfit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, color: 'amber' }
  ];

  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', iconBg: 'bg-emerald-500' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', iconBg: 'bg-indigo-500' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', iconBg: 'bg-rose-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', iconBg: 'bg-amber-500' }
  };

  const salesAnalytics = reports.salesAnalytics || {
    daily: reports.salesTrend?.map((point: any) => ({ label: point.date, total: point.total, orders: 0 })) || [],
    monthly: [],
    yearly: []
  };
  const chartData = salesAnalytics[salesPeriod] || [];
  const chartWidth = 640;
  const chartHeight = 240;
  const maxSales = Math.max(...chartData.map((point: any) => Number(point.total || 0)), 1);
  const selectedPoint = selectedBarIndex !== null ? chartData[selectedBarIndex] : null;
  const chartPoints = useMemo(() => {
    const padX = 28;
    const padY = 24;
    const usableW = chartWidth - padX * 2;
    const usableH = chartHeight - padY * 2;
    return chartData.map((point: any, index: number) => {
      const x = chartData.length <= 1 ? chartWidth / 2 : padX + (index / (chartData.length - 1)) * usableW;
      const y = padY + usableH - (Number(point.total || 0) / maxSales) * usableH;
      return { ...point, x, y };
    });
  }, [chartData, chartHeight, chartWidth, maxSales]);
  const linePath = chartPoints.map((point: any) => `${point.x},${point.y}`).join(' ');
  const periodSalesTotal = chartData.reduce((sum: number, point: any) => sum + Number(point.total || 0), 0);
  const periodOrdersTotal = chartData.reduce((sum: number, point: any) => sum + Number(point.orders || 0), 0);
  const avgSales = chartData.length > 0 ? periodSalesTotal / chartData.length : 0;
  const periodLabels: Record<SalesPeriod, string> = {
    daily: 'Last 14 days',
    monthly: 'Last 12 months',
    yearly: 'Last 5 years'
  };
  const upcomingBirthdays = reports.upcomingBirthdays || [];
  const tomorrowBirthdays = upcomingBirthdays.filter((customer: any) => customer.daysUntil === 1);
  const filteredLowStockProducts = useMemo(() => {
    const query = lowStockSearch.trim().toLowerCase();
    if (!query) return lowStockProducts;
    return lowStockProducts.filter((product) =>
      product.name.toLowerCase().includes(query)
      || (product.sku || '').toLowerCase().includes(query)
      || product.id.toLowerCase().includes(query)
    );
  }, [lowStockProducts, lowStockSearch]);
  const filteredBirthdays = useMemo(() => {
    const query = birthdaySearch.trim().toLowerCase();
    if (!query) return upcomingBirthdays;
    return upcomingBirthdays.filter((customer: any) =>
      String(customer.name || '').toLowerCase().includes(query)
      || String(customer.phone || '').includes(query)
      || String(customer.email || '').toLowerCase().includes(query)
      || String(customer.roleLabel || '').toLowerCase().includes(query)
    );
  }, [birthdaySearch, upcomingBirthdays]);
  const filteredLeaderboard = useMemo(() => {
    const query = referralSearch.trim().toLowerCase();
    if (!query) return referralReport.leaderboard;
    return referralReport.leaderboard.filter((row) =>
      String(row.name || '').toLowerCase().includes(query)
      || String(row.phone || '').includes(query)
    );
  }, [referralReport.leaderboard, referralSearch]);
  const filteredReferrals = useMemo(() => {
    const query = referralSearch.trim().toLowerCase();
    if (!query) return referralReport.referrals;
    return referralReport.referrals.filter((row) =>
      String(row.referrer_name || '').toLowerCase().includes(query)
      || String(row.referrer_phone || '').includes(query)
      || String(row.referred_name || '').toLowerCase().includes(query)
      || String(row.referred_phone || '').includes(query)
      || String(row.status || '').toLowerCase().includes(query)
    );
  }, [referralReport.referrals, referralSearch]);
  const dashboardSearchClass = `w-full rounded-lg border px-3 py-2 pl-9 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`;

  if (reportsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-semibold opacity-70">Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-black">Performance Dashboard</h2>
        <p className="text-xs opacity-70 mt-1">Sales overview, top products, and period-wise business trends.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const colors = colorMap[card.color];
          const Icon = card.icon;
          return (
            <div key={card.label} className={`rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${colors.bg} ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div className={`rounded-lg p-2.5 ${colors.iconBg} bg-opacity-20`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="mt-4">
                <p className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>{card.label}</p>
                <p className="mt-1.5 text-2xl font-black">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <h3 className="font-bold text-sm">Low Stock Products</h3>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {lowStockProducts.length} items
          </span>
        </div>
        {lowStockProducts.length > 0 && (
          <div className="relative mb-3 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={lowStockSearch}
              onChange={(event) => setLowStockSearch(event.target.value)}
              className={dashboardSearchClass}
              placeholder="Search low stock by name, SKU, or product ID"
            />
          </div>
        )}
        {lowStockProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-500 dark:border-slate-800">
            No products are below their low-stock threshold.
          </div>
        ) : filteredLowStockProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-500 dark:border-slate-800">
            No low-stock products match this search.
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto pr-1">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredLowStockProducts.map((product) => {
              const threshold = product.lowStockAlertThreshold ?? 10;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onOpenLowStockProduct?.(product.id)}
                  className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    isDarkMode ? 'border-slate-800 bg-slate-950 hover:border-rose-900' : 'border-slate-100 bg-slate-50 hover:border-rose-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">{product.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{product.sku || product.id.slice(0, 8)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${product.stockCount === 0 ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                      {product.stockCount === 0 ? 'Out' : product.stockCount}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-slate-500">
                    Threshold: {threshold}. Click to open in product catalogue.
                  </p>
                </button>
              );
            })}
          </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-indigo-500" />
            <h3 className="font-bold text-sm">Top Selling Products</h3>
          </div>
          {reports.topProducts && reports.topProducts.length > 0 ? (
            <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
              {reports.topProducts.map((item: any, idx: number) => (
                <div key={item.product_id || idx} className={`flex items-center justify-between rounded-lg border p-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-500'}`}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold">{item.name || 'Unknown'}</p>
                      <p className="text-[10px] opacity-70">{item.quantity} units sold</p>
                    </div>
                  </div>
                  <p className="text-sm font-black">Rs {Number(item.sales || 0).toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-sm opacity-70">
              <Package className="h-8 w-8 mb-2 opacity-40" />
              <p>No product sales data yet</p>
            </div>
          )}
        </section>

        <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-emerald-500" />
            <h3 className="font-bold text-sm">7-Day Sales Trend</h3>
          </div>
          {reports.salesTrend && reports.salesTrend.length > 0 ? (
            <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
              {[...reports.salesTrend].reverse().map((point: any, idx: number, arr: any[]) => {
                const prev = arr[idx - 1];
                const change = prev ? ((Number(point.total) - Number(prev.total)) / Number(prev.total) * 100).toFixed(1) : null;
                const isUp = change && Number(change) >= 0;
                return (
                  <div key={point.date} className={`flex items-center justify-between rounded-lg border p-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div>
                      <p className="text-xs font-bold">{formatDateDDMMYYYY(point.date)}</p>
                      {change && (
                        <span className={`flex items-center gap-0.5 text-[10px] font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {Math.abs(Number(change))}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-black">Rs {Number(point.total || 0).toLocaleString('en-IN')}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-sm opacity-70">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              <p>No trend data available</p>
            </div>
          )}
        </section>
      </div>

      <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-rose-500" />
            <div>
              <h3 className="font-bold text-sm">Birthday Alerts</h3>
              <p className="text-[10px] font-semibold text-slate-400">Shows birthdays one day before the saved profile DOB.</p>
            </div>
          </div>
          {tomorrowBirthdays.length > 0 && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {tomorrowBirthdays.length} birthday tomorrow
            </span>
          )}
        </div>
        {upcomingBirthdays.length > 0 && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={birthdaySearch}
                onChange={(event) => setBirthdaySearch(event.target.value)}
                className={dashboardSearchClass}
                placeholder="Search birthdays by name, phone, email, or role"
              />
            </div>
            <span className="text-[10px] font-black uppercase text-slate-400">
              Showing {filteredBirthdays.length} of {upcomingBirthdays.length}
            </span>
          </div>
        )}
        {upcomingBirthdays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800">
            No birthdays scheduled for tomorrow.
          </div>
        ) : filteredBirthdays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800">
            No birthday alerts match this search.
          </div>
        ) : (
          <div className="max-h-[340px] overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredBirthdays.map((customer: any) => (
              <div key={customer.id} className={`rounded-xl border p-3 ${customer.isToday ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30' : isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">{customer.name}</p>
                    <p className="mt-0.5 text-[11px] font-mono text-slate-500">+91 {customer.phone}</p>
                    {customer.roleLabel && <p className="mt-0.5 text-[10px] font-bold uppercase text-indigo-400">{customer.roleLabel}</p>}
                    {customer.email && <p className="mt-0.5 truncate text-[10px] text-slate-400">{customer.email}</p>}
                  </div>
                  <span className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white">
                    Tomorrow
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] font-bold dark:bg-slate-900/70">
                  Birthday: {customer.birthdayDayMonth || String(customer.dateOfBirth || '').slice(0, 5)}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </section>

      <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-500" />
            <div>
              <h3 className="font-bold text-sm">Referral Performance</h3>
              <p className="text-[10px] font-semibold text-slate-400">Rewards unlock only after the referred customer completes Rs 100+ purchase.</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {referralReport.referrals.filter((row) => row.status === 'qualified').length} qualified
          </span>
        </div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={referralSearch}
              onChange={(event) => setReferralSearch(event.target.value)}
              className={dashboardSearchClass}
              placeholder="Search referral records by customer, phone, or status"
            />
          </div>
          <span className="text-[10px] font-black uppercase text-slate-400">
            Showing {filteredReferrals.length} of {referralReport.referrals.length}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Top referrers this year</p>
            {filteredLeaderboard.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800">No qualified referrals yet.</p>
            ) : (
              <div className="max-h-[260px] overflow-y-auto pr-1">
              {filteredLeaderboard.map((row, index) => (
              <div key={row.id || row.phone} className="mb-2 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs dark:bg-slate-900">
                <div>
                  <p className="font-black">#{index + 1} {row.name || 'Customer'}</p>
                  <p className="font-mono text-[10px] text-slate-500">+91 {row.phone}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-emerald-600">{row.qualified_referrals} refs</p>
                  <p className="text-[10px] text-slate-500">Rs {Number(row.referred_sales || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
              ))}
              </div>
            )}
          </div>
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 font-black uppercase">Referrer</th>
                  <th className="py-2 font-black uppercase">Referred customer</th>
                  <th className="py-2 font-black uppercase">Status</th>
                  <th className="py-2 text-right font-black uppercase">Qualifying amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredReferrals.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2">
                      <p className="font-bold">{row.referrer_name || 'Customer'}</p>
                      <p className="font-mono text-[10px] text-slate-500">+91 {row.referrer_phone}</p>
                    </td>
                    <td className="py-2">
                      <p className="font-bold">{row.referred_name || 'Customer'}</p>
                      <p className="font-mono text-[10px] text-slate-500">+91 {row.referred_phone}</p>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${row.status === 'qualified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 text-right font-black">Rs {Number(row.qualifying_amount || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {filteredReferrals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">No referral records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={`rounded-xl border p-5 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-500" />
            <div>
              <h3 className="font-bold text-sm">Interactive Sales Graph</h3>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{periodLabels[salesPeriod]}</p>
            </div>
          </div>
          <div className={`inline-flex rounded-xl border p-1 ${isDarkMode ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
            {(['daily', 'monthly', 'yearly'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => {
                  setSalesPeriod(period);
                  setSelectedBarIndex(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                  salesPeriod === period
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-500 hover:text-indigo-600 dark:text-slate-300'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className={`min-w-0 overflow-hidden rounded-xl border p-3 sm:p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50/70'}`}>
            {chartData.length === 0 ? (
              <div className="flex h-60 flex-col items-center justify-center text-sm opacity-70">
                <BarChart3 className="mb-2 h-10 w-10 opacity-40" />
                <p>No sales data for this period</p>
              </div>
            ) : (
              <div className="w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="h-56 w-full sm:h-64"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${salesPeriod} sales line graph`}
                >
                  {[0, 1, 2, 3].map((line) => (
                    <line
                      key={line}
                      x1="28"
                      x2={chartWidth - 28}
                      y1={24 + line * ((chartHeight - 48) / 3)}
                      y2={24 + line * ((chartHeight - 48) / 3)}
                      stroke={isDarkMode ? '#1e293b' : '#e2e8f0'}
                      strokeDasharray="4 6"
                    />
                  ))}
                  <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={linePath}
                  />
                  {chartPoints.map((point: any, index: number) => {
                    const isSelected = selectedBarIndex === index;
                    return (
                      <g key={`${salesPeriod}-${point.label}-${index}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isSelected ? 8 : 6}
                          fill={isSelected ? '#e11d48' : '#4f46e5'}
                          stroke="white"
                          strokeWidth="3"
                          className="cursor-pointer transition"
                          onClick={() => setSelectedBarIndex(isSelected ? null : index)}
                        />
                        {chartPoints.length <= 8 || index % Math.ceil(chartPoints.length / 6) === 0 ? (
                          <text
                            x={point.x}
                            y={chartHeight - 10}
                            textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-bold"
                          >
                            {String(point.label).slice(0, 8)}
                          </text>
                        ) : null}
                        {Number(point.total || 0) > 0 && (
                          <text
                            x={point.x}
                            y={Math.max(14, point.y - 12)}
                            textAnchor="middle"
                            className="fill-indigo-700 text-[10px] font-black dark:fill-indigo-300"
                          >
                            {Math.round(Number(point.total || 0)).toLocaleString('en-IN')}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          <aside className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Selected Period</p>
            <h4 className="mt-1 text-lg font-black capitalize">{salesPeriod} Sales</h4>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Total Sales</p>
                <p className="text-xl font-black text-emerald-600">Rs {periodSalesTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Average</p>
                <p className="text-sm font-black">Rs {avgSales.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Orders</p>
                <p className="text-sm font-black">{periodOrdersTotal.toLocaleString('en-IN')}</p>
              </div>
              {selectedPoint && (
                <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/40">
                  <p className="text-[10px] font-black uppercase text-indigo-500">Marker Details</p>
                  <p className="mt-1 text-xs font-bold">{selectedPoint.label}</p>
                  <p className="text-sm font-black text-indigo-700 dark:text-indigo-300">Rs {Number(selectedPoint.total || 0).toLocaleString('en-IN')}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{Number(selectedPoint.orders || 0)} orders</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
