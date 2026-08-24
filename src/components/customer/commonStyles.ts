/**
 * Common design system classes for SVAYIRO Customer app
 * Ensures full consistency, high-contrast, accessible typography, and flawless device-matching dark mode.
 */
export const commonStyles = {
  // Inputs: perfectly styled to prevent "very dark text in black boxes" or "white text in white boxes"
  input: "w-full border border-slate-300  bg-white  p-2.5 rounded-lg text-xs text-slate-900  placeholder-slate-400  focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",

  inputMono: "w-full border border-slate-300  bg-white  p-2.5 rounded-lg text-xs font-mono text-slate-900  placeholder-slate-400  focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",

  inputUpi: "w-full border border-indigo-200  bg-white  p-2 rounded text-xs tracking-wider text-slate-900  placeholder-indigo-300  focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",

  textarea: "w-full border border-slate-300  bg-white  p-2.5 rounded-lg text-xs text-slate-900  placeholder-slate-400  focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none",

  select: "w-full border border-slate-300  bg-white  p-2.5 rounded-lg font-mono text-xs text-left text-slate-900  focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",

  selectOption: "text-slate-900  bg-white ",

  // Buttons: accessible with clear contrast and elegant sizing
  buttonPrimary: "w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-xs shadow hover:shadow-indigo-600/10 transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-center flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none uppercase tracking-wider",

  buttonPrimaryLarge: "w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white py-4 rounded-2xl text-xs font-semibold shadow-lg text-center flex items-center justify-center gap-2 transition-all duration-150 ease-out hover:shadow-indigo-600/10 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",

  buttonSecondary: "px-3 py-1.5 border border-slate-300  rounded-lg text-xs font-medium text-slate-700  bg-white  hover:bg-slate-50  transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-center",

  buttonSecondarySmall: "px-2.5 py-1 border border-slate-350  rounded text-[11px] font-semibold text-slate-700  bg-white  hover:bg-slate-50  transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-center",

  // Cards
  card: "p-5 rounded-2xl border bg-white  border-slate-200  shadow-sm transition-all duration-150",

  // Modals & Dialog structures
  modalOverlay: "fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4",
  modalContent: "w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 text-left bg-white  border-slate-200  text-slate-900 ",
};
