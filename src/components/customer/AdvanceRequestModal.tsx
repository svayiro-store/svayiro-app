import React from 'react';
import { X } from 'lucide-react';
import { commonStyles } from './commonStyles';

interface AdvanceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  reqProductName: string;
  setReqProductName: (val: string) => void;
  reqQuantity: number;
  setReqQuantity: (val: number) => void;
  reqTargetDate: string;
  setReqTargetDate: (val: string) => void;
  reqNote: string;
  setReqNote: (val: string) => void;
  requestError: string;
  requestSuccess: string;
  handleRequestSubmit: (e: React.FormEvent) => void;
}

export default function AdvanceRequestModal({
  isOpen,
  onClose,
  isDarkMode,
  reqProductName,
  setReqProductName,
  reqQuantity,
  setReqQuantity,
  reqTargetDate,
  setReqTargetDate,
  reqNote,
  setReqNote,
  requestError,
  requestSuccess,
  handleRequestSubmit,
}: AdvanceRequestModalProps) {
  if (!isOpen) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={commonStyles.modalOverlay}>
      <div className={`${commonStyles.modalContent} max-w-sm`}>
        <div className="flex justify-between items-center border-b border-slate-150  pb-2.5">
          <h3 className="font-bold text-lg font-serif text-slate-900 ">Advance Product Request</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100  text-slate-400  transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600  leading-relaxed">
          Customer Request System. Reserve extra cow milk tomorrow, or demand 10kg premium Atta for next week. These help inventory chakki planners, with no instant stock deduction!
        </p>

        <form onSubmit={handleRequestSubmit} className="space-y-3.5 pt-1 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-slate-700 ">
              Product Name / Description
            </label>
            <input
              id="advance_request_product_name"
              name="advance_request_product_name"
              type="text"
              placeholder="e.g. Fresh Cream Cow Milk / Premium Atta"
              value={reqProductName}
              minLength={2}
              maxLength={160}
              onChange={(e) => setReqProductName(e.target.value)}
              className={commonStyles.input}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-slate-700 ">
                Quantity Pack
              </label>
              <input
                id="advance_request_quantity"
                name="advance_request_quantity"
                type="number"
                min={1}
                step={1}
                value={reqQuantity}
                onChange={(e) => setReqQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className={commonStyles.input}
                required
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-slate-700 ">
                Target Date
              </label>
              <input
                id="advance_request_target_date"
                name="advance_request_target_date"
                type="date"
                value={reqTargetDate}
                min={today}
                onChange={(e) => setReqTargetDate(e.target.value)}
                className={commonStyles.inputMono}
                required
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-700 ">
              Special packaging or item preferences (e.g. customized weight packets, specific sorting)
            </label>
            <textarea
              id="advance_request_note"
              name="advance_request_note"
              placeholder="Any custom instructions..."
              value={reqNote}
              maxLength={500}
              onChange={(e) => setReqNote(e.target.value)}
              className={`${commonStyles.textarea} h-16`}
            />
          </div>

          {requestError && <p className="text-[10px] text-rose-500 font-bold">{requestError}</p>}
          {requestSuccess && <p className="text-[11px] text-emerald-600  font-bold leading-normal">{requestSuccess}</p>}

          <button
            type="submit"
            className={`${commonStyles.buttonPrimary} mt-2`}
          >
            Send Request to SVAYIRO
          </button>
        </form>
      </div>
    </div>
  );
}
