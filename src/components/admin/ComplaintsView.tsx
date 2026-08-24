import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { AlertTriangle, Clock, CheckCircle, XCircle, Search, Filter, Trash2 } from 'lucide-react';

interface Complaint {
  id: string;
  customer_name: string;
  customer_phone: string;
  subject: string;
  category: string;
  description: string;
  admin_answer?: string;
  answered_at?: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function ComplaintsView({ isDarkMode, showToast }: { isDarkMode: boolean; showToast: (m: string, t: 'success' | 'info' | 'warning' | 'error') => void }) {
  const [tickets, setTickets] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await api.getComplaints();
      setTickets(res.tickets || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load complaints', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.updateComplaintStatus(id, status);
      showToast('Ticket updated', 'success');
      loadTickets();
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    }
  };

  const deleteTicket = async (ticket: Complaint) => {
    if (!window.confirm(`Delete complaint "${ticket.subject}"? This cannot be undone.`)) return;
    try {
      await api.deleteComplaint(ticket.id);
      showToast('Complaint deleted', 'success');
      loadTickets();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete complaint', 'error');
    }
  };

  const saveAnswer = async (ticket: Complaint) => {
    const answer = (answerDrafts[ticket.id] ?? ticket.admin_answer ?? '').trim();
    if (!answer) {
      showToast('Enter an answer before saving.', 'warning');
      return;
    }
    try {
      await api.updateComplaintStatus(ticket.id, 'resolved', answer);
      showToast('Answer saved and ticket resolved', 'success');
      loadTickets();
    } catch (err: any) {
      showToast(err.message || 'Failed to save answer', 'error');
    }
  };

  const filtered = tickets.filter(t => {
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesSearch = !searchQuery || t.subject.toLowerCase().includes(searchQuery.toLowerCase()) || t.customer_phone.includes(searchQuery) || t.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusColor = (s: string) => s === 'open' ? 'bg-amber-100 text-amber-700' : s === 'in_progress' ? 'bg-blue-100 text-blue-700' : s === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700';
  const priorityColor = (p: string) => p === 'high' ? 'text-rose-600 font-semibold' : p === 'medium' ? 'text-amber-600 font-bold' : 'text-slate-500';

  return (
    <div className={`rounded-2xl border p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-serif text-lg font-semibold text-slate-900 ">Complaints & Tickets</h3>
          <p className="text-[11px] text-slate-500 ">Manage customer support tickets</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className={`pl-9 pr-3 py-2 rounded-xl border text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`} placeholder="Search tickets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className={`px-3 py-2 rounded-xl border text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {loading ? <div className="text-xs text-slate-500">Loading tickets...</div> : filtered.length === 0 ? (
        <div className="text-center py-10 text-xs text-slate-500">No tickets found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => (
            <div key={ticket.id} className={`p-4 rounded-2xl border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-bold ${statusColor(ticket.status)}`}>{ticket.status.replace('_', ' ')}</span>
                    <span className={`text-[10px] uppercase ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                    <span className="text-[10px] text-slate-400">{ticket.category}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 ">{ticket.subject}</p>
                  <p className="text-[11px] text-slate-500  mt-1 line-clamp-2">{ticket.description}</p>
                  {ticket.admin_answer && (
                    <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800   ">
                      Answer: {ticket.admin_answer}
                    </div>
                  )}
                  {ticket.category === 'faq_question' && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <textarea
                        value={answerDrafts[ticket.id] ?? ticket.admin_answer ?? ''}
                        onChange={(event) => setAnswerDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                        placeholder="Type admin answer for this customer question..."
                        className={`min-h-20 flex-1 rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}
                      />
                      <button onClick={() => saveAnswer(ticket)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white">
                        Save Answer
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">{ticket.customer_name} • {ticket.customer_phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  {ticket.status === 'open' && <button onClick={() => updateStatus(ticket.id, 'in_progress')} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold">Start</button>}
                  {ticket.status === 'in_progress' && <button onClick={() => updateStatus(ticket.id, 'resolved')} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">Resolve</button>}
                  {(ticket.status === 'resolved' || ticket.status === 'in_progress') && <button onClick={() => updateStatus(ticket.id, 'open')} className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-[11px] font-bold">Reopen</button>}
                  <button onClick={() => deleteTicket(ticket)} className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-bold flex items-center gap-1   ">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
