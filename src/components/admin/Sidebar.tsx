import React, { useState } from 'react';
import { TrendingUp, QrCode, Package, Layers, ShoppingBag, Calendar, Gift, MessageSquare, Bell, BellRing, Image, Settings, LogOut, AlertTriangle, BookOpen, ExternalLink, PanelLeftClose, PanelLeftOpen, Scale, Sparkles } from 'lucide-react';

interface Props {
  activeMenu: string;
  setActiveMenu: (m: any) => void;
  ordersCount?: number;
  advancesCount?: number;
  reviewsCount?: number;
  isDarkMode: boolean;
  roles?: string[];
  onSwitchMode?: (mode: 'customer' | 'admin') => void;
  onLogout?: () => void;
}

const menuRoles: Record<string, string[]> = {
  dashboard: ['admin'],
  pos: ['admin', 'inventory_manager'],
  looseLabels: ['admin', 'inventory_manager'],
  products: ['admin', 'inventory_manager'],
  categories: ['admin', 'inventory_manager'],
  orders: ['admin', 'delivery_partner', 'customer_care'],
  advances: ['admin'],
  coupons: ['admin'],
  campaigns: ['admin'],
  reviews: ['admin', 'customer_care'],
  complaints: ['admin', 'customer_care'],
  adminAlerts: ['admin'],
  banners: ['admin'],
  broadcasting: ['admin'],
  settings: ['admin'],
  manual: ['admin', 'inventory_manager', 'delivery_partner', 'customer_care']
};

export default function Sidebar({ activeMenu, setActiveMenu, ordersCount = 0, advancesCount = 0, reviewsCount = 0, isDarkMode, roles = [], onSwitchMode, onLogout }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canOpenCustomerStorefront = roles.includes('admin');
  const publicStorefrontUrl = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://svayiro.co.in').replace(/\/$/, '');
  const openCustomerStorefront = () => {
    if (publicStorefrontUrl && publicStorefrontUrl !== window.location.origin) {
      window.open(publicStorefrontUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    onSwitchMode?.('customer');
  };
  const items = [
    { id: 'dashboard', label: 'Dashboard Control', icon: TrendingUp },
    { id: 'pos', label: 'Walk-In Billing (POS)', icon: QrCode },
    { id: 'looseLabels', label: 'Loose Weighing Labels', icon: Scale },
    { id: 'products', label: 'Products Catalogue', icon: Package },
    { id: 'categories', label: 'Manage Categories', icon: Layers },
    { id: 'orders', label: 'Invoice & Orders', icon: ShoppingBag, badge: ordersCount },
    { id: 'advances', label: 'Advance Bookings', icon: Calendar, badge: advancesCount },
    { id: 'coupons', label: 'Offers Coupons', icon: Gift },
    { id: 'campaigns', label: 'Campaigns', icon: Sparkles },
    { id: 'reviews', label: 'Quality Reviews', icon: MessageSquare, badge: reviewsCount },
    { id: 'complaints', label: 'Complaints & Tickets', icon: AlertTriangle },
    { id: 'adminAlerts', label: 'Admin Alerts', icon: BellRing },
    { id: 'banners', label: 'Homepage Banners', icon: Image },
    { id: 'broadcasting', label: 'Alert Bulletins', icon: Bell },
    { id: 'settings', label: 'Store Settings', icon: Settings },
    { id: 'manual', label: 'User Manual', icon: BookOpen }
  ];
  const visibleItems = items.filter((item) => (menuRoles[item.id] || ['admin']).some((role) => roles.includes(role)));

  return (
    <aside className={`w-full shrink-0 border-b p-2 transition-all duration-200 sm:p-3 md:fixed md:inset-y-0 md:left-0 md:z-40 md:h-screen md:w-auto md:border-b-0 md:border-r md:overflow-hidden ${isExpanded ? 'md:w-64' : 'md:w-[76px]'} flex flex-col ${isDarkMode ? 'border-[#1e293b] bg-[#090d16]' : 'border-slate-200 bg-white'}`}>
      <div className={`mb-2 flex items-center gap-3 rounded-2xl border p-2 ${isExpanded ? 'md:justify-start' : 'md:justify-center'} ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-700 text-white shadow-lg shadow-indigo-900/20">
          <Settings className="h-5 w-5" />
        </div>
        <div className={`min-w-0 ${isExpanded ? 'md:block' : 'md:hidden'}`}>
          <h2 className="truncate font-extrabold text-indigo-800 text-sm font-mono tracking-wider dark:text-indigo-300">SVAYIRO CONSOLE</h2>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Operator panel</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className={`mb-2 hidden h-10 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-[10px] font-semibold uppercase transition md:flex ${
          isDarkMode
            ? 'border-slate-800 bg-slate-950 text-slate-300 hover:border-indigo-800'
            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200'
        }`}
        title={isExpanded ? 'Collapse menu' : 'Expand menu'}
        aria-label={isExpanded ? 'Collapse admin menu' : 'Expand admin menu'}
      >
        {isExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        {isExpanded && <span>Collapse</span>}
      </button>

      <nav className="flex min-h-0 flex-1 gap-2 overflow-x-auto border-t pb-1 pt-2 text-xs md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-t-0 md:pt-0">
        {visibleItems.map(item => {
          const Icon = item.icon as any;
          return (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
              title={item.label}
              className={`group relative flex min-w-fit items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 select-none text-left whitespace-nowrap transition-all md:h-12 md:min-w-0 ${isExpanded ? 'md:justify-between' : 'md:w-12 md:justify-center md:px-0'} ${
              activeMenu === item.id
                ? 'border-indigo-700 bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-900/20'
                : isDarkMode
                  ? 'border-slate-800 bg-slate-950 text-slate-300 hover:border-indigo-700 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-sm'
            }`}
            >
              {activeMenu === item.id && (
                <span className="absolute -left-1 top-1/2 hidden h-7 w-1 -translate-y-1/2 rounded-r-full bg-emerald-400 md:block" />
              )}
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 shrink-0 ${activeMenu === item.id ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300'}`} />
                <span className={`font-bold ${isExpanded ? '' : 'md:hidden'}`}>{item.label}</span>
              </div>
              {!isExpanded && (
                <span className="pointer-events-none absolute left-[56px] top-1/2 z-50 hidden -translate-y-1/2 rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 md:block">
                  {item.label}
                </span>
              )}
              {item.badge ? (
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold font-mono leading-none bg-rose-50 text-rose-500 ${isExpanded ? '' : 'md:absolute md:right-1 md:top-1'}`}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {(canOpenCustomerStorefront || onLogout) && (
        <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 pt-2 dark:border-slate-800/80 md:mt-auto md:grid-cols-1">
          {canOpenCustomerStorefront && (
            <button onClick={openCustomerStorefront} title="Preview Storefront" className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 text-[10px] font-semibold uppercase text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 ${isExpanded ? '' : 'md:px-0'}`}>
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className={`truncate ${isExpanded ? '' : 'md:hidden'}`}>Preview Storefront</span>
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} title="Logout" className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 text-[10px] font-semibold uppercase text-rose-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 ${isExpanded ? '' : 'md:px-0'}`}>
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={`truncate ${isExpanded ? '' : 'md:hidden'}`}>Logout</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
