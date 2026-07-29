import React, { useState } from 'react';
import { 
  Compass, Heart, ShoppingBag, FileText, User, Calendar, MapPin, Phone, Mail, Clock, ShieldCheck, HelpCircle, X, Shield, Info
} from 'lucide-react';
import { CustomerTab, ShopProfile, User as UserType } from '../../types';
import TermsContent from './TermsContent';
import StoreStory from './StoreStory';

interface CustomerFooterProps {
  shop: ShopProfile;
  activeUser: UserType | null;
  activeTab: CustomerTab;
  setActiveTab: (tab: CustomerTab) => void;
  isDarkMode: boolean;
  setIsAuthOpen: (open: boolean) => void;
  setIsRequestOpen: (open: boolean) => void;
  onSwitchMode?: () => void;
}

type ModalType = 'about' | 'contact' | 'faq' | 'terms' | null;

export default function CustomerFooter({
  shop,
  activeUser,
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsAuthOpen,
  setIsRequestOpen,
  onSwitchMode
}: CustomerFooterProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const socialLinks = Array.isArray(shop.socialLinks)
    ? shop.socialLinks.filter((link) => link?.label?.trim() && /^https?:\/\//i.test(link?.url || ''))
    : [];

  const renderModalContent = () => {
    switch (activeModal) {
      case 'about':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Info className="h-5 w-5 text-indigo-500" />
              <h3 className="font-serif font-black text-lg text-slate-900 dark:text-white">About {shop.name}</h3>
            </div>
            <StoreStory shop={shop} compact />
          </div>
        );
      case 'contact':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Phone className="h-5 w-5 text-indigo-500" />
              <h3 className="font-serif font-black text-lg text-slate-900 dark:text-white">Contact Our Hub</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Got queries regarding custom weight milling, bulk orders, or active delivery tracking? Get in touch with our operations desk:
            </p>
            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-slate-800">
                <MapPin className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold block text-slate-800 dark:text-slate-200">Registered Address</span>
                  <span className="text-slate-500 dark:text-slate-400">{shop.address || 'SVAYIRO Headquarters, Bengaluru'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-slate-800">
                <Phone className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold block text-slate-800 dark:text-slate-200">Customer Support Line</span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono">{shop.contactNumber || '+91 98765 43210'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-slate-800">
                <Mail className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold block text-slate-800 dark:text-slate-200">Email Desk</span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono">{shop.email || 'support@svayiro.com'}</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center pt-2 italic">
              *Support Desk is active daily from 9:00 AM to 9:00 PM.
            </p>
          </div>
        );
      case 'faq':
        return (
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-950 z-10">
              <HelpCircle className="h-5 w-5 text-indigo-500" />
              <h3 className="font-serif font-black text-lg text-slate-900 dark:text-white">Frequently Asked Questions</h3>
            </div>
            <div className="space-y-4 pt-1">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">Q1. How does the Dynamic UPI QR payment work?</h4>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  During checkout, we automatically generate a secure dynamic UPI payment payload using your exact bill amount. You can scan this QR code with any active UPI application (such as GPay, PhonePe, Paytm, or BHIM) or tap the direct payment link on mobile to settle the transaction immediately with the merchant.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">Q2. Can I schedule or reserve a customized product?</h4>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Yes! Click the "Reserve & Schedule Product" button in the footer or header menu. You can input customized requirements (such as extra fine milling, custom weights, or unique slot delivery dates) and our staff will coordinate the processing dynamically.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">Q3. How can I cancel an active order?</h4>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  You can easily cancel any active order directly from your "Order History" page. Simply expand the relevant order card and tap the "Cancel Order" button. This option is available at any time prior to the order being out for delivery. Once cancelled, inventory is automatically restored.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">Q4. When will my order be delivered?</h4>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  During checkout, you choose your preferred delivery slots (Morning, Afternoon, or Evening) and delivery method (Local Delivery or Self-Pickup). Our delivery executives route shipments dynamically within the selected window.
                </p>
              </div>
            </div>
          </div>
        );
      case 'terms':
        return (
          <TermsContent shop={shop} isDarkMode={isDarkMode} compact />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <footer className={`border-t transition-colors ${
        isDarkMode 
          ? 'border-[#1e293b] bg-[#0b0f19] text-slate-400 shadow-[0_-12px_35px_rgba(0,0,0,0.35)]' 
          : 'border-slate-200 bg-slate-50 text-slate-700 shadow-[0_-12px_35px_rgba(15,23,42,0.08)]'
      } pt-12 pb-16 md:pb-12 px-6 mt-auto`}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Brand & About */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img 
                src={shop.logoUrl} 
                alt="Logo" 
                className="w-8 h-8 rounded-full object-cover border border-indigo-500 shadow-sm" 
              />
              <h3 className="font-serif font-black text-lg text-indigo-600 dark:text-indigo-400">
                {shop.name}
              </h3>
            </div>
            <p className="text-xs leading-relaxed opacity-85">
              {shop.tagline || 'Your trusted local partner for premium kitchen essentials, freshly milled flours, and gourmet staples.'}
            </p>
            <div className="space-y-2 pt-2 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <span>{shop.address || 'SVAYIRO, Bengaluru'}</span>
              </div>
              {shop.contactNumber && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{shop.contactNumber}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span>{shop.email || 'support@svayiro.com'}</span>
              </div>
            </div>
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {socialLinks.map((link, index) => (
                  <a
                    key={`${link.label}_${index}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.label}
                    className="inline-flex max-w-[140px] items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-indigo-700 shadow-sm transition hover:bg-slate-50 hover:text-indigo-900 dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* New Clean Pages Links Section (About, Contact, FAQ, Terms) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Store Information
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => setActiveModal('about')}
                  className="flex items-center gap-2 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left font-medium opacity-85 hover:opacity-100"
                >
                  <Info className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span>About Us</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveModal('contact')}
                  className="flex items-center gap-2 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left font-medium opacity-85 hover:opacity-100"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span>Contact Hub</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveModal('faq')}
                  className="flex items-center gap-2 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left font-medium opacity-85 hover:opacity-100"
                >
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span>Frequently Asked Questions</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveModal('terms')}
                  className="flex items-center gap-2 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left font-medium opacity-85 hover:opacity-100"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span>Terms & Privacy Policy</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Store Timings & Status */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Store Hours & Safety
            </h4>
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Daily Operations</p>
                  <p className="opacity-80">{shop.workingHours || '9:00 AM - 9:00 PM'}</p>
                  <p className="text-[10px] opacity-60">Delivering freshly sorted food products same-day.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Quality Verified</p>
                  <p className="opacity-85">FSSAI Certified store and automated dry packaging procedures.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Support & Configuration */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Storefront Service
            </h4>
            <p className="text-xs leading-relaxed opacity-85">
              Having questions or need to schedule custom deliveries? Reserve items dynamically using our scheduling services.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => setIsRequestOpen(true)}
                className="w-full bg-indigo-700 hover:bg-indigo-600 text-white py-2 rounded-xl text-xs font-bold transition shadow flex items-center justify-center gap-2"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Reserve & Schedule Product</span>
              </button>
              
              {!activeUser && (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="w-full border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Verify Mobile Identity</span>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer Bottom Bar */}
        <div className="max-w-7xl mx-auto mt-6 pt-6 border-t border-slate-100/60 dark:border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono opacity-85">
          <p>© 2026 {shop.name}. All rights reserved.</p>
          <p className="flex items-center gap-1">
            <span>Made with</span>
            <span className="text-rose-500" aria-label="love">❤</span>
            <span>in India</span>
          </p>
        </div>
      </footer>

      {/* Info Modals Backdrop */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
          <div className={`relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-xl transition-all animate-scaleUp ${
            isDarkMode 
              ? 'bg-[#0f172a] border-[#1e293b] text-slate-100' 
              : 'bg-white border-slate-250 text-slate-800'
          }`}>
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute right-4 top-4 z-20 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 overflow-y-auto p-6 pr-8">
              {renderModalContent()}
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              <button 
                onClick={() => setActiveModal(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-full shadow hover:shadow-indigo-500/10 active:scale-95 transition-all"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
