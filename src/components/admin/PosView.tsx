import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  ClipboardList,
  CreditCard,
  Delete,
  Minus,
  PackageSearch,
  Plus,
  QrCode,
  Receipt,
  ShoppingBag,
  Trash2,
  Printer,
  Send
} from 'lucide-react';
import QRCode from 'qrcode';
import { Bag, InventoryLog, Product } from '../../types';
import { formatDateTimeDDMMYYYY } from '../../utils/date';
import { api } from '../../api';

type PosCartItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  maxStock: number;
  weightGrams?: number;
};

type RegisterSession = {
  selectedProductId: string;
  customItemName: string;
  qtyInput: string;
  priceOverride: string;
  keypadTarget: 'qty' | 'price';
  customerName: string;
  customerPhone: string;
  paymentMethod: 'cod' | 'upi';
  upiReference: string;
  transactionNote: string;
  bagOption: 'own' | 'need';
};

interface Props {
  isDarkMode: boolean;
  products: Product[];
  offlineCart: PosCartItem[];
  registers?: { id: string; name: string; itemCount: number; total: number }[];
  activeRegisterId?: string;
  bags?: Bag[];
  inventoryLogs?: InventoryLog[];
  canOverridePrice?: boolean;
  onSelectRegister?: (id: string) => void;
  onAddRegister?: () => void;
  onCloseRegister?: (id: string) => void;
  onFilterInventoryLogs?: (filters?: { date?: string }) => void;
  onCleanupInventoryLogs?: (olderThan: '1w' | '1m' | '2m' | '3m' | '5m') => Promise<number | void> | number | void;
  onAddToCart?: (opts: { productId?: string; qty?: number; priceOverride?: number; customItemName?: string }) => void;
  onUpdateQuantity?: (id: string, delta: number) => void;
  onRemoveItem?: (id: string) => void;
  onSubmitSale?: (overrides?: {
    customerName?: string;
    customerPhone?: string;
    paymentMethod?: 'cod' | 'upi';
    upiReference?: string;
    bagOption?: 'own' | 'need';
    bagCost?: number;
    note?: string;
  }) => any | Promise<any>;
  onClearCart?: () => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
const panelClass = 'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';

/** Pre-texted WhatsApp message for POS Walk-In Customer */
function buildPosWhatsAppMessage(
  customerName: string, 
  grandTotal: number, 
  invoiceUrl?: string, 
  websiteUrl = 'https://svayiro.co.in'
) {
  const publicInvoiceLink = invoiceUrl || websiteUrl;

  return [
    `Namaste *${customerName || 'Customer'}*,`,
    `Your SVAYIRO store bill is ready.`,
    '',
    `*Status:* COMPLETED`,
    `*Amount:* Rs. ${grandTotal.toFixed(2)}`,
    '',
    '*View / print bill:*',
    publicInvoiceLink,
    '',
    '*Shop again:*',
    websiteUrl,
    '',
    'Thank you for shopping with SVAYIRO.',
    '*SVAYIRO*',
    '_Trust In Every Choice._'
  ].join('\n');
}

/** Open Normal WhatsApp with pre-texted message */
function openPosWhatsAppBill(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '');
  const target = digits.length === 10 ? `91${digits}` : digits;
  window.open(`https://wa.me/${target}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

const emptyRegisterSession = (): RegisterSession => ({
  selectedProductId: '',
  customItemName: '',
  qtyInput: '1',
  priceOverride: '',
  keypadTarget: 'qty',
  customerName: '',
  customerPhone: '',
  paymentMethod: 'cod',
  upiReference: '',
  transactionNote: '',
  bagOption: 'own'
});

export default function PosView({
  isDarkMode,
  products,
  offlineCart,
  registers = [],
  activeRegisterId,
  bags = [],
  inventoryLogs = [],
  onSelectRegister,
  onAddRegister,
  onCloseRegister,
  onFilterInventoryLogs,
  onCleanupInventoryLogs,
  canOverridePrice = true,
  onAddToCart,
  onUpdateQuantity,
  onRemoveItem,
  onSubmitSale,
  onClearCart
}: Props) {
  const [sessions, setSessions] = useState<Record<string, RegisterSession>>({});
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logDate, setLogDate] = useState('');
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [catalogAddFlash, setCatalogAddFlash] = useState(false);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<any | null>(null);
  const [lastInvoiceUrl, setLastInvoiceUrl] = useState('');

  const sessionKey = activeRegisterId || registers[0]?.id || 'register_1';
  const session = sessions[sessionKey] || emptyRegisterSession();

  const updateSession = (patch: Partial<RegisterSession>) => {
    setSessions((prev) => ({
      ...prev,
      [sessionKey]: {
        ...(prev[sessionKey] || emptyRegisterSession()),
        ...patch
      }
    }));
  };

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );
  const normalizedBags = useMemo(() => bags.map((bag: any, index) => ({
    ...bag,
    size: bag.size || bag.size_label || `Bag ${index + 1}`,
    capacityGrams: Number(bag.capacityGrams ?? bag.capacity_grams ?? 0),
    price: Number(bag.price ?? 0),
    isEnabled: bag.isEnabled ?? bag.is_enabled ?? true,
    position: Number(bag.position ?? index)
  })), [bags]);

  const subtotal = useMemo(
    () => offlineCart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [offlineCart]
  );

  const computedBags = useMemo(() => {
    if (session.bagOption !== 'need' || normalizedBags.length === 0) return [];
    const totalWeight = offlineCart.reduce((sum, item) => sum + Number(item.weightGrams || 0) * item.quantity, 0);
    const sorted = [...normalizedBags].filter((bag) => bag.isEnabled !== false && bag.capacityGrams > 0).sort((a, b) => a.capacityGrams - b.capacityGrams);
    if (sorted.length === 0 || totalWeight <= 0) return [];
    const selected: { size: string; count: number; cost: number; capacityGrams: number }[] = [];
    const addBag = (bag: typeof sorted[number], count = 1) => {
      const existing = selected.find((entry) => entry.size === bag.size);
      if (existing) {
        existing.count += count;
        existing.cost += count * Number(bag.price || 0);
      } else {
        selected.push({
          size: bag.size,
          count,
          cost: count * Number(bag.price || 0),
          capacityGrams: bag.capacityGrams
        });
      }
    };
    let remaining = totalWeight;
    const largestBag = sorted[sorted.length - 1];
    if (remaining > largestBag.capacityGrams) {
      const count = Math.floor(remaining / largestBag.capacityGrams);
      addBag(largestBag, count);
      remaining -= count * largestBag.capacityGrams;
    }
    if (remaining > 0) {
      const fitting = sorted.find((bag) => bag.capacityGrams >= remaining) || largestBag;
      addBag(fitting, 1);
    }
    return selected;
  }, [session.bagOption, normalizedBags, offlineCart]);

  const bagCost = useMemo(() => computedBags.reduce((sum, bag) => sum + bag.cost, 0), [computedBags]);
  const cartWeightGrams = useMemo(
    () => offlineCart.reduce((sum, item) => sum + Number(item.weightGrams || 0) * item.quantity, 0),
    [offlineCart]
  );
  const total = subtotal + bagCost;
  const activeRegister = registers.find((register) => register.id === activeRegisterId) || registers[0];
  const activeRegisterName = activeRegister?.name || 'Customer 1';
  const selectedProduct = sortedProducts.find((product) => product.id === session.selectedProductId);
  const activeValue = session.keypadTarget === 'qty' ? session.qtyInput : session.priceOverride;
  const recentLogs = inventoryLogs.slice(0, 120);

  const cleanupOptions = [
    { value: '1w', label: 'Delete logs older than 1 week' },
    { value: '1m', label: 'Delete logs older than 1 month' },
    { value: '2m', label: 'Delete logs older than 2 months' },
    { value: '3m', label: 'Delete logs older than 3 months' },
    { value: '5m', label: 'Delete all logs older than 5 months' }
  ] as const;

  const applyLogDateFilter = (dateValue = logDate) => {
    onFilterInventoryLogs?.(dateValue ? { date: dateValue } : undefined);
  };

  const handleCleanupLogs = async (olderThan: '1w' | '1m' | '2m' | '3m' | '5m') => {
    const label = cleanupOptions.find((option) => option.value === olderThan)?.label || 'Delete old logs';
    if (!window.confirm(`${label}? This cannot be undone.`)) return;
    setCleanupBusy(true);
    try {
      await onCleanupInventoryLogs?.(olderThan);
      setCleanupOpen(false);
      applyLogDateFilter();
    } finally {
      setCleanupBusy(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    const generateQr = async () => {
      if (session.paymentMethod !== 'upi' || total <= 0) {
        setQrDataUrl('');
        return;
      }
      const upiUrl = `upi://pay?pa=svayiro.essentials@upi&pn=SVAYIRO&am=${total.toFixed(2)}&cu=INR&tn=WalkInPOS`;
      const dataUrl = await QRCode.toDataURL(upiUrl, { width: 280, margin: 2 });
      if (!cancelled) setQrDataUrl(dataUrl);
    };
    generateQr().catch(() => setQrDataUrl(''));
    return () => {
      cancelled = true;
    };
  }, [session.paymentMethod, total]);

  const setTargetValue = (next: string) => {
    if (session.keypadTarget === 'qty') updateSession({ qtyInput: next });
    else updateSession({ priceOverride: next });
  };

  const handleKey = (key: string) => {
    if (key === 'clear') {
      setTargetValue(session.keypadTarget === 'qty' ? '1' : '');
      return;
    }
    if (key === 'back') {
      const next = activeValue.slice(0, -1);
      setTargetValue(next || (session.keypadTarget === 'qty' ? '1' : ''));
      return;
    }
    if (key.startsWith('+')) {
      const add = Number(key.slice(1));
      const current = Number(activeValue || 0);
      setTargetValue(String(current + add));
      return;
    }
    if (key === '.' && activeValue.includes('.')) return;
    const next = activeValue === '1' && session.keypadTarget === 'qty' && key !== '.' ? key : `${activeValue}${key}`;
    setTargetValue(next);
  };

  const handleAddCatalogItem = () => {
    if (!session.selectedProductId) return;
    const qty = Math.max(1, Number(session.qtyInput || 1));
    const override = canOverridePrice && session.priceOverride ? Math.max(0, Number(session.priceOverride)) : undefined;
    onAddToCart?.({ productId: session.selectedProductId, qty, priceOverride: override });
    updateSession({ selectedProductId: '', priceOverride: '' });
    setCatalogAddFlash(true);
    window.setTimeout(() => setCatalogAddFlash(false), 1000);
  };

  const handleAddCustomItem = () => {
    if (!canOverridePrice) return;
    const name = session.customItemName.trim();
    if (!name) return;
    const price = Math.max(0, Number(session.priceOverride || 0));
    const qty = Math.max(1, Number(session.qtyInput || 1));
    onAddToCart?.({ customItemName: name, priceOverride: price, qty });
    updateSession({ customItemName: '' });
  };

  /** Action 1: Print Receipt */
  const printReceipt = () => {
    if (offlineCart.length === 0 && !lastCompletedOrder) {
      alert('No cart items to print.');
      return;
    }
    if (lastInvoiceUrl) {
      window.open(lastInvoiceUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const billItems = lastCompletedOrder?.items || offlineCart;
    const billTotal = Number(lastCompletedOrder?.finalTotal ?? lastCompletedOrder?.final_amount ?? total);
    const billBagCost = Number(lastCompletedOrder?.bagCharge ?? lastCompletedOrder?.bag_charge ?? bagCost);
    const billPaymentMethod = String(lastCompletedOrder?.paymentMethod ?? lastCompletedOrder?.payment_method ?? session.paymentMethod).toUpperCase();
    const billPaymentRef = lastCompletedOrder?.paymentRef ?? lastCompletedOrder?.payment_ref ?? session.upiReference;
    const lines = billItems.map((item: any) => {
      const qty = Number(item.quantity || 1);
      const unit = Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
      const amount = Number(item.totalPrice ?? item.total_price ?? unit * qty);
      return `<tr><td>${item.productName || item.name || 'Item'}</td><td>${qty}</td><td>Rs. ${unit.toFixed(2)}</td><td>Rs. ${amount.toFixed(2)}</td></tr>`;
    }).join('');

    const popup = window.open('', '_blank', 'width=420,height=640');
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>SVAYIRO POS Receipt</title>
          <style>
            body{font-family:monospace;padding:18px;color:#0f172a}
            h1{font-size:18px;margin:0 0 4px}
            table{width:100%;border-collapse:collapse;margin-top:12px}
            td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;font-size:12px}
            .total{font-weight:800;text-align:right;margin-top:14px}
            .meta{font-size:12px;color:#475569}
          </style>
        </head>
        <body>
          <h1>SVAYIRO POS Receipt</h1>
          <div class="meta">${formatDateTimeDDMMYYYY(new Date())}</div>
          <div class="meta">Customer: ${session.customerName || 'Walk-In Customer'} | ${session.customerPhone || '-'}</div>
          <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table>
          ${billBagCost > 0 ? `<div class="total">Bag charge: Rs. ${billBagCost.toFixed(2)}</div>` : ''}
          <div class="total">Grand total: Rs. ${billTotal.toFixed(2)}</div>
          <div class="meta">Payment: ${billPaymentMethod} ${billPaymentRef ? `(${billPaymentRef})` : ''}</div>
          ${session.transactionNote ? `<div class="meta">Note: ${session.transactionNote}</div>` : ''}
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  /** Action 2: Send WhatsApp Bill */
  const handleSendPosWhatsApp = () => {
    const digits = session.customerPhone.replace(/\D/g, '');
    const completedPhone = String(lastCompletedOrder?.customerPhone ?? lastCompletedOrder?.customer_phone ?? '').replace(/\D/g, '');
    const targetPhone = digits || completedPhone;
    if (!/^[6-9]\d{9}$/.test(targetPhone)) {
      alert('Mobile number is required. Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!lastInvoiceUrl) {
      alert('Complete the sale first so the public invoice link can be created.');
      return;
    }
    const customerName = lastCompletedOrder?.customerName || lastCompletedOrder?.customer_name || session.customerName;
    const grandTotal = Number(lastCompletedOrder?.finalTotal ?? lastCompletedOrder?.final_amount ?? total);
    const message = buildPosWhatsAppMessage(customerName, grandTotal, lastInvoiceUrl, 'https://svayiro.co.in');
    openPosWhatsAppBill(targetPhone, message);
  };

  /** Action 3: Complete Sale Only (Decrements stock, clears session) */
  const handleSubmit = async () => {
    if (offlineCart.length === 0) {
      alert('Cart is empty');
      return;
    }
    const digits = session.customerPhone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      alert('Mobile number is compulsory. Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      const saleOrder = await onSubmitSale?.({
        customerName: session.customerName.trim() || activeRegisterName,
        customerPhone: digits,
        paymentMethod: session.paymentMethod,
        upiReference: session.upiReference.trim(),
        bagOption: session.bagOption,
        bagCost,
        note: session.transactionNote.trim()
      });

      setLastCompletedOrder(saleOrder);
      if (saleOrder?.id) {
        try {
          const invoice = await api.adminInvoiceLink(saleOrder.id);
          setLastInvoiceUrl(invoice.invoiceUrl);
        } catch {
          setLastInvoiceUrl('');
        }
      } else {
        setLastInvoiceUrl('');
      }
      alert('Sale completed successfully! Inventory updated.');
      updateSession(emptyRegisterSession());
    } catch (err: any) {
      alert(err?.message || 'Unable to complete sale.');
    } finally {
      setSubmitting(false);
    }
  };

  const keypad = ['1', '2', '3', '+1', '4', '5', '6', '+5', '7', '8', '9', '+10', '.', '0', 'back', 'clear'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-black">Walk-In Billing (POS Counter)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Record walk-in checkout details, decrement stock, print receipt, and send the bill to the customer WhatsApp number when configured.
        </p>
      </div>

      <section className={`${panelClass} p-3 sm:p-4`}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase text-indigo-800 dark:text-indigo-300">
            <ClipboardList className="h-4 w-4" />
            Active Billing Registers ({Math.max(1, registers.length)}):
          </div>
          {(registers.length ? registers : [{ id: activeRegisterId || 'register_1', name: 'Customer 1', itemCount: offlineCart.length, total }]).map((register) => {
            const isActive = register.id === activeRegisterId || (!activeRegisterId && register.name === activeRegisterName);
            return (
              <div key={register.id} className="flex items-center overflow-hidden rounded-lg border border-violet-200 bg-white shadow-sm dark:border-violet-900 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => onSelectRegister?.(register.id)}
                  className={`px-3 py-2 text-xs font-black ${isActive ? 'bg-violet-600 text-white' : 'text-violet-700 dark:text-violet-300'}`}
                >
                  {register.name}
                  <span className={`ml-2 rounded-full px-2 py-0.5 ${isActive ? 'bg-white/20' : 'bg-violet-50 dark:bg-violet-950'}`}>
                    {register.itemCount} items (Rs. {register.total.toFixed(0)})
                  </span>
                </button>
                {registers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onCloseRegister?.(register.id)}
                    className="px-2 text-xs font-black text-rose-500"
                    title="Close register"
                  >
                    x
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={onAddRegister} className="rounded-lg border border-dashed border-emerald-500 px-3 py-2 text-xs font-black uppercase text-emerald-700 dark:text-emerald-300">
            + Parallel Queue
          </button>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,500px)_minmax(0,1fr)]">
        <section className={`${panelClass} min-w-0 p-3 sm:p-4 xl:p-5`}>
          <div className="mb-4 flex items-center justify-between border-b border-slate-900 pb-3 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-indigo-800 dark:text-indigo-300">
              <ShoppingIcon /> Selected Cart: {activeRegisterName}
            </h3>
            <button type="button" onClick={onClearCart} className="text-[11px] font-bold text-rose-600">Clear Cart</button>
          </div>

          <div className="space-y-3.5">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">1. Add catalog product</span>
              <select className={inputClass} value={session.selectedProductId} onChange={(event) => updateSession({ selectedProductId: event.target.value })}>
                <option value="">-- Choose item to add --</option>
                {sortedProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - Rs. {(product.offerPrice > 0 ? product.offerPrice : product.basePrice).toFixed(2)} - Stock {product.stockCount}
                  </option>
                ))}
              </select>
            </label>

            {canOverridePrice && (
              <>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  Or
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Or Type Unlisted Custom Item</span>
                    <span className="text-[10px] font-black uppercase text-indigo-700">Custom Item</span>
                  </div>
                  <input className={inputClass} value={session.customItemName} onChange={(event) => updateSession({ customItemName: event.target.value })} placeholder="e.g. Loose Mustard Oil, Jute Sacks, special milling charge..." />
                </label>
              </>
            )}

            {!canOverridePrice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                Inventory staff can bill catalog items at saved product prices. Custom items and price overrides are owner-only.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              <button type="button" onClick={() => updateSession({ keypadTarget: 'qty' })} className={`rounded-md py-2 text-xs font-black ${session.keypadTarget === 'qty' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Qty</button>
              <button type="button" disabled={!canOverridePrice} onClick={() => updateSession({ keypadTarget: 'price' })} className={`rounded-md py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${session.keypadTarget === 'price' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Price Override</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Qty</span>
                <input className={`${inputClass} text-center font-mono text-base`} value={session.qtyInput} onChange={(event) => updateSession({ qtyInput: event.target.value.replace(/[^\d.]/g, '') })} onFocus={() => updateSession({ keypadTarget: 'qty' })} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-slate-500">Override Price (Rs.)</span>
                <input className={`${inputClass} text-center font-mono text-base disabled:cursor-not-allowed disabled:opacity-50`} disabled={!canOverridePrice} value={canOverridePrice ? session.priceOverride : ''} onChange={(event) => updateSession({ priceOverride: event.target.value.replace(/[^\d.]/g, '') })} onFocus={() => canOverridePrice && updateSession({ keypadTarget: 'price' })} placeholder={canOverridePrice ? (selectedProduct ? 'Catalog rate' : 'Custom item price') : 'Owner only'} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleAddCatalogItem}
                className={`rounded-lg px-4 py-3 text-xs font-black uppercase text-white transition-colors duration-200 disabled:opacity-40 ${
                  catalogAddFlash ? 'bg-emerald-600' : 'bg-indigo-800 hover:bg-indigo-900'
                }`}
                disabled={!session.selectedProductId}
              >
                <Plus className="mr-1 inline h-4 w-4" /> {catalogAddFlash ? 'Added' : 'Add Catalog'}
              </button>
              {canOverridePrice ? (
                <button type="button" onClick={handleAddCustomItem} className="rounded-lg bg-slate-900 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-40" disabled={!session.customItemName.trim()}>
                  <Plus className="mr-1 inline h-4 w-4" /> Add Custom
                </button>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs font-black uppercase text-slate-400">Catalog only</div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-slate-500">Rapid Cashier Keypad</span>
                <span className="text-[10px] font-black uppercase text-slate-400">Target: {session.keypadTarget}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {keypad.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKey(key)}
                    className={`h-10 rounded-md border text-xs font-black shadow-sm ${
                      key === 'clear'
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : key === 'back'
                          ? 'border-amber-200 bg-amber-50 text-amber-600'
                          : key.startsWith('+')
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-slate-300 bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                    }`}
                  >
                    {key === 'back' ? <Delete className="mx-auto h-3.5 w-3.5" /> : key === 'clear' ? 'C' : key}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-900 pt-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between text-xs font-black uppercase">
                <span className="text-slate-500">Cart Items ({offlineCart.length})</span>
                <span className="text-emerald-600">Total: Rs. {total.toFixed(0)}</span>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {offlineCart.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Cart is empty.</div>
                ) : offlineCart.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black">{item.name}</p>
                      <p className="text-[10px] text-slate-500">Rs. {item.price.toFixed(2)} each</p>
                    </div>
                    <button type="button" onClick={() => onUpdateQuantity?.(item.productId, -1)} className="rounded bg-slate-200 p-1 dark:bg-slate-800"><Minus className="h-3 w-3" /></button>
                    <span className="w-6 text-center text-xs font-black">{item.quantity}</span>
                    <button type="button" onClick={() => onUpdateQuantity?.(item.productId, 1)} className="rounded bg-slate-200 p-1 dark:bg-slate-800"><Plus className="h-3 w-3" /></button>
                    <button type="button" onClick={() => onRemoveItem?.(item.productId)} className="rounded p-1 text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-900 pt-3 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Customer Name</span>
                  <input className={inputClass} value={session.customerName} onChange={(event) => updateSession({ customerName: event.target.value })} placeholder="Optional" />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase text-violet-700">Mobile Number * Compulsory</span>
                  <input className={inputClass} value={session.customerPhone} onChange={(event) => updateSession({ customerPhone: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="Compulsory 10-digit phone" />
                </label>
              </div>

              <div className="mt-3">
                <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Payment Channel</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => updateSession({ paymentMethod: 'cod' })} className={`rounded-lg border px-3 py-2 text-xs font-black ${session.paymentMethod === 'cod' ? 'border-indigo-700 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-500 dark:border-slate-800'}`}>
                    <CreditCard className="mr-1 inline h-4 w-4" /> Cash/Card
                  </button>
                  <button type="button" onClick={() => updateSession({ paymentMethod: 'upi' })} className={`rounded-lg border px-3 py-2 text-xs font-black ${session.paymentMethod === 'upi' ? 'border-indigo-700 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-500 dark:border-slate-800'}`}>
                    <QrCode className="mr-1 inline h-4 w-4" /> UPI Scan
                  </button>
                </div>
              </div>

              {session.paymentMethod === 'upi' && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase text-indigo-800 dark:text-indigo-200">UPI QR for Total</span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-indigo-800">Rs. {total.toFixed(2)}</span>
                  </div>
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt={`UPI QR for Rs. ${total.toFixed(2)}`} className="mx-auto h-36 w-36 rounded-lg bg-white p-2 shadow-sm" />
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-indigo-300 bg-white text-xs font-bold text-indigo-500">
                      Add items to generate QR
                    </div>
                  )}
                  <input className={`${inputClass} mt-2`} value={session.upiReference} onChange={(event) => updateSession({ upiReference: event.target.value })} placeholder="UPI Reference / UTR" />
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Bag Option</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateSession({ bagOption: 'own' })}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-black uppercase shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
                        session.bagOption === 'own'
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Own bag
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSession({ bagOption: 'need' })}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-black uppercase shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
                        session.bagOption === 'need'
                          ? 'border-indigo-600 bg-indigo-700 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Need bag
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
                  <p className="font-black uppercase text-slate-500">Bag Charge</p>
                  <p className="mt-1 font-mono text-lg font-black">Rs. {bagCost.toFixed(2)}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{(cartWeightGrams / 1000).toFixed(2)} kg</p>
                </div>
              </div>

              {session.bagOption === 'need' && (
                <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] dark:border-indigo-900 dark:bg-indigo-950/20">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-black uppercase text-indigo-800 dark:text-indigo-200">Smart bag selection</span>
                    <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">
                      {computedBags.length} type{computedBags.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {cartWeightGrams <= 0 ? (
                    <p className="font-semibold text-amber-700 dark:text-amber-300">
                      Product weight is missing, so POS cannot calculate bag price. Add product weight in Product Catalogue.
                    </p>
                  ) : computedBags.length === 0 ? (
                    <p className="font-semibold text-slate-500">No active carrier bag configuration found.</p>
                  ) : (
                    <div className="space-y-1">
                      {computedBags.map((bag) => (
                        <div key={bag.size} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 font-mono dark:bg-slate-950">
                          <span className="min-w-0 truncate">{bag.count} x {bag.size}</span>
                          <span className="font-black">Rs. {bag.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Custom Transaction Note</span>
                <input className={inputClass} value={session.transactionNote} onChange={(event) => updateSession({ transactionNote: event.target.value })} placeholder="Optional cashier note" />
              </label>

              {/* SEPARATED ACTION BUTTONS */}
              <div className="mt-4 space-y-2">
                {/* Button 1: Complete Sale Only */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || offlineCart.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-3 text-xs font-black uppercase text-white shadow-lg disabled:opacity-60 transition"
                >
                  <CheckCircle className="h-4 w-4" />
                  {submitting ? 'Completing Sale...' : 'Complete Sale Only'}
                </button>

                {/* Button 2 & 3 Row: Print Receipt & Send WhatsApp Bill */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={printReceipt}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-2.5 text-xs font-black uppercase text-slate-800 dark:text-slate-200 transition"
                  >
                    <Printer className="h-4 w-4" />
                    Print Receipt
                  </button>

                  <button
                    type="button"
                    onClick={handleSendPosWhatsApp}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 px-3 py-2.5 text-xs font-black uppercase transition"
                  >
                    <Send className="h-4 w-4" />
                    WhatsApp Bill
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${panelClass} min-w-0 p-3 sm:p-5 xl:min-h-[680px]`}>
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-indigo-700" />
                <h3 className="text-sm font-black uppercase text-indigo-900 dark:text-indigo-300">Real-Time Warehouse Inventory Log Book</h3>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCleanupOpen((open) => !open)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
                {cleanupOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                    <p className="px-2 pb-2 text-[10px] font-black uppercase text-slate-400">Cleanup old logs</p>
                    {cleanupOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={cleanupBusy}
                        onClick={() => handleCleanupLogs(option.value)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-rose-950/30"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[180px]">
                <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">View logs for date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={logDate}
                  onChange={(event) => {
                    setLogDate(event.target.value);
                    applyLogDateFilter(event.target.value);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => applyLogDateFilter()}
                className="rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black uppercase text-white"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogDate('');
                  onFilterInventoryLogs?.();
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 dark:border-slate-800 dark:text-slate-300"
              >
                All recent
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            {recentLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-700">
                No inventory logs recorded yet.
              </div>
            ) : (
              <div className="max-h-[590px] overflow-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead className={`${isDarkMode ? 'bg-slate-950 text-slate-300' : 'bg-slate-50 text-slate-600'} sticky top-0 z-10`}>
                    <tr>
                      <th className="px-3 py-2 font-black uppercase">Date / Time</th>
                      <th className="px-3 py-2 font-black uppercase">Updated Product</th>
                      <th className="px-3 py-2 font-black uppercase">Order</th>
                      <th className="px-3 py-2 font-black uppercase">Reason</th>
                      <th className="px-3 py-2 text-right font-black uppercase">Qty</th>
                      <th className="px-3 py-2 text-right font-black uppercase">Stock After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map((log: any) => {
                      const delta = Number(log.quantityChange ?? log.delta ?? 0);
                      const metadata = log.metadata || {};
                      const productName = log.productName || log.product_name || metadata.name || log.productId || log.product_id || 'Unlisted inventory item';
                      const createdAt = log.createdAt || log.created_at;
                      const orderId = log.orderId || log.order_id || log.referenceId || log.reference_id || metadata.orderId;
                      const orderRef = log.orderRef || log.order_ref || metadata.orderRef;
                      return (
                        <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                            {createdAt ? formatDateTimeDDMMYYYY(createdAt) : 'Just now'}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-black">{productName}</p>
                            <p className="font-mono text-[10px] text-slate-400">{log.product_sku || log.sku || log.product_id || 'custom / system'}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-mono text-[10px] font-black text-slate-700 dark:text-slate-200">{orderRef || '-'}</p>
                            <p className="max-w-[170px] truncate font-mono text-[10px] text-slate-400" title={orderId || ''}>{orderId || '-'}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              {log.reason || log.type || 'inventory update'}
                            </span>
                            {log.source && <p className="mt-1 text-[10px] text-slate-500">Source: {log.source}</p>}
                          </td>
                          <td className={`px-3 py-2 text-right font-black ${delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {delta > 0 ? '+' : ''}{delta}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {log.stockAfter ?? log.stock_after ?? '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ShoppingIcon() {
  return <Receipt className="h-4 w-4 text-emerald-600" />;
}
