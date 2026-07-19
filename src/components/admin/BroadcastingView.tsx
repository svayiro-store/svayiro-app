import React, { useEffect, useState } from 'react';
import { Notification } from '../../types';
import { api } from '../../api';
import { Bell, Plus, Trash2, Edit3, Send, X, Megaphone } from 'lucide-react';
import { formatDateTimeDDMMYYYY } from '../../utils/date';

interface Props {
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
const sectionClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const typeColors: Record<string, string> = {
  offer: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  order: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  holiday: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  announcement: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
};

export default function BroadcastingView({ isDarkMode, showToast }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'offer'|'order'|'holiday'|'announcement'>('announcement');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const resetForm = () => {
    setTitle(''); setMessage(''); setType('announcement'); setEditingId(null);
  };

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) {
      showToast('Title and message are required', 'warning');
      return;
    }
    try {
      await api.createNotification({ title, message, type });
      showToast('Notification published!', 'success');
      resetForm();
      loadNotifications();
    } catch (err: any) {
      showToast(err.message || 'Failed to publish notification', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !title.trim() || !message.trim()) return;
    try {
      await api.updateNotification(editingId, { title, message, type });
      showToast('Notification updated!', 'success');
      resetForm();
      loadNotifications();
    } catch (err: any) {
      showToast(err.message || 'Failed to update notification', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this notification?')) return;
    try {
      await api.deleteNotification(id);
      showToast('Notification deleted.', 'success');
      loadNotifications();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete notification', 'error');
    }
  };

  const startEdit = (notif: Notification) => {
    setEditingId(notif.id);
    setTitle(notif.title);
    setMessage(notif.message);
    setType(notif.type);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black">Alert Bulletins</h2>
          <p className="text-xs opacity-70">Push updates, offers, and holiday messages to customers.</p>
        </div>
        <button onClick={loadNotifications} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Reload</button>
      </div>

      {/* Create/Edit Form */}
      <div className={sectionClass}>
        <h3 className="mb-4 flex items-center gap-2 border-b border-indigo-700 pb-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-300">
          {editingId ? <><Edit3 className="h-4 w-4" /> Edit Bulletin</> : <><Bell className="h-4 w-4" /> Create Bulletin</>}
        </h3>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title..." />
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="announcement">Announcement</option>
            <option value="offer">Offer</option>
            <option value="order">Order</option>
            <option value="holiday">Holiday</option>
          </select>
          {editingId ? (
            <button onClick={handleUpdate} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><Send className="h-3.5 w-3.5 inline" /> Update</button>
          ) : (
            <button onClick={handleCreate} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"><Send className="h-3.5 w-3.5 inline" /> Publish</button>
          )}
        </div>
        <textarea className={`${inputClass} mt-3 min-h-24 resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Notification message..." />
        {editingId && (
          <button onClick={resetForm} className="mt-2 text-xs font-bold text-rose-600 flex items-center gap-1"><X className="h-3 w-3" /> Cancel Editing</button>
        )}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="p-6 border rounded text-center">Loading messages...</div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border py-12 text-sm opacity-70 dark:border-slate-700">
          <Megaphone className="h-10 w-10 mb-3 opacity-30" />
          <p>No notifications have been published.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => {
            const colors = typeColors[notif.type] || typeColors.announcement;
            return (
              <div key={notif.id} className={`rounded-xl border p-4 shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/40">
                      <Bell className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{notif.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${colors}`}>{notif.type}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(notif)} className="rounded-lg border border-slate-300 p-2 dark:border-slate-600"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(notif.id)} className="rounded-lg border border-rose-300 p-2 text-rose-600 dark:border-rose-900 dark:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{notif.message}</p>
                <p className="mt-2 text-[10px] opacity-50">{formatDateTimeDDMMYYYY(notif.date || Date.now())}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
