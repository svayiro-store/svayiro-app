import React, { useState } from 'react';
import { AdvanceRequest } from '../../types';
import { api } from '../../api';
import { Calendar, CheckCircle, XCircle, Clock, ArrowRight, Phone, MessageSquare } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/date';

interface Props {
  advanceRequests: AdvanceRequest[];
  isDarkMode: boolean;
  refresh: () => void;
  showToast?: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  arranged: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  converted_to_order: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
};

export default function AdvanceRequestsView({ advanceRequests, isDarkMode, refresh, showToast }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleStatus = async (id: string, status: string) => {
    setLoadingId(id);
    try {
      await api.updateAdvanceRequestStatus(id, status);
      showToast?.('Advance booking status updated.', 'success');
      refresh();
    } catch (err: any) {
      console.error(err);
      showToast?.(err.message || 'Failed to update advance booking.', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const sectionBg = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Advance Bookings</h2>
          <p className="text-xs opacity-70">Manage future product reservations from customers.</p>
        </div>
        <button onClick={refresh} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Refresh</button>
      </div>

      {advanceRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border py-12 text-sm opacity-70 dark:border-slate-700">
          <Calendar className="h-10 w-10 mb-3 opacity-30" />
          <p>No advance request entries found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {advanceRequests.map((req) => {
            const colors = statusColors[req.status] || statusColors.pending;
            return (
              <div key={req.id} className={`rounded-xl border p-4 shadow-sm ${sectionBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/40">
                      <Calendar className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{req.productName}</p>
                      <p className="text-xs opacity-70">{req.customerName} · {req.customerPhone}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${colors}`}>
                    {req.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                  <div><span className="font-bold">Qty:</span> {req.quantity}</div>
                  <div><span className="font-bold">Target:</span> {formatDateDDMMYYYY(req.targetDate)}</div>
                  <div><span className="font-bold">Note:</span> {req.note || 'None'}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                  {req.status === 'pending' && (
                    <>
                      <button disabled={loadingId === req.id} onClick={() => handleStatus(req.id, 'accepted')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Accept</button>
                      <button disabled={loadingId === req.id} onClick={() => handleStatus(req.id, 'rejected')} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><XCircle className="h-3 w-3" /> Reject</button>
                    </>
                  )}
                  {(req.status === 'accepted' || req.status === 'pending') && (
                    <button disabled={loadingId === req.id} onClick={() => handleStatus(req.id, 'arranged')} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><Clock className="h-3 w-3" /> Mark Arranged</button>
                  )}
                  {req.status === 'arranged' && (
                    <button disabled={loadingId === req.id} onClick={() => handleStatus(req.id, 'converted_to_order')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Convert to Order</button>
                  )}
                  <a href={`tel:${req.customerPhone}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-bold flex items-center gap-1 dark:border-slate-600"><Phone className="h-3 w-3" /> Call</a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
