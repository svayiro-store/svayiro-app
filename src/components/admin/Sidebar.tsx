import React from 'react';
import { TrendingUp, QrCode, Package, Layers, ShoppingBag, Calendar, Gift, MessageSquare, Bell, BellRing, Image, Settings, LogOut, AlertTriangle, BookOpen } from 'lucide-react';

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
  products: ['admin', 'inventory_manager'],
  categories: ['admin', 'inventory_manager'],
  orders: ['admin', 'delivery_partner', 'customer_care'],
  advances: ['admin'],
  coupons: ['admin'],
  reviews: ['admin', 'customer_care'],
  complaints: ['admin', 'customer_care'],
  adminAlerts: ['admin'],
  banners: ['admin'],
  broadcasting: ['admin'],
  settings: ['admin'],
  manual: ['admin', 'inventory_manager', 'delivery_partner', 'customer_care']
};

export default function Sidebar({ activeMenu, setActiveMenu, ordersCount = 0, advancesCount = 0, reviewsCount = 0, isDarkMode, roles = [], onSwitchMode, onLogout }: Props) {
  const canOpenCustomerStorefront = roles.includes('admin') && Boolean(onSwitchMode);
  const items = [
    { id: 'dashboard', label: 'Dashboard Control', icon: TrendingUp },
    { id: 'pos', label: 'Walk-In Billing (POS)', icon: QrCode },
    { id: 'products', label: 'Products Catalogue', icon: Package },
    { id: 'categories', label: 'Manage Categories', icon: Layers },
    { id: 'orders', label: 'Invoice & Orders', icon: ShoppingBag, badge: ordersCount },
    { id: 'advances', label: 'Advance Bookings', icon: Calendar, badge: advancesCount },
    { id: 'coupons', label: 'Offers Coupons', icon: Gift },
    { id: 'reviews', label: 'Quality Reviews', icon: MessageSquare, badge: reviewsCount },
    { id: 'complaints', label: 'Complaints & Tickets', icon: AlertTriangle },
    { id: 'adminAlerts', label: 'Admin Alerts', icon: BellRing },
    { id: 'banners', label: 'Homepage Banners', icon: Image },
    { id: 'broadcasting', label: 'Alert Bulletins', icon: Bell },
    { id: 'settings', label: 'Store Settings', icon: Settings },
    { id: 'manual', label: 'User Manual', icon: BookOpen }
  ];

  return (
    <aside className={`w-full md:w-64 border-b md:border-r shrink-0 transition-colors p-4 ${isDarkMode ? 'border-[#1e293b] bg-[#090d16]' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6 text-indigo-500" />
        <h2 className="font-extrabold text-indigo-700 text-lg font-mono tracking-wider dark:text-indigo-300">SVAYIRO CONSOLE</h2>
      </div>

      <nav className="flex md:flex-col overflow-x-auto gap-1 border-t md:border-t-0 pt-3 md:pt-0 pb-2 text-xs">
        {items.filter((item) => (menuRoles[item.id] || ['admin']).some((role) => roles.includes(role))).map(item => {
          const Icon = item.icon as any;
          return (
            <button key={item.id} onClick={() => setActiveMenu(item.id)} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg select-none text-left whitespace-nowrap transition-all ${activeMenu === item.id ? 'bg-indigo-700 text-white font-bold shadow-md' : 'opacity-75 hover:opacity-100 text-slate-700 dark:text-slate-300'}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300" />
                <span>{item.label}</span>
              </div>
              {item.badge ? <span className="text-[9px] px-1.5 py-0.2 rounded font-black font-mono leading-none bg-rose-50 text-rose-500">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>

      {(canOpenCustomerStorefront || onLogout) && (
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800/80 hidden md:block space-y-2">
          {canOpenCustomerStorefront && (
            <button onClick={() => onSwitchMode('customer')} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg">
              <ShoppingBag className="h-4 w-4 text-indigo-500" />
              <span>Preview Storefront</span>
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100">
              <LogOut className="h-4 w-4 text-rose-500" />
              <span>Logout Admin</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
