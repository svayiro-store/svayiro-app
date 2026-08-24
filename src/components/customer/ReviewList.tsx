import React from 'react';
import { Star } from 'lucide-react';
import { Review } from '../../types';
import { formatDateDDMMYYYY } from '../../utils/date';

interface ReviewListProps {
  pId: string;
  reviews: Review[];
}

export function ReviewList({ pId, reviews }: ReviewListProps) {
  // Use fallbacks list or provided reviews
  const data = (reviews || []).filter(rev => rev.productId === pId && !rev.isHidden);

  if (data.length === 0) {
    return <span className="opacity-70 text-[10px] block py-2 select-none">No comments published yet. Be first to rate!</span>;
  }

  return (
    <div className="space-y-3 pt-1">
      {data.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900 ">{r.customerName || 'Verified Customer'}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Verified review {r.date || r.createdAt ? `- ${formatDateDDMMYYYY(r.date || r.createdAt)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-600 ">
              <span className="text-[10px] font-semibold">{r.rating}/5</span>
              <div className="flex leading-none">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-2.5 w-2.5 ${r.rating > i ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`} />
                ))}
              </div>
            </div>
          </div>
          {r.comment ? (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-700 ">{r.comment}</p>
          ) : (
            <p className="mt-2 text-[10px] font-semibold italic text-slate-400">Rated without written review.</p>
          )}
          {r.reply && (
            <div className="bg-indigo-50/60  border-l-2 border-indigo-500 p-2 rounded-r mt-2 font-sans">
              <span className="text-[9px] font-semibold text-indigo-600  block">Owner reply:</span>
              <p className="text-[11px] opacity-80 mt-0.5">{r.reply}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Mock fallback reviews
export const reviewsListMockFallback: Review[] = [
  {
    id: "rev_1",
    productId: "prod_atta_10kg",
    customerName: "Rakesh Sharma",
    rating: 5,
    comment: "This whole wheat flour is superb. The rotis are indeed exceptionally soft and stay fresh for a very long time.",
    date: "2026-06-01T10:30:00Z",
    reply: "Thank you Rakesh! We take immense pride in stone grinding our flour freshly every day for our beloved customers.",
    isHidden: false
  },
  {
    id: "rev_2",
    productId: "prod_atta_10kg",
    customerName: "Anjali Gupta",
    rating: 4,
    comment: "Very high quality Atta, absolutely clean and wholesome. Recommending this shop to everyone in the neighborhood.",
    date: "2026-06-05T14:15:00Z",
    reply: null,
    isHidden: false
  },
  {
    id: "rev_3",
    productId: "prod_milk_500ml",
    customerName: "Amit Verma",
    rating: 5,
    comment: "Excellent high-cream milk. Highly consistent quality, and prompt morning delivery slots.",
    date: "2026-06-08T08:00:00Z",
    reply: "Thank you Amit! Happy to fuel your mornings.",
    isHidden: false
  }
];
