import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import DashboardView from './DashboardView';
import PosView from './PosView';
import ProductsView from './ProductsView';
import OrdersView from './OrdersView';
import CategoriesView from './CategoriesView';
import AdvanceRequestsView from './AdvanceRequestsView';
import CouponsView from './CouponsView';
import ReviewsView from './ReviewsView';
import BroadcastingView from './BroadcastingView';
import BannersView from './BannersView';
import SettingsView from './SettingsView';
import ComplaintsView from './ComplaintsView';
import AdminAlertsView from './AdminAlertsView';
import UserManualView from './UserManualView';
import { useAdminData } from './hooks/useAdminData';
import { api } from '../../api';
import { ShopProfile, Category, Product, Banner, Notification, User } from '../../types';

type PosCartItem = { productId: string; name: string; quantity: number; price: number; maxStock: number; weightGrams?: number };
type PosRegister = { id: string; name: string; cart: PosCartItem[] };

interface AdminAppProps {
  shop: ShopProfile;
  categories: Category[];
  products: Product[];
  banners: Banner[];
  notifications: Notification[];
  activeUser?: User;
  onRefreshData: () => void;
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  onSwitchMode?: (mode: 'customer' | 'admin') => void;
  onLogout?: () => void;
}

type AdminMenu = 'dashboard'|'pos'|'products'|'categories'|'orders'|'advances'|'coupons'|'reviews'|'broadcasting'|'banners'|'settings'|'complaints'|'adminAlerts'|'manual';

const roleMenus: Record<string, AdminMenu[]> = {
  admin: ['dashboard', 'pos', 'products', 'categories', 'orders', 'advances', 'coupons', 'reviews', 'complaints', 'adminAlerts', 'banners', 'broadcasting', 'settings', 'manual'],
  inventory_manager: ['pos', 'products', 'categories', 'manual'],
  delivery_partner: ['orders', 'manual'],
  customer_care: ['orders', 'reviews', 'complaints', 'manual']
};

function allowedMenusForRoles(roles: string[] = []) {
  const menus = roles.flatMap((role) => roleMenus[role] || []);
  return [...new Set(menus)] as AdminMenu[];
}

export default function AdminApp({ shop, categories, products, banners, notifications, activeUser, onRefreshData, isDarkMode, showToast, onSwitchMode, onLogout }: AdminAppProps) {
  const userRoles = Array.isArray(activeUser?.roles) ? activeUser.roles : [];
  const allowedMenus = useMemo(() => allowedMenusForRoles(userRoles), [userRoles.join('|')]);
  const isOwner = userRoles.includes('admin');
  const [activeMenu, setActiveMenu] = useState<AdminMenu>(allowedMenus[0] || 'dashboard');
  const admin = useAdminData(userRoles);
  const [posRegisters, setPosRegisters] = useState<PosRegister[]>([{ id: 'register_1', name: 'Customer 1', cart: [] }]);
  const [activeRegisterId, setActiveRegisterId] = useState('register_1');
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);

  const activeRegister = posRegisters.find((register) => register.id === activeRegisterId) || posRegisters[0];
  const offlineCart = activeRegister?.cart || [];
  const registerSummaries = posRegisters.map((register) => ({
    id: register.id,
    name: register.name,
    itemCount: register.cart.length,
    total: register.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }));

  const updateActiveRegisterCart = (updater: (cart: PosCartItem[]) => PosCartItem[]) => {
    setPosRegisters((prev) => prev.map((register) => (
      register.id === activeRegisterId ? { ...register, cart: updater(register.cart) } : register
    )));
  };

  const addPosRegister = () => {
    const id = `register_${Date.now()}`;
    const registerNumber = Math.max(
      0,
      ...posRegisters.map((register) => Number(register.name.replace(/\D/g, '')) || 0)
    ) + 1;
    setPosRegisters((prev) => [...prev, { id, name: `Customer ${registerNumber}`, cart: [] }]);
    setActiveRegisterId(id);
  };

  const closePosRegister = (id: string) => {
    if (posRegisters.length <= 1) return;
    setPosRegisters((prev) => {
      const next = prev.filter((register) => register.id !== id);
      if (activeRegisterId === id) {
        setActiveRegisterId(next[0]?.id || 'register_1');
      }
      return next;
    });
  };

  useEffect(() => {
    api.getAdminCategories().then(setAdminCategories).catch(() => {});
  }, []);

  const refreshAdminCategories = () => {
    api.getAdminCategories()
      .then(setAdminCategories)
      .catch(() => {});
  };

  const handleAddToOfflineCart = (opts: { productId?: string; qty?: number; priceOverride?: number; customItemName?: string }) => {
    const qty = opts.qty || 1;
    if (opts.customItemName && opts.customItemName.trim()) {
      const pid = 'unlisted_' + Date.now();
      updateActiveRegisterCart(prev => [...prev, { productId: pid, name: opts.customItemName!.trim(), quantity: qty, price: opts.priceOverride || 0, maxStock: 99999, weightGrams: 0 }]);
      return;
    }
    if (!opts.productId) return;
    const product = products.find(p => p.id === opts.productId);
    if (!product) return;
    const price = typeof opts.priceOverride === 'number' && !isNaN(opts.priceOverride) ? opts.priceOverride : (product.offerPrice > 0 ? product.offerPrice : product.basePrice);
    const existing = offlineCart.find(i => i.productId === product.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (newQty > product.stockCount) return;
      updateActiveRegisterCart(prev => prev.map(i => i.productId === product.id ? { ...i, quantity: newQty, price } : i));
    } else {
      updateActiveRegisterCart(prev => [...prev, { productId: product.id, name: product.name, quantity: qty, price, maxStock: product.stockCount, weightGrams: product.weight }]);
    }
  };

  const updateOfflineCartQuantity = (productId: string, delta: number) => {
    const item = offlineCart.find(i => i.productId === productId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      updateActiveRegisterCart(prev => prev.filter(i => i.productId !== productId));
      return;
    }
    if (newQty > item.maxStock) return;
    updateActiveRegisterCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: newQty } : i));
  };

  const removeOfflineCartItem = (productId: string) => {
    updateActiveRegisterCart(prev => prev.filter(i => i.productId !== productId));
  };

  const handleOfflineSaleSubmit = async (overrides?: { customerName?: string; customerPhone?: string; paymentMethod?: 'cod' | 'upi'; upiReference?: string; bagOption?: 'own' | 'need'; bagCost?: number; note?: string }) => {
    if (offlineCart.length === 0) {
      showToast('Cart is empty!', 'warning');
      return;
    }
    const payload = {
      items: offlineCart.map(i => ({ productId: i.productId, quantity: i.quantity, name: i.name, price: i.price, isUnlisted: i.productId.startsWith('unlisted_') })),
      customerName: overrides?.customerName || 'Walk-In Customer',
      customerPhone: overrides?.customerPhone || '',
      paymentMethod: overrides?.paymentMethod || 'cod',
      upiReference: overrides?.upiReference,
      bagOption: overrides?.bagOption || 'own',
      bagCharge: overrides?.bagCost || 0,
      note: overrides?.note || ''
    };

    try {
      const res = await api.recordOfflineSale(payload);
      if (res?.success) {
        showToast('Sale recorded!', 'success');
        updateActiveRegisterCart(() => []);
        admin.refresh();
        onRefreshData();
        return res.order;
      } else {
        showToast('Failed', 'error');
        throw new Error('Failed to record sale');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
      throw err;
    }
  };

  const handleFilterInventoryLogs = async (filters?: { date?: string }) => {
    try {
      const logs = await api.getInventoryLogs(filters);
      admin.setInventoryLogs?.(logs);
    } catch (err: any) {
      showToast(err?.message || 'Unable to filter inventory logs', 'error');
    }
  };

  const handleCleanupInventoryLogs = async (olderThan: '1w' | '1m' | '2m' | '3m' | '5m') => {
    const res = await api.cleanupInventoryLogs(olderThan);
    showToast(`${res.deletedCount || 0} inventory logs deleted.`, 'success');
    admin.refresh();
    return res.deletedCount;
  };

  const lowStockProducts = products
    .filter((product) => product.stockCount <= (product.lowStockAlertThreshold ?? 10))
    .sort((a, b) => a.stockCount - b.stockCount);
  const activeOrdersCount = admin.orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled').length;

  const openProductFromDashboard = (productId: string) => {
    setFocusedProductId(productId);
    setActiveMenu('products');
  };

  useEffect(() => {
    if (allowedMenus.length > 0 && !allowedMenus.includes(activeMenu)) {
      setActiveMenu(allowedMenus[0]);
    }
  }, [activeMenu, allowedMenus]);

  return (
    <div className={`flex-1 flex flex-col md:flex-row ${isDarkMode ? 'bg-[#0f172a] text-[#f8fafc]' : 'bg-[#fafafa] text-slate-800'}`}>
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} ordersCount={activeOrdersCount} advancesCount={admin.advRequests.length} reviewsCount={admin.reviews.length} isDarkMode={isDarkMode} roles={userRoles} onSwitchMode={onSwitchMode} onLogout={onLogout} />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {activeMenu === 'dashboard' && <DashboardView reportsLoading={admin.reportsLoading} isDarkMode={isDarkMode} reports={admin.reports} lowStockProducts={lowStockProducts} onOpenLowStockProduct={openProductFromDashboard} />}
        {activeMenu === 'pos' && <PosView isDarkMode={isDarkMode} products={products} offlineCart={offlineCart} registers={registerSummaries} activeRegisterId={activeRegisterId} bags={admin.bags} inventoryLogs={admin.invLogs} canOverridePrice={isOwner} onSelectRegister={setActiveRegisterId} onAddRegister={addPosRegister} onCloseRegister={closePosRegister} onFilterInventoryLogs={handleFilterInventoryLogs} onCleanupInventoryLogs={handleCleanupInventoryLogs} onAddToCart={handleAddToOfflineCart} onUpdateQuantity={updateOfflineCartQuantity} onRemoveItem={removeOfflineCartItem} onSubmitSale={handleOfflineSaleSubmit} onClearCart={() => updateActiveRegisterCart(() => [])} />}
        {activeMenu === 'products' && <ProductsView isDarkMode={isDarkMode} focusedProductId={focusedProductId} onFocusedProductHandled={() => setFocusedProductId(null)} />}
        {activeMenu === 'orders' && <OrdersView orders={admin.orders} shop={shop} roles={userRoles} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'categories' && <CategoriesView categories={adminCategories} isDarkMode={isDarkMode} showToast={showToast} refresh={() => { refreshAdminCategories(); onRefreshData(); }} />}
        {activeMenu === 'advances' && <AdvanceRequestsView advanceRequests={admin.advRequests} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'coupons' && <CouponsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'reviews' && <ReviewsView reviews={admin.reviews} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'broadcasting' && <BroadcastingView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'banners' && <BannersView isDarkMode={isDarkMode} showToast={showToast} refresh={onRefreshData} categories={categories} products={products} />}
        {activeMenu === 'settings' && <SettingsView shop={shop} isDarkMode={isDarkMode} showToast={showToast} refresh={() => { onRefreshData(); admin.refresh(); }} />}
        {activeMenu === 'complaints' && <ComplaintsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'adminAlerts' && <AdminAlertsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'manual' && <UserManualView roles={userRoles} isDarkMode={isDarkMode} />}
      </main>
    </div>
  );
}
