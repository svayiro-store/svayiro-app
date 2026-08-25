import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import DashboardView from './DashboardView';
import PosView from './PosView';
import ProductsView from './ProductsView';
import LooseLabelsView from './LooseLabelsView';
import OrdersView from './OrdersView';
import CategoriesView from './CategoriesView';
import AdvanceRequestsView from './AdvanceRequestsView';
import CouponsView from './CouponsView';
import CampaignsView from './CampaignsView';
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
import { Bell, PackageSearch, ShoppingBag, UserCircle } from 'lucide-react';
import { enablePushNotifications, wasPushEnabled } from '../../utils/pushNotifications';

type PosCartItem = {
  cartKey?: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  maxStock: number;
  weightGrams?: number;
  stockQuantity?: number;
  displayQuantityLabel?: string;
  scannedBarcode?: string;
  isLooseLabel?: boolean;
  directLoose?: boolean;
};
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

type AdminMenu = 'dashboard'|'pos'|'looseLabels'|'products'|'categories'|'orders'|'advances'|'coupons'|'campaigns'|'reviews'|'broadcasting'|'banners'|'settings'|'complaints'|'adminAlerts'|'manual';

const menuTitles: Record<AdminMenu, string> = {
  dashboard: 'Dashboard Control',
  pos: 'Walk-In Billing POS',
  looseLabels: 'Loose Weighing Labels',
  products: 'Products Catalogue',
  categories: 'Manage Categories',
  orders: 'Invoice & Orders',
  advances: 'Advance Bookings',
  coupons: 'Offers & Coupons',
  campaigns: 'Campaigns & Occasion Offers',
  reviews: 'Quality Reviews',
  broadcasting: 'Alert Bulletins',
  banners: 'Homepage Banners',
  settings: 'Store Settings',
  complaints: 'Complaints & Tickets',
  adminAlerts: 'Admin Alerts',
  manual: 'Role User Manual'
};

const roleLabels: Record<string, string> = {
  admin: 'Owner',
  inventory_manager: 'Inventory Manager',
  delivery_partner: 'Delivery Partner',
  customer_care: 'Customer Care'
};

const roleMenus: Record<string, AdminMenu[]> = {
  admin: ['dashboard', 'pos', 'looseLabels', 'products', 'categories', 'orders', 'advances', 'coupons', 'campaigns', 'reviews', 'complaints', 'adminAlerts', 'banners', 'broadcasting', 'settings', 'manual'],
  inventory_manager: ['pos', 'looseLabels', 'products', 'categories', 'manual'],
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
  const [adminPushEnabled, setAdminPushEnabled] = useState(() => wasPushEnabled('admin'));
  const [adminPushSaving, setAdminPushSaving] = useState(false);

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

  const handleAddToOfflineCart = (opts: { productId?: string; qty?: number; priceOverride?: number; customItemName?: string; product?: Product; scannedBarcode?: string; looseStockQuantity?: number; directLoose?: boolean }) => {
    const qty = Math.max(1, Number(opts.qty || 1));
    if (opts.customItemName && opts.customItemName.trim()) {
      const pid = 'unlisted_' + Date.now();
      updateActiveRegisterCart(prev => [...prev, { cartKey: pid, productId: pid, name: opts.customItemName!.trim(), quantity: qty, price: Math.max(0, Number(opts.priceOverride || 0)), maxStock: 99999, weightGrams: 0 }]);
      return;
    }
    if (!opts.productId) return;
    const product = opts.product || products.find(p => p.id === opts.productId);
    if (!product) return;
    if (opts.directLoose) {
      const stockQuantity = Math.max(0, Number(opts.looseStockQuantity || 0));
      const metadata = product.metadata || {};
      const stockUnit = product.stockUnit || metadata.stockUnit || 'g';
      const sellingUnit = String(product.sellingUnit || metadata.sellingUnit || metadata.unit || 'kg').toLowerCase();
      const packageQuantity = Math.max(0.001, Number(product.packageQuantity || metadata.packageQuantity || 1));
      const factor = (stockUnit === 'g' ? (sellingUnit === 'g' ? stockQuantity : stockQuantity / 1000) : stockUnit === 'ml' ? (sellingUnit === 'ml' ? stockQuantity : stockQuantity / 1000) : stockQuantity) / packageQuantity;
      const rate = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
      if (!product.isLooseItem && !metadata.isLooseItem) {
        showToast('This product is not configured as a loose-weight item.', 'error');
        return;
      }
      if (stockQuantity <= 0 || stockQuantity > Number(product.stockCount || 0)) {
        showToast(`Enter a weight within available stock for ${product.name}.`, 'error');
        return;
      }
      const displayQuantityLabel = `${stockQuantity} ${stockUnit}`;
      updateActiveRegisterCart(prev => [...prev, {
        cartKey: `direct_loose_${product.id}_${Date.now()}`,
        productId: product.id,
        name: `${product.name} (${displayQuantityLabel})`,
        quantity: 1,
        price: Math.max(0, Number((rate * factor).toFixed(2))),
        maxStock: 1,
        weightGrams: stockUnit === 'g' ? stockQuantity : Number(product.weight || 0),
        stockQuantity,
        displayQuantityLabel,
        isLooseLabel: true,
        directLoose: true
      }]);
      return;
    }
    const looseScan = product.metadata?.looseScan;
    if (looseScan) {
      const scannedBarcode = opts.scannedBarcode || looseScan.barcodeValue;
      if (offlineCart.some((item) => item.scannedBarcode && item.scannedBarcode === scannedBarcode)) {
        showToast('This loose item label is already in the cart.', 'warning');
        return;
      }
      const stockQuantity = Math.max(0, Number(looseScan.stockQuantity ?? looseScan.baseQuantity ?? 0));
      if (stockQuantity <= 0) {
        showToast('Loose item label quantity is invalid.', 'error');
        return;
      }
      if (stockQuantity > Number(product.stockCount || 0)) {
        showToast(`Insufficient stock for ${product.name}.`, 'error');
        return;
      }
      const displayQuantityLabel = String(looseScan.quantityLabel || `${stockQuantity} ${product.stockUnit || 'g'}`);
      const stockUnit = product.stockUnit || product.metadata?.stockUnit || 'g';
      const sellingUnit = String(product.sellingUnit || product.metadata?.sellingUnit || product.metadata?.unit || 'kg').toLowerCase();
      const packageQuantity = Math.max(0.001, Number(product.packageQuantity || product.metadata?.packageQuantity || 1));
      const factor = (stockUnit === 'g' ? (sellingUnit === 'g' ? stockQuantity : stockQuantity / 1000) : stockUnit === 'ml' ? (sellingUnit === 'ml' ? stockQuantity : stockQuantity / 1000) : stockQuantity) / packageQuantity;
      const rate = product.offerPrice > 0 ? product.offerPrice : product.basePrice;
      const cartKey = `loose_${scannedBarcode || Date.now()}`;
      updateActiveRegisterCart(prev => [...prev, {
        cartKey,
        productId: product.id,
        name: `${product.name} (${displayQuantityLabel})`,
        quantity: 1,
        // Recalculate from the current catalog rate; labels identify the product
        // and measured weight, but cannot be used to override price.
        price: Math.max(0, Number((rate * factor).toFixed(2))),
        maxStock: 1,
        weightGrams: stockUnit === 'g' ? stockQuantity : product.weight,
        stockQuantity,
        displayQuantityLabel,
        scannedBarcode,
        isLooseLabel: true
      }]);
      return;
    }
    const price = typeof opts.priceOverride === 'number' && !isNaN(opts.priceOverride) ? opts.priceOverride : (product.offerPrice > 0 ? product.offerPrice : product.basePrice);
    const existing = offlineCart.find(i => (i.cartKey || i.productId) === product.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (newQty > product.stockCount) return;
      updateActiveRegisterCart(prev => prev.map(i => (i.cartKey || i.productId) === product.id ? { ...i, quantity: newQty, price } : i));
    } else {
      updateActiveRegisterCart(prev => [...prev, { cartKey: product.id, productId: product.id, name: product.name, quantity: qty, price: Math.max(0, Number(price || 0)), maxStock: product.stockCount, weightGrams: product.weight }]);
    }
  };

  const updateOfflineCartQuantity = (cartKey: string, delta: number) => {
    const item = offlineCart.find(i => (i.cartKey || i.productId) === cartKey);
    if (!item) return;
    if (item.isLooseLabel) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      updateActiveRegisterCart(prev => prev.filter(i => (i.cartKey || i.productId) !== cartKey));
      return;
    }
    if (newQty > item.maxStock) return;
    updateActiveRegisterCart(prev => prev.map(i => (i.cartKey || i.productId) === cartKey ? { ...i, quantity: newQty } : i));
  };

  const removeOfflineCartItem = (cartKey: string) => {
    updateActiveRegisterCart(prev => prev.filter(i => (i.cartKey || i.productId) !== cartKey));
  };

  const handleOfflineSaleSubmit = async (overrides?: { customerName?: string; customerPhone?: string; paymentMethod?: 'cod' | 'upi'; upiReference?: string; bagOption?: 'own' | 'need'; bagCost?: number; note?: string }) => {
    if (offlineCart.length === 0) {
      showToast('Cart is empty!', 'warning');
      return;
    }
    const payload = {
      items: offlineCart.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        name: i.name,
        price: i.price,
        isUnlisted: i.productId.startsWith('unlisted_'),
        stockQuantity: i.stockQuantity,
        displayQuantityLabel: i.displayQuantityLabel,
        scannedBarcode: i.scannedBarcode,
        isLooseLabel: i.isLooseLabel,
        directLoose: i.directLoose
      })),
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
      const logs = await api.getInventoryLogs({ ...filters, limit: 100, offset: 0 });
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
  const lowStockCount = Number(admin.reports?.lowStockCount ?? lowStockProducts.length);
  const primaryRole = userRoles.find((role) => roleLabels[role]) || userRoles[0] || 'console';
  const roleLabel = roleLabels[primaryRole] || primaryRole.replace(/_/g, ' ');

  const openProductFromDashboard = (productId: string) => {
    setFocusedProductId(productId);
    setActiveMenu('products');
  };

  const handleEnableAdminPush = async () => {
    setAdminPushSaving(true);
    try {
      await enablePushNotifications('admin');
      setAdminPushEnabled(true);
      showToast('Console notifications enabled on this device.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Unable to enable console notifications.', 'error');
    } finally {
      setAdminPushSaving(false);
    }
  };

  useEffect(() => {
    if (allowedMenus.length > 0 && !allowedMenus.includes(activeMenu)) {
      setActiveMenu(allowedMenus[0]);
    }
  }, [activeMenu, allowedMenus]);

  return (
    <div className={`flex-1 flex h-screen min-h-0 flex-col overflow-hidden md:flex-row ${isDarkMode ? 'bg-[#0f172a] text-[#f8fafc]' : 'bg-[#f6f8fb] text-slate-800'}`}>
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} ordersCount={activeOrdersCount} advancesCount={admin.advRequests.length} reviewsCount={admin.reviews.length} isDarkMode={isDarkMode} roles={userRoles} onSwitchMode={onSwitchMode} onLogout={onLogout} />
      <main className="min-h-0 flex-1 overflow-y-auto md:ml-[76px]">
        <section className={`sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-xl md:px-6 ${isDarkMode ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-white/92'}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-800 ">SVAYIRO Console</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${shop.isOpen ? 'bg-emerald-50 text-emerald-700  ' : 'bg-rose-50 text-rose-700  '}`}>
                  <span className={`h-2 w-2 rounded-full ${shop.isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {shop.isOpen ? 'Store Open' : 'Store Closed'}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500 ">
                {menuTitles[activeMenu]} - Logged in as {activeUser?.name || 'Console User'} - {roleLabel}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
              {!adminPushEnabled && (
                <button
                  type="button"
                  onClick={handleEnableAdminPush}
                  disabled={adminPushSaving}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-60 ${isDarkMode ? 'border-slate-800 bg-slate-900/70 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <Bell className="h-3.5 w-3.5 text-indigo-600" />
                  {adminPushSaving ? 'Enabling...' : 'Enable Alerts'}
                </button>
              )}
              <div className={`flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${isDarkMode ? 'border-slate-800 bg-slate-900/70 text-slate-200' : 'border-slate-200 bg-slate-50/80 text-slate-700'}`}>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <ShoppingBag className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="text-slate-400">Pending</span>
                  <span>{activeOrdersCount}</span>
                </span>
                <span className="hidden h-4 w-px bg-slate-200  sm:block" />
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <PackageSearch className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-slate-400">Low / Out</span>
                  <span>{lowStockCount}</span>
                </span>
                <span className="hidden h-4 w-px bg-slate-200  sm:block" />
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <UserCircle className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="text-slate-400">Role</span>
                  <span className="capitalize">{roleLabel}</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="p-4 md:p-6 xl:p-8">
        {activeMenu === 'dashboard' && <DashboardView reportsLoading={admin.reportsLoading} isDarkMode={isDarkMode} reports={admin.reports} lowStockProducts={lowStockProducts} onOpenLowStockProduct={openProductFromDashboard} />}
        {activeMenu === 'pos' && <PosView isDarkMode={isDarkMode} products={products} shop={shop} cashierName={activeUser?.name || activeUser?.staffLoginId || 'Cashier'} offlineCart={offlineCart} registers={registerSummaries} activeRegisterId={activeRegisterId} bags={admin.bags} inventoryLogs={admin.invLogs} canOverridePrice={isOwner} onSelectRegister={setActiveRegisterId} onAddRegister={addPosRegister} onCloseRegister={closePosRegister} onFilterInventoryLogs={handleFilterInventoryLogs} onCleanupInventoryLogs={handleCleanupInventoryLogs} onAddToCart={handleAddToOfflineCart} onUpdateQuantity={updateOfflineCartQuantity} onRemoveItem={removeOfflineCartItem} onSubmitSale={handleOfflineSaleSubmit} onClearCart={() => updateActiveRegisterCart(() => [])} />}
        {activeMenu === 'looseLabels' && <LooseLabelsView isDarkMode={isDarkMode} barcodeLabelPrintSettings={shop.barcodeLabelPrintSettings} />}
        {activeMenu === 'products' && <ProductsView isDarkMode={isDarkMode} barcodeLabelPrintSettings={shop.barcodeLabelPrintSettings} focusedProductId={focusedProductId} onFocusedProductHandled={() => setFocusedProductId(null)} />}
        {activeMenu === 'orders' && <OrdersView orders={admin.orders} shop={shop} roles={userRoles} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'categories' && <CategoriesView categories={adminCategories} isDarkMode={isDarkMode} showToast={showToast} refresh={() => { refreshAdminCategories(); onRefreshData(); }} />}
        {activeMenu === 'advances' && <AdvanceRequestsView advanceRequests={admin.advRequests} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'coupons' && <CouponsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'campaigns' && <CampaignsView isDarkMode={isDarkMode} showToast={showToast} products={products} categories={categories} refresh={onRefreshData} />}
        {activeMenu === 'reviews' && <ReviewsView reviews={admin.reviews} isDarkMode={isDarkMode} refresh={admin.refresh} showToast={showToast} />}
        {activeMenu === 'broadcasting' && <BroadcastingView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'banners' && <BannersView isDarkMode={isDarkMode} showToast={showToast} refresh={onRefreshData} categories={categories} products={products} />}
        {activeMenu === 'settings' && <SettingsView shop={shop} isDarkMode={isDarkMode} showToast={showToast} refresh={() => { onRefreshData(); admin.refresh(); }} />}
        {activeMenu === 'complaints' && <ComplaintsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'adminAlerts' && <AdminAlertsView isDarkMode={isDarkMode} showToast={showToast} />}
        {activeMenu === 'manual' && <UserManualView roles={userRoles} isDarkMode={isDarkMode} />}
        </div>
      </main>
    </div>
  );
}
