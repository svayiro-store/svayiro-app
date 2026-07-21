import React, { useState } from 'react';
import { ChevronRight, Compass } from 'lucide-react';
import { Category, CustomerTab } from '../../types';

interface CategoriesViewProps {
  categories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  setActiveTab: (tab: CustomerTab) => void;
  isDarkMode: boolean;
}

const ringPalette = [
  'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900',
  'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
  'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
  'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900',
  'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900',
];

export default function CategoriesView({
  categories,
  selectedCategory,
  setSelectedCategory,
  setActiveTab,
  isDarkMode
}: CategoriesViewProps) {
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  // Only show top-level categories in the main grid; subcategories expand inline below
  const topLevelCategories = categories.filter(cat => !cat.parentId);

  const handleCategoryClick = (cat: Category) => {
    const hasSubcategories = categories.some(c => c.parentId === cat.id);
    if (hasSubcategories) {
      setExpandedCategoryId(prev => (prev === cat.id ? null : cat.id));
    } else {
      setSelectedCategory(cat.id);
      setExpandedCategoryId(null);
      setActiveTab('home');
    }
  };

  const expandedParentCat = expandedCategoryId ? categories.find(c => c.id === expandedCategoryId) : null;
  const expandedSubcategories = expandedCategoryId ? categories.filter(c => c.parentId === expandedCategoryId) : [];

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-black text-left">All Catalog Categories</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {topLevelCategories.map(cat => {
          const isSelected = selectedCategory === cat.id;
          const isExpanded = expandedCategoryId === cat.id;
          const hasSubcategories = categories.some(c => c.parentId === cat.id);
          return (
            <div
              key={cat.id}
              onClick={() => handleCategoryClick(cat)}
              className={`flex gap-4 p-5 border rounded-2xl cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300 group relative overflow-hidden ${isSelected || isExpanded ? 'border-indigo-500 bg-indigo-500/5' : isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/40 hover:bg-[#1e293b]/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shadow-inner border border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50">
                <img
                  src={cat.imageUrl}
                  alt={cat.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1 space-y-2 mt-1 text-left">
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs opacity-70 leading-relaxed line-clamp-2">
                  {cat.description || "Premium freshly processed items"}
                </p>
                <span className="text-xs font-bold text-indigo-500 flex items-center gap-1.5 pt-1">
                  <span>{hasSubcategories ? (isExpanded ? 'Hide subcategories' : 'View subcategories') : 'View items'}</span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline subcategory panel - bigger round circles, expands below the grid, no modal */}
      {expandedParentCat && expandedSubcategories.length > 0 && (
        <div className={`rounded-2xl border p-4 animate-fadeIn ${isDarkMode ? 'border-indigo-900/50 bg-indigo-950/10' : 'border-indigo-100 bg-indigo-50/40'}`}>
          <div className="flex items-center justify-between pb-3">
            <p className="text-sm font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Browse in {expandedParentCat.name}
            </p>
            <button
              onClick={() => setExpandedCategoryId(null)}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold hover:underline"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            {/* Shortcut to view everything under the main category */}
            <div
              onClick={() => {
                setSelectedCategory(expandedParentCat.id);
                setActiveTab('home');
              }}
              className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
            >
              <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center border-2 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md ${
                selectedCategory === expandedParentCat.id
                  ? 'border-indigo-700 bg-indigo-100 dark:bg-indigo-900/40 ring-4 ring-indigo-500/20'
                  : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800'
              }`}>
                <Compass className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
              </div>
              <span className="text-[11px] md:text-xs font-bold text-center tracking-tight max-w-[88px] truncate text-indigo-700 dark:text-indigo-300">
                View All
              </span>
            </div>

            {expandedSubcategories.map((sub, idx) => {
              const isSubSelected = selectedCategory === sub.id;
              return (
                <div
                  key={sub.id}
                  onClick={() => {
                    setSelectedCategory(sub.id);
                    setActiveTab('home');
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer group shrink-0"
                >
                  <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center border-2 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-md ${
                    isSubSelected
                      ? 'border-indigo-700 ring-4 ring-indigo-500/20 bg-indigo-100 dark:bg-indigo-900/40'
                      : ringPalette[idx % ringPalette.length]
                  }`}>
                    <div className="relative w-[86%] h-[86%] rounded-full overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center shadow-inner">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase select-none">
                        {sub.name.substring(0, 2)}
                      </span>
                      {sub.imageUrl && (
                        <img
                          src={sub.imageUrl}
                          alt={sub.name}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover z-10"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </div>
                  </div>
                  <span className={`text-[11px] md:text-xs font-semibold text-center tracking-tight max-w-[88px] truncate ${isSubSelected ? 'text-indigo-700 dark:text-indigo-300 font-extrabold' : 'text-slate-700 dark:text-slate-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300'}`}>
                    {sub.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
