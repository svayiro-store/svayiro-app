import React from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { commonStyles } from './commonStyles';
import { ShopProfile } from '../../types';
import TermsContent from './TermsContent';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  shop: ShopProfile;
  authName: string;
  setAuthName: (val: string) => void;
  authEmail: string;
  setAuthEmail: (val: string) => void;
  authPhone: string;
  setAuthPhone: (val: string) => void;
  authPassword: string;
  setAuthPassword: (val: string) => void;
  authDob: string;
  setAuthDob: (val: string) => void;
  authTermsAccepted: boolean;
  setAuthTermsAccepted: (val: boolean) => void;
  authMode: 'login' | 'register' | 'forgot';
  setAuthMode: (mode: 'login' | 'register' | 'forgot') => void;
  isOtpSent: boolean;
  otpSentMessage: string;
  authOtp: string;
  setAuthOtp: (val: string) => void;
  authError: string;
  handleRequestOtp: () => void;
  handleRequestRegistrationOtp: () => void;
  handleRegisterCustomer: () => void;
  handleCustomerLogin: () => void;
  handleResetPassword: () => void;
  otpSecondsLeft: number;
  canResendOtp: boolean;
}

export default function AuthModal({
  isOpen,
  onClose,
  isDarkMode,
  shop,
  authName,
  setAuthName,
  authEmail,
  setAuthEmail,
  authPhone,
  setAuthPhone,
  authPassword,
  setAuthPassword,
  authDob,
  setAuthDob,
  authTermsAccepted,
  setAuthTermsAccepted,
  authMode,
  setAuthMode,
  isOtpSent,
  otpSentMessage,
  authOtp,
  setAuthOtp,
  authError,
  handleRequestOtp,
  handleRequestRegistrationOtp,
  handleRegisterCustomer,
  handleCustomerLogin,
  handleResetPassword,
  otpSecondsLeft,
  canResendOtp,
}: AuthModalProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  if (!isOpen) return null;

  const otpMinutes = Math.floor(otpSecondsLeft / 60);
  const otpSeconds = String(otpSecondsLeft % 60).padStart(2, '0');
  const modalWidthClass = authMode === 'register' ? 'max-w-[520px]' : 'max-w-[420px]';

  return (
    <div className={commonStyles.modalOverlay}>
      <div className={`flex max-h-[88vh] w-full ${modalWidthClass} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:rounded-3xl`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-150 px-4 py-3 dark:border-slate-800 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-bold text-base font-serif tracking-normal text-slate-900 dark:text-slate-100 sm:text-lg">
            {authMode === 'register' ? 'Create Customer Account' : authMode === 'forgot' ? 'Reset Password' : 'Customer Login'}
            </h3>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {authMode === 'register'
                ? 'Register with a valid Gmail OTP. Phone, email, and birthday are locked after registration.'
                : authMode === 'forgot'
                  ? 'Enter your registered email address. We will send the reset OTP there.'
                  : 'Login with your registered email address and password.'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="shrink-0 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs sm:px-5">
          <div className="sticky top-0 z-10 mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
            <button type="button" onClick={() => setAuthMode('login')} className={`rounded-lg py-2 font-semibold ${authMode === 'login' ? 'bg-indigo-700 text-white' : 'text-slate-500'}`}>Login</button>
            <button type="button" onClick={() => setAuthMode('register')} className={`rounded-lg py-2 font-semibold ${authMode === 'register' ? 'bg-indigo-700 text-white' : 'text-slate-500'}`}>Register</button>
          </div>

          <div className={`grid grid-cols-1 gap-3 ${authMode === 'register' ? 'sm:grid-cols-2' : ''}`}>
          {authMode === 'register' && <div>
            <label className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">Customer Name</label>
            <input 
              id="customer_register_name"
              name="customer_register_name"
              type="text" 
              placeholder="e.g. John Doe" 
              value={authName} 
              autoComplete="name"
              maxLength={80}
              pattern="[A-Za-z][A-Za-z .'\-]{1,79}"
              onChange={(e) => setAuthName(e.target.value)}
              className={commonStyles.input} 
            />
          </div>}

          {(authMode === 'register' || authMode === 'login' || authMode === 'forgot') && <div className={authMode === 'register' ? '' : 'sm:col-span-2'}>
            <label className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">Gmail Address</label>
            <input
              id={`customer_${authMode}_gmail`}
              name={`customer_${authMode}_gmail`}
              type="email"
              placeholder={authMode === 'forgot' ? 'registered@gmail.com' : 'customer@gmail.com'}
              value={authEmail}
              autoComplete="email"
              maxLength={120}
              onChange={(e) => setAuthEmail(e.target.value)}
              className={commonStyles.input}
            />
          </div>}

          {authMode === 'register' && <div>
            <label className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">10-digit Indian Phone Number</label>
            <div className="flex gap-2">
              <span className="border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-2.5 rounded-lg font-mono text-center flex items-center justify-center text-slate-800 dark:text-slate-200">
                +91
              </span>
              <input 
                id="customer_register_phone"
                name="customer_register_phone"
                type="tel" 
                placeholder="9876543210" 
                value={authPhone} 
                maxLength={16}
                inputMode="numeric"
                autoComplete="tel-national"
                pattern="[6-9][0-9]{9}"
                onChange={(e) => setAuthPhone(e.target.value.replace(/\D/g, ''))}
                className={commonStyles.inputMono} 
              />
            </div>
          </div>}

          {authMode === 'register' && <div>
            <label className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">Date of Birth</label>
            <input
              id="customer_register_dob"
              name="customer_register_dob"
              type="text"
              placeholder="dd-mm-yyyy"
              value={authDob}
              inputMode="numeric"
              maxLength={10}
              pattern="\d{2}-\d{2}-\d{4}"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                const formatted = digits.length <= 2
                  ? digits
                  : digits.length <= 4
                    ? `${digits.slice(0, 2)}-${digits.slice(2)}`
                    : `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
                setAuthDob(formatted);
              }}
              className={commonStyles.input}
            />
            <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Enter this carefully. Birthday cannot be changed later, and this is how we unlock your special birthday gift/coupon on the exact day.
            </p>
          </div>}

          <div className={authMode === 'register' ? 'sm:col-span-2' : 'sm:col-span-2'}>
            <label className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">
              {authMode === 'forgot' ? 'New Password' : 'Password'}
            </label>
            <div className="relative min-h-[46px]">
              <input
                id={`customer_${authMode}_password`}
                name={`customer_${authMode}_password`}
                type={showPassword ? 'text' : 'password'}
                placeholder={authMode === 'login' ? 'Enter password' : 'Minimum 8 chars, letters and numbers'}
                value={authPassword}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                maxLength={128}
                onChange={(e) => setAuthPassword(e.target.value)}
                className={`${commonStyles.input} h-11 min-h-11 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {authMode === 'register' && (
            <div className="space-y-2 sm:col-span-2">
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <summary className="cursor-pointer text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Read Terms & Conditions before registering
                </summary>
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg bg-white p-3 dark:bg-slate-900">
                  <TermsContent shop={shop} isDarkMode={isDarkMode} compact />
                </div>
              </details>
              <label className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] font-bold leading-relaxed text-slate-700 dark:border-indigo-900/60 dark:bg-indigo-950/20 dark:text-slate-300">
                <input
                  id="customer_terms_accepted"
                  name="customer_terms_accepted"
                  type="checkbox"
                  checked={authTermsAccepted}
                  onChange={(e) => setAuthTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
                />
                <span>
                  I have read and agree to SVAYIRO Terms & Conditions and Privacy Policy. I understand orders, payments, delivery, refunds, reviews, rewards, and account deletion follow those terms.
                </span>
              </label>
            </div>
          )}

          {(authMode === 'forgot' || authMode === 'register') && isOtpSent && (
            <div className="space-y-1.5 animate-fadeIn sm:col-span-2">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-semibold leading-normal">
                {otpSentMessage}
              </span>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                <span>OTP expires in {otpMinutes}:{otpSeconds}</span>
                <button
                  type="button"
                  onClick={authMode === 'register' ? handleRequestRegistrationOtp : handleRequestOtp}
                  disabled={!canResendOtp}
                  className="font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Resend OTP
                </button>
              </div>
              <label className="block mb-1 font-bold text-slate-700 dark:text-slate-300">
                Verification code (OTP)
              </label>
              <input 
                id={`customer_${authMode}_otp`}
                name={`customer_${authMode}_otp`}
                type="text" 
                placeholder="Enter 6-digit OTP" 
                value={authOtp} 
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                onChange={(e) => setAuthOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-900 p-2.5 rounded-lg font-semibold tracking-widest text-xl text-center text-indigo-600 dark:text-indigo-400 placeholder-indigo-300/60 dark:placeholder-indigo-900/40 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>
          )}

          {authError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300 sm:col-span-2">
              {authError}
            </div>
          )}
          </div>
        </div>

          <div className="shrink-0 border-t border-slate-150 px-4 py-3 dark:border-slate-800 sm:px-5">
            {authMode === 'login' ? (
              <div className="space-y-2">
                <button onClick={handleCustomerLogin} className={commonStyles.buttonPrimary}>
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('forgot')}
                  className="w-full text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Forgot password? Reset using email OTP
                </button>
              </div>
            ) : authMode === 'forgot' ? (
              isOtpSent ? (
                <button onClick={handleResetPassword} className={commonStyles.buttonPrimary}>
                  Reset Password
                </button>
              ) : (
                <button onClick={handleRequestOtp} className={commonStyles.buttonPrimary}>
                  Send OTP to Registered Email
                </button>
              )
            ) : (
              isOtpSent ? (
                <button 
                  onClick={handleRegisterCustomer}
                  className={commonStyles.buttonPrimary}
                >
                  Create Account
                </button>
              ) : (
                <button
                  onClick={handleRequestRegistrationOtp}
                  className={commonStyles.buttonPrimary}
                >
                  Send Gmail Verification OTP
                </button>
              )
            )}
          </div>
      </div>
    </div>
  );
}
