import React, { useMemo, useState } from 'react';
import { Review } from '../../types';
import { api } from '../../api';
import { Star, Eye, EyeOff, Reply, MessageSquare, Package, User, Search, ArrowDownUp } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/date';

interface Props {
  reviews: Review[];
  isDarkMode: boolean;
  refresh: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function ReviewsView({ reviews, isDarkMode, refresh, showToast }: Props) {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'newest' | 'rating-high' | 'rating-low'>('newest');
  const [reviewSearch, setReviewSearch] = useState('');

  const filteredReviews = useMemo(() => {
    const query = reviewSearch.trim().toLowerCase();
    const matched = reviews.filter((review) => {
      if (!query) return true;
      return [
        review.customerName,
        review.customerPhone,
        review.customerEmail,
        review.productName,
        review.productSku,
        review.productId,
        review.comment
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
    return [...matched].sort((a, b) => {
      if (sortMode === 'rating-high') return Number(b.rating || 0) - Number(a.rating || 0);
      if (sortMode === 'rating-low') return Number(a.rating || 0) - Number(b.rating || 0);
      return new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime();
    });
  }, [reviews, reviewSearch, sortMode]);

  const ratingStats = useMemo(() => {
    const total = reviews.length;
    const visible = reviews.filter((review) => !review.isHidden).length;
    const hidden = total - visible;
    const average = total > 0 ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total : 0;
    return { total, visible, hidden, average };
  }, [reviews]);

  const handleReply = async (id: string) => {
    if (!replyText[id]?.trim()) return;
    try {
      await api.replyToReview(id, replyText[id]);
      showToast('Reply published.', 'success');
      setReplyText((prev) => ({ ...prev, [id]: '' }));
      setExpandedReply(null);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Unable to reply', 'error');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.toggleHideReview(id);
      showToast('Review visibility updated.', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Unable to update review', 'error');
    }
  };

  const sectionBg = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const inputClass = `w-full rounded-lg border px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black">Quality Reviews</h2>
          <p className="text-xs opacity-70">Respond to customer reviews and moderate content.</p>
        </div>
        <button onClick={refresh} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Reviews', value: ratingStats.total },
          { label: 'Visible Reviews', value: ratingStats.visible },
          { label: 'Hidden Reviews', value: ratingStats.hidden },
          { label: 'Average Rating', value: ratingStats.average ? `${ratingStats.average.toFixed(1)}/5` : '0/5' }
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl border p-4 ${sectionBg}`}>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{stat.label}</p>
            <p className="mt-1 text-xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-xl border p-3 ${sectionBg}`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_auto] lg:items-end">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Search Review / Product / Reviewer</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                value={reviewSearch}
                onChange={(event) => setReviewSearch(event.target.value)}
                placeholder="Search product name, SKU, customer name, phone, comment..."
              />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Sort By Rating</span>
            <select className={inputClass} value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
              <option value="newest">Newest first</option>
              <option value="rating-high">Highest rating first</option>
              <option value="rating-low">Lowest rating first</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setReviewSearch('');
              setSortMode('newest');
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
        <p className="mt-2 text-[11px] font-bold text-slate-500">Showing {filteredReviews.length} of {reviews.length} reviews</p>
      </div>

      {reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border py-12 text-sm opacity-70 dark:border-slate-700">
          <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
          <p>No reviews available yet.</p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-320px)] space-y-3 overflow-y-auto pr-1">
          {filteredReviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs font-bold text-slate-500 dark:border-slate-700">
              No reviews match this search or sort filter.
            </div>
          ) : filteredReviews.map((review) => (
            <div key={review.id} className={`rounded-xl border p-4 shadow-sm ${sectionBg}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                    <User className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Reviewed By</p>
                    <p className="text-sm font-bold">{review.customerName || 'Customer'}</p>
                    {review.customerPhone && <p className="font-mono text-[10px] text-slate-500">+91 {review.customerPhone}</p>}
                    {review.customerEmail && <p className="truncate text-[10px] text-slate-500">{review.customerEmail}</p>}
                  </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/40">
                      <Package className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Product Reviewed</p>
                      <p className="truncate text-sm font-bold">{review.productName || 'Product not found'}</p>
                      <p className="font-mono text-[10px] text-slate-500">{review.productSku || review.productId}</p>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center gap-1 mt-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`h-3 w-3 ${star <= review.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                      ))}
                      <span className="text-[10px] font-mono opacity-70 ml-1">{review.rating}/5</span>
                      {review.isHidden && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">Hidden</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {review.isHidden ? (
                    <button onClick={() => handleToggle(review.id)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[10px] font-bold flex items-center gap-1 dark:border-slate-600"><Eye className="h-3 w-3" /> Unhide</button>
                  ) : (
                    <button onClick={() => handleToggle(review.id)} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-bold text-white flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hide</button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{review.comment}</p>
              <p className="mt-2 text-[11px] opacity-60">{formatDateDDMMYYYY(review.date || Date.now())}</p>

              {/* Reply Section */}
              <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-2">
                  {review.reply ? 'Your Reply:' : 'No reply yet'}
                </p>
                {review.reply && (
                  <div className="mb-3 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
                    {review.reply}
                  </div>
                )}
                {expandedReply === review.id ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={replyText[review.id] || ''}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      placeholder="Write your reply..."
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleReply(review.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"><Reply className="h-3 w-3 inline" /> Send</button>
                      <button onClick={() => { setExpandedReply(null); setReplyText((prev) => ({ ...prev, [review.id]: '' })); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-600">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setExpandedReply(review.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-bold flex items-center gap-1 dark:border-slate-600">
                    <Reply className="h-3 w-3" /> {review.reply ? 'Edit Reply' : 'Write Reply'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
