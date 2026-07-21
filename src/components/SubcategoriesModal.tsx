import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Subcategory {
  id: string;
  name: string;
  slug?: string;
}

interface SubcategoriesModalProps {
  isOpen: boolean;
  categoryId: string | null;
  categoryName: string;
  onClose: () => void;
  onSelectSubcategory?: (subcategory: Subcategory) => void;
}

export function SubcategoriesModal({
  isOpen,
  categoryId,
  categoryName,
  onClose,
  onSelectSubcategory
}: SubcategoriesModalProps) {
  const [subcategories, setSubcategories] = React.useState<Subcategory[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && categoryId) {
      fetchSubcategories(categoryId);
    }
  }, [isOpen, categoryId]);

  const fetchSubcategories = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${id}/subcategories`);
      if (!response.ok) {
        throw new Error('Failed to fetch subcategories');
      }
      const data = await response.json();
      setSubcategories(Array.isArray(data) ? data : data.subcategories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSubcategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-lg shadow-2xl overflow-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{categoryName}</h2>
            <p className="text-sm text-gray-500 mt-1">Select a subcategory</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : subcategories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No subcategories available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subcategories.map((subcategory) => (
                <button
                  key={subcategory.id}
                  onClick={() => {
                    onSelectSubcategory?.(subcategory);
                    onClose();
                  }}
                  className="p-4 border border-gray-200 rounded-lg hover:border-green-600 hover:bg-green-50 transition-all duration-200 text-left group"
                >
                  <h3 className="font-semibold text-gray-900 group-hover:text-green-700">
                    {subcategory.name}
                  </h3>
                  {subcategory.slug && (
                    <p className="text-xs text-gray-500 mt-1">{subcategory.slug}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
