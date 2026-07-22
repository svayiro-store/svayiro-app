import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Order, ShopProfile } from '../../types';
import { api } from '../../api';
import { ChevronDown, ChevronUp, Search, Printer, X, Package, Truck, CheckCircle, Clock, AlertTriangle, Trash2, Send } from 'lucide-react';
import { formatDateTimeDDMMYYYY } from '../../utils/date';

interface Props {
  orders: Order[];
  shop: ShopProfile;
  roles?: string[];
  isDarkMode: boolean;
  refresh: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const nextStatusMap: Record<string, string> = {
  pending: 'accepted',
  accepted: 'packed',
  packed: 'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered: 'delivered',
  cancelled: 'cancelled'
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  packed: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  out_for_delivery: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';

const money = (value: any) => `Rs. ${Number(value || 0).toFixed(2)}`;

type QueueDateFilter = 'today' | 'tomorrow' | 'all';

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function orderAddressText(address: any) {
  if (!address) return 'Store pickup / walk-in billing';
  if (typeof address === 'string') return address;
  return [
    address.flatAndHouse,
    address.areaAndStreet,
    address.landmark,
    address.cityOrVillage,
    address.taluk,
    address.district,
    address.state,
    address.pincode
  ].filter(Boolean).join(', ') || 'Address set';
}

function getOrderItemTotal(item: any) {
  return Number(item.totalPrice ?? item.total_price ?? item.price ?? 0);
}

function getOrderItemUnit(item: any) {
  const qty = Number(item.quantity || 1);
  return Number(item.unitPrice ?? item.unit_price ?? (getOrderItemTotal(item) / qty) ?? 0);
}

function hasValidCustomerPhone(order: Order) {
  return /^[6-9]\d{9}$/.test(String(order.customerPhone || '').replace(/\D/g, ''));
}

/** Pre-texted WhatsApp message for normal WhatsApp */
function buildWhatsAppInvoiceMessage(order: Order, websiteUrl = 'https://svayiro.co.in') {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://svayiro.co.in';
  const publicInvoiceLink = `${origin}/invoice/${order.id}`;

  const itemsList = (order.items || [])
    .map((item: any) => `${item.productName || item.name || 'Item'} (Qty: ${item.quantity || 1})`)
    .join(', ');

  const formattedStatus = String(order.status || 'pending').replace(/_/g, ' ').toUpperCase();

  return [
    `Greetings!`,
    `Your order status for ${itemsList || 'your item'} (Order #${order.orderRef || order.id}) is: *${formattedStatus}*.`,
    ``,
    `Please view and print your bill by clicking this link:`,
    `${publicInvoiceLink}`,
    ``,
    `Thank you for shopping with us!`,
    `Visit our website: ${websiteUrl}`
  ].join('\n');
}

/** Normal WhatsApp Sender */
function openWhatsAppInvoice(order: Order, websiteUrl = 'https://svayiro.co.in') {
  const digits = String(order.customerPhone || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const message = buildWhatsAppInvoiceMessage(order, websiteUrl);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function printShopInvoice(order: Order) {
  const invoiceNo = order.orderRef || order.id;
  const orderId = order.id;
  const orderRef = order.orderRef || '-';
  const createdAt = order.createdAt || new Date();
  const itemsHtml = (order.items || []).map((item: any, index) => {
    const qty = Number(item.quantity || 1);
    const unit = getOrderItemUnit(item);
    const lineTotal = getOrderItemTotal(item);
    const itemName = escapeHtml(item.productName || item.name || 'Item');
    const itemSku = item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : '';
    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <strong>${itemName}</strong>
          ${itemSku}
        </td>
        <td class="right">${qty}</td>
        <td class="right">${money(unit)}</td>
        <td class="right">${money(lineTotal)}</td>
      </tr>
    `;
  }).join('');
  const popup = window.open('', '_blank', 'width=760,height=900');
  if (!popup) return;
  popup.document.write(`
    <html>
      <head>
        <title>SVAYIRO Invoice ${invoiceNo}</title>
        <style>
          body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0f172a;background:#fff}
          .bill{max-width:760px;margin:0 auto;border:1px solid #0f172a;padding:22px}
          .top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:14px}
          h1{margin:0;font-size:24px;letter-spacing:.08em}
          .muted{color:#64748b;font-size:12px;line-height:1.5}
          .badge{display:inline-block;border:1px solid #0f172a;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:800;text-transform:uppercase}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
          .box{border:1px solid #cbd5e1;padding:12px;border-radius:8px}
          .label{font-size:10px;text-transform:uppercase;font-weight:800;color:#64748b;margin-bottom:4px}
          table{width:100%;border-collapse:collapse;margin-top:14px}
          th,td{border-bottom:1px solid #e2e8f0;padding:9px 6px;font-size:12px;text-align:left;vertical-align:top}
          th{background:#f8fafc;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
          .right{text-align:right}
          .totals{margin-left:auto;margin-top:14px;width:300px}
          .total-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
          .grand{font-size:18px;font-weight:900;border-bottom:2px solid #0f172a}
          .footer{margin-top:22px;border-top:1px dashed #94a3b8;padding-top:12px;text-align:center;font-size:11px;color:#64748b}
          @media print{button{display:none}.bill{border:0;padding:0}body{padding:0}}
        </style>
      </head>
      <body>
        <div class="bill">
          <div class="top">
            <div>
              <h1>SVAYIRO</h1>
              <div class="muted">Premium Groceries & Daily Essentials<br>Purity & Quality Delivered Daily</div>
            </div>
            <div class="right">
              <div class="badge">${order.invoiceType === 'offline_pos' ? 'POS Bill' : 'Tax Invoice'}</div>
              <div class="muted" style="margin-top:8px">
                Invoice: <strong>${escapeHtml(invoiceNo)}</strong><br>
                Order ID: <strong>${escapeHtml(orderId)}</strong><br>
                Order Ref: <strong>${escapeHtml(orderRef)}</strong><br>
                Date: ${formatDateTimeDDMMYYYY(createdAt)}<br>
                Status: ${escapeHtml(order.status)}
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Customer Details</div>
              <strong>${escapeHtml(order.customerName || 'Walk-In Customer')}</strong><br>
              <span class="muted">Phone: ${escapeHtml(order.customerPhone || '-')}</span>
            </div>
            <div class="box">
              <div class="label">Fulfillment</div>
              <strong>${order.deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup / POS'}</strong><br>
              <span class="muted">${escapeHtml(order.selectedSlot || 'No slot')}<br>${escapeHtml(orderAddressText(order.deliveryAddress))}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="totals">
            <div class="total-row"><span>Product subtotal</span><strong>${money(order.amountTotal ?? order.productTotal)}</strong></div>
            <div class="total-row"><span>Delivery charge</span><strong>${money(order.deliveryCharge ?? order.deliveryCost)}</strong></div>
            <div class="total-row"><span>Bag charge</span><strong>${money(order.bagCharge ?? order.bagCost)}</strong></div>
            <div class="total-row"><span>Discount</span><strong>- ${money(order.discountAmount ?? order.discount)}</strong></div>
            <div class="total-row grand"><span>Grand Total</span><span>${money(order.finalAmount ?? order.finalTotal)}</span></div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Payment</div>
              <strong>${escapeHtml(order.paymentMethod || order.paymentDetails?.method || 'cod')}</strong>
              <span class="muted"> (${escapeHtml(order.paymentStatus || order.paymentDetails?.status || 'pending')})</span><br>
              <span class="muted">Reference: ${escapeHtml(order.paymentRef || order.paymentDetails?.upiReference || '-')}</span>
            </div>
            <div class="box">
              <div class="label">Packaging</div>
              <strong>${order.bagOption === 'need' ? 'Shop bag provided' : 'Customer own bag'}</strong>
              ${order.couponCode ? `<br><span class="muted">Coupon: ${escapeHtml(order.couponCode)}</span>` : ''}
            </div>
          </div>

          <div class="footer">Thank you for shopping with SVAYIRO. Please keep this bill for order support and payment reference.</div>
        </div>
        <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body>
    </html>
  `);
  popup.document.close();
}

export default function OrdersView({ orders, shop, roles = [], isDarkMode, refresh, showToast }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [queueDateFilter, setQueueDateFilter] = useState<QueueDateFilter>('today');
  const [invoiceQueue, setInvoiceQueue] = useState<Order[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [codChoiceOrder, setCodChoiceOrder] = useState<Order | null>(null);
  const [codCollection, setCodCollection] = useState<{ order: Order; qrDataUrl: string; upiUrl: string; providerRef: string } | null>(null);
  
  const isOwner = roles.includes('admin');
  const isDeliveryPartner = roles.includes('delivery_partner') && !isOwner;
  const canSendInvoices = isOwner || roles.includes('customer_care');
  const websiteUrl = shop?.websiteUrl || 'https://svayiro.co.in';

  const canSendWhatsAppBill = (order: Order) => {
    return true; // Allow sending WhatsApp bill directly
  };

  const loadInvoiceQueue = async () => {
    setQueueLoading(true);
    try {
      const rows = await api.adminInvoiceQueue(queueDateFilter);
      setInvoiceQueue(rows);
    } catch (err: any) {
      showToast(err.message || 'Unable to load invoice priority queue', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    loadInvoiceQueue();
  }, [queueDateFilter]);

  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesRef = order.orderRef?.toLowerCase().includes(q);
      const matchesPhone = order.customerPhone?.includes(q);
      const matchesName = order.customerName?.toLowerCase().includes(q);
      if (!matchesRef && !matchesPhone && !matchesName) return false;
    }
    return true;
  });
  const activeFilteredOrders = filteredOrders.filter((order) => order.status !== 'delivered');
  const completedFilteredOrders = filteredOrders.filter((order) => order.status === 'delivered');

  // Advanced status handler with COD & UPI guards
  const handleAdvanceStatus = async (order: Order) => {
    const paymentStatus = (order.paymentStatus || order.paymentDetails?.status || 'pending').toLowerCase();
    const paymentMethod = (order.paymentMethod || order.paymentDetails?.method || 'cod').toLowerCase();
    const nextStatus = nextStatusMap[order.status] || 'delivered';

    // GUARD 1: COD not paid -> don't allow to mark delivered
    const isCod = paymentMethod === 'cod' || paymentMethod === 'cash';
    if (nextStatus === 'delivered' && isCod && paymentStatus !== 'paid') {
      showToast('Cannot mark as Delivered! COD payment is not set as paid. Please mark payment as Paid first.', 'error');
      return;
    }

    // GUARD 2: UPI checks for accepting order
    if (nextStatus === 'accepted' && paymentMethod === 'upi') {
      if (paymentStatus === 'failed') {
        showToast('Cannot accept order! Customer UPI payment has failed.', 'error');
        return;
      }
    }

    if (nextStatus === order.status) return;
    setLoadingId(order.id);
    try {
      await api.updateOrderStatus(order.id, nextStatus);
      showToast(`Order ${order.orderRef || order.id.substring(0, 8)} → ${nextStatus.replace(/_/g, ' ')}`, 'success');
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to update order status', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (order.status === 'cancelled' || order.status === 'delivered') return;
    if (!window.confirm(`Cancel order ${order.orderRef || order.id.substring(0, 8)}?`)) return;
    setLoadingId(order.id);
    try {
      await api.updateOrderStatus(order.id, 'cancelled', 'failed');
      showToast(`Order ${order.orderRef || order.id.substring(0, 8)} cancelled.`, 'success');
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to cancel order', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    const label = order.orderRef || order.id.substring(0, 8);
    if (!window.confirm(`Archive invoice/order ${label} from the admin invoice list? Customer history, dashboard reports, payment records, and audit data will remain unchanged.`)) return;
    setLoadingId(order.id);
    try {
      await api.deleteOrder(order.id);
      showToast(`Invoice/order ${label} archived from admin list.`, 'success');
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to delete invoice/order', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  // Normal WhatsApp Invoice Sender
  const handleSendWhatsAppInvoice = (order: Order) => {
    if (!hasValidCustomerPhone(order)) {
      showToast('Enter a valid 10-digit customer phone before sending invoice.', 'error');
      return;
    }
    openWhatsAppInvoice(order, websiteUrl);
    showToast('Normal WhatsApp opened with pre-filled status and print bill link.', 'success');
  };

  const handlePrintInvoice = (order: Order) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicLink = `${origin}/invoice/${order.id}`;
  window.open(publicLink, '_blank');
};

  const handleMarkCodPaid = async (order: Order) => {
    setLoadingId(order.id);
    try {
      await api.updateOrderStatus(order.id, order.status, 'paid');
      showToast(`Order ${order.orderRef || order.id.substring(0, 8)} marked as paid.`, 'success');
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to mark order as paid', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleMarkCodCashPaid = async (order: Order) => {
    if (!window.confirm(`Confirm cash collected for ${order.orderRef || order.id.substring(0, 8)} amount ${money(order.finalTotal)}?`)) return;
    setLoadingId(order.id);
    try {
      await api.collectCodCashPayment(order.id);
      showToast(`Cash collected for order ${order.orderRef || order.id.substring(0, 8)}.`, 'success');
      setCodChoiceOrder(null);
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to mark cash collected', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const openCodCollectionQr = async (order: Order) => {
    const upiId = String(shop.upiId || '').trim();
    if (!upiId) {
      showToast('Store UPI ID is not configured in Store Settings.', 'error');
      return;
    }
    const amount = Number(order.finalTotal || order.finalAmount || 0);
    if (amount <= 0) {
      showToast('Order amount is not valid for COD collection.', 'error');
      return;
    }
    const txnRef = `COD${String(order.orderRef || order.id).replace(/[^A-Za-z0-9]/g, '').slice(-12)}`;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shop.name || 'SVAYIRO')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`COD ${order.orderRef || order.id}`)}&tr=${encodeURIComponent(txnRef)}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(upiUrl, { width: 320, margin: 2 });
      setCodChoiceOrder(null);
      setCodCollection({ order, qrDataUrl, upiUrl, providerRef: '' });
    } catch {
      showToast('Unable to generate COD payment QR.', 'error');
    }
  };

  const submitCodCollection = async () => {
    if (!codCollection) return;
    const ref = codCollection.providerRef.trim();
    if (!/^[A-Za-z0-9]{8,30}$/.test(ref)) {
      showToast('Enter a valid 8 to 30 character UPI reference / UTR.', 'error');
      return;
    }
    setLoadingId(codCollection.order.id);
    try {
      await api.collectCodPayment(codCollection.order.id, ref);
      showToast('COD collection submitted. Owner must verify before marking paid.', 'success');
      setCodCollection(null);
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to submit COD collection', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  // Accept Order and Verify UPI
  const handleVerifyUpiPaid = async (order: Order) => {
    setLoadingId(order.id);
    try {
      await api.updateOrderStatus(order.id, 'accepted', 'paid');
      showToast(`UPI payment verified. Order ${order.orderRef || order.id.substring(0, 8)} accepted.`, 'success');
      refresh();
      loadInvoiceQueue();
    } catch (err: any) {
      showToast(err.message || 'Unable to verify UPI payment', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
  const queueCounts = {
    dueSoon: invoiceQueue.filter((order) => order.invoiceQueue?.isDueSoon).length,
    delayed: invoiceQueue.filter((order) => order.invoiceQueue?.isDelayed).length,
    paymentPending: invoiceQueue.filter((order) => (order.paymentStatus || order.paymentDetails?.status) !== 'paid').length
  };
  const priorityBadgeClass = (order: Order) => {
    if (order.invoiceQueue?.isDelayed) return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
    if (order.invoiceQueue?.isDueSoon) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    if (order.invoiceQueue?.scheduledDay === 'today') return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-black">Invoice & Orders</h2>
          <p className="text-xs opacity-70">Manage orders, update status, and process fulfillment.</p>
        </div>
        <button
          onClick={() => {
            refresh();
            loadInvoiceQueue();
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
        >
          Refresh Orders
        </button>
      </div>

      <section className={`rounded-xl border p-4 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-black">Invoice Dispatch Queue</h3>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Prioritized by delivery/pickup date, slot time, payment verification, and order status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['today', 'tomorrow', 'all'] as QueueDateFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setQueueDateFilter(filter)}
                className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase transition ${
                  queueDateFilter === filter
                    ? 'bg-indigo-700 text-white shadow'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">Due Soon</p>
            <p className="mt-1 text-xl font-black">{queueCounts.dueSoon}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/20">
            <p className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-300">Delayed</p>
            <p className="mt-1 text-xl font-black">{queueCounts.delayed}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-black uppercase text-slate-500">Payment Pending</p>
            <p className="mt-1 text-xl font-black">{queueCounts.paymentPending}</p>
          </div>
        </div>

        {queueLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs font-bold text-slate-500 dark:border-slate-800">
            Loading invoice priority queue...
          </div>
        ) : invoiceQueue.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs font-bold text-slate-500 dark:border-slate-800">
            No active orders for this queue.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-950">
                <tr>
                  <th className="px-3 py-2 font-black">Priority</th>
                  <th className="px-3 py-2 font-black">Slot</th>
                  <th className="px-3 py-2 font-black">Order</th>
                  <th className="px-3 py-2 font-black">Customer</th>
                  <th className="px-3 py-2 font-black">Payment</th>
                  <th className="px-3 py-2 text-right font-black">Amount</th>
                  <th className="px-3 py-2 text-right font-black">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoiceQueue.map((order, index) => {
                  const paymentStatus = (order.paymentStatus || order.paymentDetails?.status || 'pending').toLowerCase();
                  const paymentMethod = (order.paymentMethod || order.paymentDetails?.method || 'cod').toLowerCase();
                  const isCod = paymentMethod === 'cod' || paymentMethod === 'cash';
                  const isUpi = paymentMethod === 'upi';
                  const nextStatus = nextStatusMap[order.status] || 'delivered';

                  const canProgress = order.status !== 'delivered' && order.status !== 'cancelled' && !(isUpi && paymentStatus !== 'paid') && !(nextStatus === 'delivered' && isCod && paymentStatus !== 'paid');
                  
                  const canCollectCodDelivery = (isDeliveryPartner || isOwner)
                    && isCod
                    && paymentStatus !== 'paid'
                    && order.deliveryMethod === 'delivery'
                    && ['packed', 'out_for_delivery', 'delivered'].includes(order.status);

                  const canCollectCodPickup = isCod
                    && paymentStatus !== 'paid'
                    && order.deliveryMethod === 'pickup';
                  const canCollectCod = canCollectCodDelivery || canCollectCodPickup;

                  return (
                    <tr key={order.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            {index + 1}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${priorityBadgeClass(order)}`}>
                            {order.invoiceQueue?.priorityLabel || 'Queued'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-black capitalize">{order.invoiceQueue?.scheduledDay || 'unknown'}</p>
                        <p className="text-[10px] text-slate-500">{order.invoiceQueue?.scheduledDateDisplay || order.invoiceQueue?.scheduledDate || '-'}</p>
                        <p className="font-mono text-[10px] text-slate-500">{order.invoiceQueue?.slotLabel || order.selectedSlot || 'No slot'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono font-black">{order.orderRef || order.id.slice(0, 8)}</p>
                        <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statusColors[order.status] || statusColors.pending}`}>
                          {order.status.replace(/_/g, ' ')}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-bold">{order.customerName || 'Customer'}</p>
                        <p className="font-mono text-[10px] text-slate-500">+91 {order.customerPhone || '-'}</p>
                        <p className="text-[10px] capitalize text-slate-500">{order.deliveryMethod}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-bold uppercase">{paymentMethod}</p>
                        <p className={`text-[10px] font-black uppercase ${paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{paymentStatus}</p>
                        {order.paymentRef && <p className="font-mono text-[10px] text-slate-500">{order.paymentRef}</p>}
                        {isUpi && paymentStatus !== 'paid' && (
                          <span className="mt-1 block text-[9px] font-bold text-amber-600 animate-pulse">Verification Pending from Store Side</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-black">{money(order.finalTotal)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handlePrintInvoice(order)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            Print
                          </button>
                          {canCollectCod ? (
                            <button
                              type="button"
                              disabled={loadingId === order.id}
                              onClick={() => setCodChoiceOrder(order)}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
                            >
                              Collect COD
                            </button>
                          ) : isUpi && paymentStatus !== 'paid' ? (
                            <button
                              type="button"
                              disabled={loadingId === order.id}
                              onClick={() => handleVerifyUpiPaid(order)}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
                            >
                              Verify UPI & Accept
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={loadingId === order.id || !canProgress}
                              onClick={() => handleAdvanceStatus(order)}
                              className="rounded-lg bg-indigo-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
                            >
                              Mark {nextStatus.replace(/_/g, ' ')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Search & Status Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search ref, phone, name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <select className={`${inputClass} max-w-[160px]`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="packed">Packed</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="text-xs font-bold opacity-70">
          {activeFilteredOrders.length} active / {completedFilteredOrders.length} completed - {money(totalAmount)} total
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border py-12 text-sm opacity-70 dark:border-slate-700">
          <Package className="h-10 w-10 mb-3 opacity-30" />
          <p>{searchQuery || statusFilter !== 'all' ? 'No orders match your filters.' : 'No orders found yet.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeFilteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const colors = statusColors[order.status] || statusColors.pending;
            const paymentStatus = (order.paymentStatus || order.paymentDetails?.status || 'pending').toLowerCase();
            const paymentMethod = (order.paymentMethod || order.paymentDetails?.method || 'cod').toLowerCase();
            const isCod = paymentMethod === 'cod' || paymentMethod === 'cash';
            const isUpi = paymentMethod === 'upi';

            const canMarkCodPaid = isCod
              && paymentStatus !== 'paid'
              && order.status !== 'cancelled'
              && (order.status === 'out_for_delivery' || order.deliveryMethod === 'pickup' || order.status === 'packed');
            
            const canCollectCod = (isDeliveryPartner || isOwner)
              && isCod
              && paymentStatus !== 'paid'
              && order.deliveryMethod === 'delivery'
              && ['packed', 'out_for_delivery', 'delivered'].includes(order.status);
            
            const canVerifyUpiPaid = isUpi && paymentStatus !== 'paid';

            return (
              <div key={order.id} className={`rounded-xl border shadow-sm transition-all ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} ${isExpanded ? 'ring-2 ring-indigo-500' : ''}`}>
                {/* Header Row */}
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-mono text-xs font-bold">{order.orderRef || order.id.substring(0, 8)}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>

                    {/* Store Verification Pending Badge for UPI */}
                    {isUpi && paymentStatus !== 'paid' && (
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 animate-pulse">
                        Verification Pending from Store Side
                      </span>
                    )}

                    <span className="text-xs opacity-70">{order.customerName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black">{money(order.finalTotal)}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-200 p-4 dark:border-slate-700">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-70">Order Identity</p>
                        <p className="font-mono text-xs font-bold">{order.orderRef || '-'}</p>
                        <p className="break-all font-mono text-[10px] opacity-70">ID: {order.id}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">Customer</p>
                        <p className="text-sm font-bold">{order.customerName}</p>
                        <p className="text-xs opacity-70">{order.customerPhone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">Delivery</p>
                        <p className="text-sm font-bold capitalize">{order.deliveryMethod}</p>
                        <p className="text-xs opacity-70">{order.selectedSlot || 'No slot'}</p>
                        {order.deliveryMethod === 'delivery' && order.deliveryAddress && (
                          <p className="text-[10px] opacity-70 mt-1">
                            {(order.deliveryAddress as any).areaAndStreet || (order.deliveryAddress as any).flatAndHouse || 'Address set'}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">Payment</p>
                        <p className="text-sm font-bold capitalize">{paymentMethod}</p>
                        <p className={`text-xs font-bold ${paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {paymentStatus}
                        </p>
                        {order.paymentDetails?.upiReference && (
                          <p className="text-[10px] font-mono opacity-70">Ref: {order.paymentDetails.upiReference}</p>
                        )}
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-2">Items</p>
                      <div className="space-y-1">
                        {order.items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span>{item.productName || item.name} x {item.quantity}</span>
                            <span className="font-bold">{money(getOrderItemTotal(item))}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                        <div className="flex justify-between">
                          <span className="opacity-70">Product subtotal</span>
                          <span className="font-bold">{money(order.amountTotal ?? order.productTotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-70">Delivery charge</span>
                          <span className="font-bold">{money(order.deliveryCharge ?? order.deliveryCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-70">Bag charge</span>
                          <span className="font-bold">{money(order.bagCharge ?? order.bagCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-70">Discount</span>
                          <span className="font-bold">- {money(order.discountAmount ?? order.discount)}</span>
                        </div>
                        <div className="flex justify-between pt-1 text-sm font-black">
                          <span>Grand total</span>
                          <span>{money(order.finalTotal)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                      {order.status !== 'delivered' && order.status !== 'cancelled' ? (
                        <>
                          <button
                            disabled={loadingId === order.id}
                            onClick={() => handleAdvanceStatus(order)}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {loadingId === order.id ? '...' : `Mark ${(nextStatusMap[order.status] || 'delivered').replace(/_/g, ' ')}`}
                          </button>
                          {isOwner && (
                            <button
                              disabled={loadingId === order.id}
                              onClick={() => handleCancelOrder(order)}
                              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Cancel Order
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-bold opacity-70 py-2">Order {order.status === 'delivered' ? 'completed' : 'cancelled'}</span>
                      )}
                      
                      <button className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold flex items-center gap-1.5 dark:border-slate-600" onClick={() => handlePrintInvoice(order)}>
                        <Printer className="h-3.5 w-3.5" /> Print Bill
                      </button>

                      {canMarkCodPaid && (
                        <button disabled={loadingId === order.id} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => handleMarkCodPaid(order)}>
                          {loadingId === order.id ? 'Updating...' : 'Mark COD Paid'}
                        </button>
                      )}

                      {canCollectCod && (
                        <button disabled={loadingId === order.id} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => setCodChoiceOrder(order)}>
                          Collect COD
                        </button>
                      )}

                      {canVerifyUpiPaid && (
                        <button disabled={loadingId === order.id} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => handleVerifyUpiPaid(order)}>
                          {loadingId === order.id ? 'Verifying...' : 'Verify UPI & Accept'}
                        </button>
                      )}

                      {canSendWhatsAppBill(order) && (
                        <button 
                          disabled={loadingId === order.id} 
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 flex items-center gap-1.5" 
                          onClick={() => handleSendWhatsAppInvoice(order)}
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send WhatsApp Bill
                        </button>
                      )}

                      {isOwner && (
                        <button
                          disabled={loadingId === order.id}
                          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 flex items-center gap-1.5"
                          onClick={() => handleDeleteOrder(order)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Archive Invoice
                        </button>
                      )}
                      <span className="text-[10px] opacity-50 py-2 ml-auto">{formatDateTimeDDMMYYYY(order.createdAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {completedFilteredOrders.length > 0 && (
            <section className={`mt-6 rounded-xl border p-4 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-black">Completed Delivered Invoices</h3>
                  <p className="text-[11px] text-slate-500">Delivered orders are stored here.</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {completedFilteredOrders.length} Completed
                </span>
              </div>
              <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 font-black">Invoice</th>
                      <th className="px-3 py-2 font-black">Customer</th>
                      <th className="px-3 py-2 font-black">Payment</th>
                      <th className="px-3 py-2 font-black">Delivered At</th>
                      <th className="px-3 py-2 text-right font-black">Amount</th>
                      <th className="px-3 py-2 text-right font-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedFilteredOrders.map((order) => {
                      const paymentStatus = order.paymentStatus || order.paymentDetails?.status || 'pending';
                      const paymentMethod = order.paymentMethod || order.paymentDetails?.method || 'cod';
                      return (
                        <tr key={order.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-3">
                            <p className="font-mono font-black">{order.orderRef || order.id.slice(0, 8)}</p>
                            <p className="break-all font-mono text-[10px] text-slate-500">{order.id}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold">{order.customerName || 'Customer'}</p>
                            <p className="font-mono text-[10px] text-slate-500">+91 {order.customerPhone || '-'}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold uppercase">{paymentMethod}</p>
                            <p className={`text-[10px] font-black uppercase ${paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{paymentStatus}</p>
                            {order.paymentRef && <p className="font-mono text-[10px] text-slate-500">{order.paymentRef}</p>}
                          </td>
                          <td className="px-3 py-3 text-slate-500">{formatDateTimeDDMMYYYY(order.updatedAt || order.createdAt)}</td>
                          <td className="px-3 py-3 text-right font-black">{money(order.finalTotal)}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-black dark:border-slate-600" onClick={() => handlePrintInvoice(order)}>
                                Print
                              </button>
                              <button disabled={loadingId === order.id} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 flex items-center gap-1" onClick={() => handleSendWhatsAppInvoice(order)}>
                                <Send className="w-3 h-3" /> WhatsApp Bill
                              </button>
                              {isOwner && (
                                <button disabled={loadingId === order.id} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[10px] font-black text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200" onClick={() => handleDeleteOrder(order)}>
                                  Archive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* COD Choice Modal */}
      {codChoiceOrder && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Delivery COD Collection</p>
                <h3 className="mt-1 font-serif text-xl font-black">{codChoiceOrder.orderRef || codChoiceOrder.id.slice(0, 8)}</h3>
                <p className="text-xs text-slate-500">Ask customer how they want to pay the COD amount.</p>
              </div>
              <button type="button" onClick={() => setCodChoiceOrder(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[10px] font-black uppercase text-slate-500">Amount to collect</p>
              <p className="mt-1 text-3xl font-black">{money(codChoiceOrder.finalTotal)}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={loadingId === codChoiceOrder.id}
                onClick={() => handleMarkCodCashPaid(codChoiceOrder)}
                className="rounded-xl bg-emerald-700 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50"
              >
                Cash Collected
                <span className="mt-1 block text-[10px] font-bold opacity-80">Mark COD paid now</span>
              </button>
              <button
                type="button"
                disabled={loadingId === codChoiceOrder.id}
                onClick={() => openCodCollectionQr(codChoiceOrder)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm font-black text-indigo-800 shadow-sm disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
              >
                Show QR Code
                <span className="mt-1 block text-[10px] font-bold opacity-80">Submit UTR after payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COD Collection QR Modal */}
      {codCollection && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Delivery COD Collection</p>
                <h3 className="mt-1 font-serif text-xl font-black">{codCollection.order.orderRef || codCollection.order.id.slice(0, 8)}</h3>
                <p className="text-xs text-slate-500">Show this exact amount QR to the customer.</p>
              </div>
              <button type="button" onClick={() => setCodCollection(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="mb-2 text-xs font-black uppercase text-emerald-700 dark:text-emerald-300">Fixed payable amount</p>
              <p className="mb-3 text-3xl font-black">{money(codCollection.order.finalTotal)}</p>
              <img src={codCollection.qrDataUrl} alt="COD UPI QR" className="mx-auto h-56 w-56 rounded-xl bg-white p-2 shadow-sm" />
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Customer payment UTR / reference</span>
              <input
                value={codCollection.providerRef}
                onChange={(event) => setCodCollection((prev) => prev ? { ...prev, providerRef: event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 30) } : prev)}
                placeholder="e.g. 412345678901"
                className={inputClass}
              />
            </label>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setCodCollection(null)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-black dark:border-slate-700">
                Cancel
              </button>
              <button type="button" disabled={loadingId === codCollection.order.id} onClick={submitCodCollection} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                Submit Collection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
