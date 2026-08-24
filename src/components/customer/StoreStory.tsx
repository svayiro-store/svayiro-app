import React from 'react';
import { Leaf, PackageCheck, Store } from 'lucide-react';
import { ShopProfile } from '../../types';

interface StoreStoryProps {
  shop: ShopProfile;
  compact?: boolean;
}

export default function StoreStory({ shop, compact = false }: StoreStoryProps) {
  const shopName = shop.name || 'SVAYIRO';

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="space-y-3 text-xs leading-relaxed text-slate-600 ">
          <p>
            Our journey began in 2022 as <strong>Sri Ram Enterprises</strong>, a local general store built around everyday trust, familiar service, and dependable household essentials.
          </p>
          <p>
            In 2024, we started <strong>Sri Ram Natural Food Products</strong>, preparing and packing cereals, millets, flours, rotis, grains, poha, and other staple foods with clean sourcing and hygienic handling.
          </p>
          <p>
            In 2026, we brought this work online as <strong>{shopName}</strong>. Our tagline, <strong>{shop.tagline || 'Trust In Every Choice'}</strong>, reflects our promise: healthy, natural, and dependable food choices for every family.
          </p>
        </div>

        <div className="space-y-2">
          {[
            { year: '2022', title: 'Sri Ram Enterprises', text: 'Started as a trusted local general store.', icon: Store },
            { year: '2024', title: 'Sri Ram Natural Food Products', text: 'Started our own natural food product line.', icon: PackageCheck },
            { year: '2026', title: shopName, text: 'Launched online to reach more customers.', icon: Leaf }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.year} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3  ">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600  ">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.year}</p>
                  <p className="text-xs font-semibold text-slate-900 ">{item.title}</p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 ">{item.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3  ">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What We Sell</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 ">
            Groceries, daily needs, dairy products, natural food products, cereals, millets, flours, rotis, grains, poha, fresh fruits, and fresh vegetables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-slate-600 ">
          Our journey began in 2022 as <strong>Sri Ram Enterprises</strong>, a local general store built around everyday trust, familiar service, and dependable household essentials.
        </p>
        <p className="text-xs leading-relaxed text-slate-600 ">
          In 2024, we took the next step by starting our own natural food line under <strong>Sri Ram Natural Food Products</strong>. We began preparing and packing cereals, millets, flours, rotis, grains, poha, and other staple foods with a focus on clean sourcing, careful handling, and practical nutrition for daily kitchens.
        </p>
        <p className="text-xs leading-relaxed text-slate-600 ">
          In 2026, we decided to bring this work online with a new brand identity: <strong>{shopName}</strong>. Our tagline, <strong>{shop.tagline || 'Trust In Every Choice'}</strong>, reflects the standard we want customers to feel in every order.
        </p>
        <p className="text-xs leading-relaxed text-slate-600 ">
          We encourage people to choose healthy, natural, and hygienically handled food. Some products are sourced directly from farmers, and many staples are selected with freshness, purity, and day-to-day family use in mind.
        </p>
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3  ">
          <Store className="mb-2 h-4 w-4 text-emerald-600 " />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ">Since 2022</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600 ">
            Started as Sri Ram Enterprises, serving local daily needs as a general store.
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3  ">
          <PackageCheck className="mb-2 h-4 w-4 text-amber-600 " />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 ">Since 2024</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600 ">
            Started our own natural food products for cereals, millets, flours, grains, poha, and more.
          </p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3  ">
          <Leaf className="mb-2 h-4 w-4 text-indigo-600 " />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 ">Since 2026</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600 ">
            Launched {shopName} online to reach more families with trusted groceries and natural staples.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/80 p-3  ">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What We Sell</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 ">
          We provide all types of groceries, daily needs, dairy products, natural food products, cereals, millets, flours, rotis, grains, poha, fresh fruits, and fresh vegetables.
        </p>
      </div>
    </div>
  );
}
