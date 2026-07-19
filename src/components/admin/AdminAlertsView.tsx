import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, BellRing, CheckCircle2, MessageSquare, RefreshCw, Star, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { AdminAlert } from '../../types';

interface Props {
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' }
];

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'complaint', label: 'Complaints' },
  { value: 'support', label: 'Support / FAQ' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'review', label: 'Reviews' },
  { value: 'reservation', label: 'Reservations' },
  { value: 'order', label: 'Orders' },
  { value: 'system', label: 'System' }
];

const typeIcon: Record<string, React.ElementType> = {
  complaint: AlertTriangle,
  support: MessageSquare,
  feedback: MessageSquare,
  review: Star,
  reservation: BellRing,
  order: BellRing,
  system: BellRing
};

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function AdminAlertsView({ isDarkMode, showToast }: Props) {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [status, setStatus] = useState('unread');
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(false);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const rows = await api.getAdminAlerts({ status, type });
      setAlerts(rows);
    } catch (err: any) {
      showToast(err?.message || 'Unable to load admin alerts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [status, type]);

  const counts = useMemo(() => ({
    unread: alerts.filter((alert) => alert.status === 'unread').length,
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    total: alerts.length
  }), [alerts]);

  const updateStatus = async (id: string, nextStatus: 'unread' | 'read' | 'archived') => {
    try {
      const res = await api.updateAdminAlertStatus(id, nextStatus);
      setAlerts((current) => current.map((alert) => alert.id === id ? res.data : alert));
      showToast('Alert updated.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Unable to update alert', 'error');
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await api.deleteAdminAlert(id);
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      showToast('Alert deleted.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Unable to delete alert', 'error');
    }
  };

  const panelClass = isDarkMode
    ? 'border-slate-800 bg-slate-950 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';
  const inputClass = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-black">Admin Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">Private shop alerts from feedback, complaints, reviews, reservations, and order events.</p>
        </div>
        <button
          type="button"
          onClick={loadAlerts}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-black text-white shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl border p-4 ${panelClass}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Showing</p>
          <p className="mt-2 text-2xl font-black">{counts.total}</p>
        </div>
        <div className={`rounded-xl border p-4 ${panelClass}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Unread In View</p>
          <p className="mt-2 text-2xl font-black text-indigo-500">{counts.unread}</p>
        </div>
        <div className={`rounded-xl border p-4 ${panelClass}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Critical In View</p>
          <p className="mt-2 text-2xl font-black text-rose-500">{counts.critical}</p>
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${panelClass}`}>
        <div className="grid gap-3 md:grid-cols-[180px_220px_1fr] md:items-end">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-bold ${inputClass}`}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Alert Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-bold ${inputClass}`}>
              {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <p className="text-xs font-semibold text-slate-500">
            Customer notification bell now shows only records published from Alert Bulletins.
          </p>
        </div>
      </div>

      <div className={`overflow-hidden rounded-xl border ${panelClass}`}>
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm font-bold text-slate-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <BellRing className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-black">No alerts found.</p>
            <p className="mt-1 text-xs text-slate-500">Change filters or wait for new customer activity.</p>
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-y-auto">
            {alerts.map((alert) => {
              const Icon = typeIcon[alert.type] || BellRing;
              return (
                <article key={alert.id} className={`border-b p-4 last:border-b-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        alert.severity === 'critical'
                          ? 'bg-rose-100 text-rose-700'
                          : alert.severity === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-black">{alert.title}</h2>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{alert.type}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                            alert.status === 'unread'
                              ? 'bg-indigo-100 text-indigo-700'
                              : alert.status === 'archived'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}>{alert.status}</span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{alert.message}</p>
                        <p className="mt-2 text-[11px] font-semibold text-slate-400">
                          {formatDate(alert.createdAt || alert.date)}{alert.source ? ` · ${alert.source}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {alert.status !== 'read' && (
                        <button type="button" onClick={() => updateStatus(alert.id, 'read')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Read
                        </button>
                      )}
                      {alert.status !== 'archived' && (
                        <button type="button" onClick={() => updateStatus(alert.id, 'archived')} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-[11px] font-black text-white">
                          <Archive className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      )}
                      <button type="button" onClick={() => deleteAlert(alert.id)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-black text-white">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
