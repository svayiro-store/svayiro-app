// src/components/PublicPrintBill.tsx
import React, { useEffect, useState } from 'react';
import { Order } from '../types';
import { api } from '../api';

export const PublicPrintBill: React.FC<{ websiteUrl?: string }> = ({ 
  websiteUrl = 'https://svayiro.co.in' 
}) => {
  const orderId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);

    // Try fetching invoice publicly
    api.getPublicOrderInvoice(orderId)
      .then(res => setOrder(res.data || res))
      .catch(err => {
        // Fallback: If localStorage contains cached orders (for offline/demo)
        try {
          const localOrders: Order[] = JSON.parse(localStorage.getItem('svayiro_orders') || '[]');
          const matched = localOrders.find(o => o.id === orderId || o.orderRef === orderId);
          if (matched) {
            setOrder(matched);
            return;
          }
        } catch {}
        setError('Invoice not found or link has expired.');
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Loading Invoice...</div>;
  if (error || !order) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontFamily: 'sans-serif' }}>
      <h2>Invoice Not Available</h2>
      <p>{error || 'Invalid invoice link.'}</p>
      <a href={websiteUrl} style={{ color: '#2563eb', fontWeight: 'bold' }}>Return to SVAYIRO Store</a>
    </div>
  );

  const money = (val: any) => `Rs. ${Number(val || 0).toFixed(2)}`;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px 12px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', background: '#fff', border: '1px solid #0f172a', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        {/* Invoice Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '14px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '0.08em' }}>SVAYIRO</h1>
            <div style={{ color: '#64748b', fontSize: '12px', marginTop: 4 }}>
              Premium Groceries & Daily Essentials<br />Purity & Quality Delivered Daily
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ border: '1px solid #0f172a', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 800 }}>
              INVOICE / BILL
            </span>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Invoice #: <strong>{order.orderRef || order.id}</strong><br />
              Status: <strong>{String(order.status).toUpperCase()}</strong>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', margin: '16px 0' }}>
          <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Customer</div>
            <strong>{order.customerName || 'Customer'}</strong><br />
            <span style={{ fontSize: '12px', color: '#64748b' }}>Phone: {order.customerPhone || '-'}</span>
          </div>
          <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight 800, color: '#64748b', textTransform: 'uppercase' }}>Payment</div>
            <strong>Mode: {String(order.paymentMethod || 'COD').toUpperCase()}</strong><br />
            <span style={{ fontSize: '12px', color: '#64748b' }}>Status: {String(order.paymentStatus || 'Pending').toUpperCase()}</span>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px' }}>#</th>
              <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px' }}>ITEM</th>
              <th style={{ padding: '8px', textAlign: 'right', fontSize: '11px' }}>QTY</th>
              <th style={{ padding: '8px', textAlign: 'right', fontSize: '11px' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>
                <td style={{ padding: '8px' }}>{idx + 1}</td>
                <td style={{ padding: '8px' }}><strong>{item.productName || item.name}</strong></td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity || 1}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{money(item.totalPrice || item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 900, borderTop: '2px solid #0f172a', paddingTop: '8px' }}>
            Grand Total: {money(order.finalAmount || order.finalTotal || order.amountTotal)}
          </div>
        </div>

        {/* WEBSITE LINK & FOOTER MESSAGE AT THE BOTTOM */}
        <div style={{ marginTop: '32px', borderTop: '1px dashed #94a3b8', paddingTop: '16px', textAlign: 'center', fontSize: '13px', color: '#334155' }}>
          <p style={{ margin: '0 0 6px 0', fontWeight: 'bold' }}>Thank you for shopping with SVAYIRO!</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            To place more orders & browse fresh products, visit our website:
          </p>
          <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '6px', color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline' }}>
            {websiteUrl}
          </a>
        </div>

        {/* Print Button */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button onClick={() => window.print()} style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            Print / Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublicPrintBill;
