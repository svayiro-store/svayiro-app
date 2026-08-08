import React, { useState } from 'react';
import { 
  FileText, ShoppingCart, RefreshCw, X, AlertTriangle, ChevronDown, ChevronUp 
} from 'lucide-react';
import { CustomerTab, Order, Product, User as UserType } from '../../types';
import { api } from '../../api';
import { formatDateTimeDDMMYYYY } from '../../utils/date';

interface OrdersViewProps {
  activeUser: UserType | null;
  orders: Order[];
  loadingOrders: boolean;
  products: Product[];
  fetchUserOrders: (silent?: boolean) => void;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>> | ((orders: Order[] | ((prev: Order[]) => Order[])) => void);
  onRefreshData: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  setActiveTab: (tab: CustomerTab) => void;
  clearCart: (silent?: boolean) => void;
  addToCart: (productId: string, qty: number, silent?: boolean) => void;
  isDarkMode: boolean;
  setIsAuthOpen: (open: boolean) => void;
}

export default function OrdersView({
  activeUser,
  orders,
  loadingOrders,
  products,
  fetchUserOrders,
  setOrders,
  onRefreshData,
  showToast,
  setActiveTab,
  clearCart,
  addToCart,
  isDarkMode,
  setIsAuthOpen
}: OrdersViewProps) {
  const [orderIdToCancel, setOrderIdToCancel] = useState<string | null>(null);
  const [isCancellingApi, setIsCancellingApi] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleReorder = (ord: Order) => {
    const reorderableItems = ord.items
      .map((item) => {
        const product = products.find((prod) => prod.id === item.productId);
        if (!product || product.isEnabled === false || product.stockCount <= 0) return null;
        return {
          productId: product.id,
          quantity: Math.min(Number(item.quantity || 1), product.stockCount)
        };
      })
      .filter(Boolean) as { productId: string; quantity: number }[];

    if (reorderableItems.length === 0) {
      showToast('No items from this order are currently available for reorder.', 'warning');
      return;
    }

    clearCart(true);
    reorderableItems.forEach((item) => addToCart(item.productId, item.quantity, true));
    setActiveTab('cart');

    const skippedCount = ord.items.length - reorderableItems.length;
    showToast(
      skippedCount > 0
        ? `Reorder added ${reorderableItems.length} available item(s). ${skippedCount} unavailable item(s) were skipped.`
        : 'Reorder ready. All available items were added to your shopping bag.',
      skippedCount > 0 ? 'info' : 'success'
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-left">My Order Book Insights</h2>
      
      {!activeUser ? (
        <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
          <FileText className="h-12 w-12 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold opacity-75">Sign in to track orders</p>
          <p className="text-xs opacity-60 mt-1">Check current packing status, retrieve past tax invoices, or trigger instant reorders.</p>
          <button onClick={() => setIsAuthOpen(true)} className="mt-4 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full">Login or Register</button>
        </div>
      ) : loadingOrders ? (
        <div className="p-8 text-center"><RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mx-auto" /></div>
      ) : orders.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
          <ShoppingCart className="h-12 w-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold opacity-75">No orders found on this profile yet</p>
          <p className="text-xs opacity-60 mt-1">Place your initial order with SVAYIRO to track its delivery slots!</p>
          <button onClick={() => setActiveTab('home')} className="mt-4 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full">Order Fresh Atta</button>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((ord) => {
            const statusColors: Record<string, string> = {
              pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900',
              accepted: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/60',
              packed: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60',
              out_for_delivery: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60',
              delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60',
              cancelled: 'bg-rose-50 text-red-600 border-rose-200 dark:bg-rose-950/20 dark:text-red-400 dark:border-rose-900/80'
            };

            // Step indices for order visual tracker
            const stages = ['pending', 'accepted', 'packed', 'out_for_delivery', 'delivered'];
            const currentStageIdx = stages.indexOf(ord.status);
            const isCancelled = ord.status === 'cancelled';
            const isExpanded = !!expandedOrders[ord.id];

            const isUpi = (ord.paymentMethod || ord.paymentDetails?.method || '').toLowerCase() === 'upi';
            const payStatus = (ord.paymentStatus || ord.paymentDetails?.status || 'pending').toLowerCase();
            const isUpiPendingVerification = isUpi && payStatus !== 'paid' && payStatus !== 'failed';

            return (
              <div 
                key={ord.id}
                onClick={() => toggleOrderExpand(ord.id)}
                className={`border rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 relative overflow-hidden text-left cursor-pointer ${
                  isCancelled 
                    ? 'border-red-200 dark:border-red-950/60 bg-red-50/5 dark:bg-red-950/5 hover:bg-red-50/10' 
                    : isDarkMode 
                      ? 'border-[#1e293b] bg-[#1e293b]/20 hover:border-slate-800 hover:bg-[#1e293b]/30' 
                      : 'border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50/30 shadow-md/5'
                }`}
              >
                {/* Top bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Order identifier</span>
                      <span className="text-xs font-mono font-extrabold text-indigo-700 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg dark:text-indigo-300">
                        {ord.id}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-60 font-mono">{formatDateTimeDDMMYYYY(ord.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-3 py-1 rounded-full uppercase font-semibold tracking-widest border shadow-sm ${statusColors[ord.status] || 'bg-slate-100'}`}>
                      {isCancelled ? '❌ Cancelled' : ord.status.replace(/_/g, ' ')}
                    </span>

                    {/* Customer UPI Store Verification Pending Badge */}
                    {isUpiPendingVerification && (
                      <span className="text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Store Verification Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Collapsed view item names summary */}
                <div className="py-1">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Ordered Items</p>
                  <div className="space-y-1.5">
                    {ord.items.map((item, idx) => (
                      <div key={idx} className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                          <span className="truncate max-w-[200px] sm:max-w-md">{item.productName}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded shrink-0 font-bold">
                          Qty: {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer bar with Total & Toggle click indicator */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] opacity-65 font-bold uppercase tracking-wider text-slate-400">Total Price:</span>
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">₹{ord.finalTotal}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleReorder(ord);
                      }}
                      className="rounded-full bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold uppercase text-white shadow hover:bg-indigo-500"
                    >
                      Reorder
                    </button>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 animate-bounce" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div 
                    className="pt-4 border-t border-slate-100 dark:border-slate-800/80 mt-3 space-y-5 animate-fadeIn"
                    onClick={(e) => {
                      // Prevent closing card when clicking interactive details/buttons inside
                      e.stopPropagation();
                    }}
                  >
                    {/* Timeline flow tracker */}
                    {!isCancelled ? (
                      <div className="py-2">
                        <div className="relative flex items-center justify-between">
                          {/* Background tracking line */}
                          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-100 dark:bg-slate-800 -translate-y-1/2 z-0" />
                          {/* Filled active tracking line */}
                          <div 
                            className="absolute left-0 top-1/2 h-0.5 bg-indigo-500 -translate-y-1/2 z-0 transition-all duration-500" 
                            style={{ width: `${(Math.max(0, currentStageIdx) / (stages.length - 1)) * 100}%` }}
                          />

                          {stages.map((stage, sIdx) => {
                            const isCompleted = sIdx <= currentStageIdx;
                            const isActive = sIdx === currentStageIdx;
                            const labels: Record<string, string> = {
                              pending: 'Placed',
                              accepted: 'Accepted',
                              packed: 'Packed',
                              out_for_delivery: 'Shipped',
                              delivered: 'Delivered'
                            };

                            return (
                              <div key={stage} className="relative z-10 flex flex-col items-center">
                                <div className={`h-4 w-4 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                  isActive
                                    ? 'bg-indigo-600 border-indigo-600 ring-4 ring-indigo-500/20' 
                                    : isCompleted 
                                      ? 'bg-indigo-500 border-indigo-500' 
                                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                                }`}>
                                  {isCompleted && sIdx < currentStageIdx && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                                </div>
                                <span className={`text-[9px] font-bold mt-1 tracking-tight ${
                                  isActive 
                                    ? 'text-indigo-600 dark:text-indigo-400' 
                                    : isCompleted 
                                      ? 'opacity-85' 
                                      : 'opacity-40'
                                }`}>
                                  {labels[stage]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/10 text-center font-mono">
                        <p className="text-[11px] text-red-600 dark:text-red-400 font-extrabold flex items-center justify-center gap-1">
                          ⚠️ This order was completely cancelled. Stock inventory has been restored safely.
                        </p>
                      </div>
                    )}

                    {/* Purchased Item Grid with Images */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Detailed Item Breakdown</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ord.items.map((item, idx) => {
                          const matchingProd = products.find(p => p.id === item.productId);
                          const itemImg = (matchingProd && matchingProd.images && matchingProd.images.length > 0)
                            ? matchingProd.images[0]
                            : "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=300";

                          return (
                            <div 
                              key={idx} 
                              className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all duration-300 ${
                                isDarkMode 
                                  ? 'border-[#1e293b]/50 bg-slate-900/40 hover:bg-slate-900/60' 
                                  : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                              }`}
                            >
                              <img 
                                src={itemImg} 
                                alt={item.productName} 
                                referrerPolicy="no-referrer"
                                className="h-12 w-12 object-cover rounded-lg shrink-0 border border-slate-200 dark:border-slate-800 bg-white shadow-sm"
                              />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">
                                  {item.productName}
                                </h4>
                                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-xs">
                                    ₹{item.price}
                                  </span>
                                  <span>×</span>
                                  <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-semibold text-slate-700 dark:text-slate-300">
                                    {item.quantity} Qty
                                  </span>
                                  {item.weightGrams ? (
                                    <>
                                      <span>•</span>
                                      <span>
                                        {item.weightGrams >= 1000 ? `${item.weightGrams / 1000}kg` : `${item.weightGrams}g`}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fulfillment & Financial details grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50/50 dark:bg-[#111827]/40 border border-slate-100 dark:border-slate-800/80 text-xs">
                      <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 pb-3 md:pb-0 md:pr-4">
                        <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">Fulfillment Plan</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-1 uppercase">
                          🚚 {ord.deliveryMethod === 'delivery' ? 'Local Delivery' : 'Self Pickup'}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Slot: {ord.selectedSlot}</p>
                        {ord.deliveryAddress && (
                          <p className="text-slate-500 dark:text-slate-400 truncate mt-1 text-[11px]" title={`${ord.deliveryAddress.flatAndHouse}, ${ord.deliveryAddress.areaAndStreet}`}>
                            📍 {ord.deliveryAddress.flatAndHouse}, {ord.deliveryAddress.areaAndStreet}
                          </p>
                        )}
                      </div>
                      
                      <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 pb-3 md:pb-0 md:px-4">
                        <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">Financial summary</p>
                        <p className="font-bold text-lg text-indigo-700 dark:text-indigo-300 mt-0.5">₹{ord.finalTotal}</p>
                        <div className="text-[11px] opacity-75 font-mono mt-1 flex items-center gap-1.5">
                          <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
                            {ord.paymentDetails?.method || ord.paymentMethod || 'COD'}
                          </span>
                          <span className={`font-semibold uppercase ${(ord.paymentDetails?.status || ord.paymentStatus) === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            ({ord.paymentDetails?.status || ord.paymentStatus || 'pending'})
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1 md:pt-0 md:pl-4 flex flex-col justify-center">
                        <p className="text-[10px] font-bold uppercase opacity-65 tracking-wider">Order Timeline</p>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Created: {formatDateTimeDDMMYYYY(ord.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Manual Order Interactions */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                      {orderIdToCancel === ord.id ? (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div>
                            <p className="text-xs text-rose-700 dark:text-rose-400 font-extrabold uppercase tracking-wide">
                              Cancel Order #{ord.id}?
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Stock inventory will be restored instantly. This action cannot be undone.
                            </p>
                          </div>
                          <div className="flex gap-2 self-end sm:self-auto">
                            <button
                              onClick={async () => {
                                try {
                                  setIsCancellingApi(true);
                                  await api.updateOrderStatus(ord.id, 'cancelled');
                                  if (typeof setOrders === 'function') {
                                    (setOrders as any)(prev => (prev as Order[]).map(o => o.id === ord.id ? { ...o, status: 'cancelled' } as Order : o));
                                  }
                                  setOrderIdToCancel(null);
                                  fetchUserOrders(true);
                                  onRefreshData();
                                  showToast('Order cancelled successfully', 'info');
                                } catch (err: any) {
                                  showToast(`Failed to cancel order: ${err.message || err}`, 'error');
                                } finally {
                                  setIsCancellingApi(false);
                                }
                              }}
                              disabled={isCancellingApi}
                              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition-all shadow-sm"
                            >
                              {isCancellingApi ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              onClick={() => setOrderIdToCancel(null)}
                              disabled={isCancellingApi}
                              className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all"
                            >
                              Keep Order
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 select-none">
                          {(ord.status === 'pending' || ord.status === 'accepted' || ord.status === 'packed') ? (
                            <button 
                              onClick={() => setOrderIdToCancel(ord.id)}
                              className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-600 hover:text-rose-700 font-extrabold text-xs px-4 py-2 border border-rose-200 dark:border-rose-900 rounded-full flex items-center gap-1.5 transition-all shadow-sm shrink-0 uppercase tracking-wider font-mono"
                            >
                              <span>Cancel Order</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono opacity-65 text-rose-500 font-bold uppercase tracking-wider">
                              {isCancelled ? '❌ Cancelled' : "⚠️ Order cannot be cancelled now"}
                            </span>
                          )}

                          <button 
                            onClick={() => {
                              clearCart(true);
                              for (const item of ord.items) {
                                addToCart(item.productId, item.quantity, true);
                              }
                              setActiveTab('cart');
                              showToast('🛒 Reordered! All items cloned to your shopping bag. Feel free to adjust quantities.', 'success');
                            }}
                            className="hidden"
                          >
                            Quick Reorder
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
