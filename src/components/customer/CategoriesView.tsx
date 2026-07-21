import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Category, CustomerTab } from '../../types';
import { SubcategoriesModal } from '../SubcategoriesModal';

interface CategoriesViewProps {
  categories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  setActiveTab: (tab: CustomerTab) => void;
  isDarkMode: boolean;
}

export default function CategoriesView({
  categories,
  selectedCategory,
  setSelectedCategory,
  setActiveTab,
  isDarkMode
}: CategoriesViewProps) {
  const [activeSubcategoryParent, setActiveSubcategoryParent] = useState<{ id: string; name: string } | null>(null);

  // Only show top-level categories here; subcategories appear inside the modal
  const topLevelCategories = categories.filter(cat => !cat.parentId);

  const handleCategoryClick = (cat: Category) => {
    const hasSubcategories = categories.some(c => c.parentId === cat.id);
    if (hasSubcategories) {
      setActiveSubcategoryParent({ id: cat.id, name: cat.name });
    } else {
      setSelectedCategory(cat.id);
      setActiveTab('home');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-black text-left">All Catalog Categories</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {topLevelCategories.map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => handleCategoryClick(cat)}
              className={`flex gap-4 p-5 border rounded-2xl cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300 group relative overflow-hidden ${isSelected ? 'border-indigo-500 bg-indigo-500/5' : isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/40 hover:bg-[#1e293b]/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
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
                  <span>View items</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SubcategoriesModal
        isOpen={Boolean(activeSubcategoryParent)}
        categoryId={activeSubcategoryParent?.id || null}
        categoryName={activeSubcategoryParent?.name || ''}
        onClose={() => setActiveSubcategoryParent(null)}
        onSelectSubcategory={(subcategory) => {
          setSelectedCategory(subcategory.id);
          setActiveSubcategoryParent(null);
          setActiveTab('home');
        }}
      />
    </div>
  );
}
