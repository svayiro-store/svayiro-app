import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Check, ArrowRight, ExternalLink, Copy, AlertCircle, ShoppingBag } from 'lucide-react';
import { commonStyles } from './commonStyles';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName?: string;
  shopUpiId?: string;
  isDarkMode: boolean;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  currentCartTotal?: number;
  handlePlaceUpiOrderDirectly?: (utr: string) => Promise<void>;
}

interface ParsedUpi {
  pa: string; // UPI ID
  pn: string; // Merchant Name
  am: string; // Amount
  tr: string; // Reference ID
  tn: string; // Note
}

export default function QrScannerModal({
  isOpen,
  onClose,
  shopName = 'SVAYIRO',
  shopUpiId = ' ',
  isDarkMode,
  showToast,
  currentCartTotal,
  handlePlaceUpiOrderDirectly
}: QrScannerModalProps) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [parsedUpi, setParsedUpi] = useState<ParsedUpi | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [utrInput, setUtrInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerificationSuccess, setIsVerificationSuccess] = useState(false);

  const qrCodeInstance = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-camera-stream-reader';

  const parseUpiUrl = (urlStr: string): ParsedUpi | null => {
    if (!urlStr.toLowerCase().startsWith('upi://pay')) {
      return null;
    }
    try {
      // Replace upi:// with https:// to parse easily with URLSearchParams
      const httpUrl = urlStr.replace(/^upi:\/\//i, 'https://');
      const urlObj = new URL(httpUrl);
      return {
        pa: urlObj.searchParams.get('pa') || '',
        pn: urlObj.searchParams.get('pn') || '',
        am: urlObj.searchParams.get('am') || '',
        tr: urlObj.searchParams.get('tr') || '',
        tn: urlObj.searchParams.get('tn') || '',
      };
    } catch (e) {
      console.error('Error parsing UPI deep link', e);
      return null;
    }
  };

  const startScanner = async () => {
    setIsCameraLoading(true);
    setCameraError(null);
    try {
      // Ensure any previous scanner instance is cleaned up
      if (qrCodeInstance.current) {
        try {
          if (qrCodeInstance.current.isScanning) {
            await qrCodeInstance.current.stop();
          }
        } catch (e) {
          console.warn('Error stopping previous QR scanner instance', e);
        }
      }

      const html5QrCode = new Html5Qrcode(containerId);
      qrCodeInstance.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.9;
            return { width: size, height: size };
          }
        },
        async (decodedText) => {
          // Success Callback
          setScanResult(decodedText);
          const parsed = parseUpiUrl(decodedText);
          if (parsed) {
            setParsedUpi(parsed);
            showToast('🎯 UPI Payment QR Code scanned successfully!', 'success');
          } else {
            showToast('🔍 Scanned custom QR Code code.', 'info');
          }

          // Automatically stop scanning once a code is found
          try {
            await html5QrCode.stop();
          } catch (e) {
            console.error('Error stopping QR scanner', e);
          }
        },
        () => {
          // Failure callback is ignored to avoid spamming UI logs
        }
      );
      setIsCameraLoading(false);
    } catch (err: any) {
      console.error('QR scanner initialization failed', err);
      setCameraError(err.message || 'Could not access device camera. Please verify camera permissions are granted.');
      setIsCameraLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      setParsedUpi(null);
      setUtrInput('');
      setIsVerifying(false);
      setIsVerificationSuccess(false);

      // Small timeout to allow the modal element container to render in DOM
      const timer = setTimeout(() => {
        startScanner();
      }, 300);

      return () => {
        clearTimeout(timer);
        if (qrCodeInstance.current) {
          const scanner = qrCodeInstance.current;
          if (scanner.isScanning) {
            scanner.stop().catch(e => console.error('Cleanup stop failure', e));
          }
        }
      };
    }
  }, [isOpen]);

  const handleCopyUtr = () => {
    if (utrInput) {
      navigator.clipboard.writeText(utrInput);
      showToast('📋 UTR reference ID copied to clipboard!', 'success');
    }
  };

  const handleCopyRawResult = () => {
    if (scanResult) {
      navigator.clipboard.writeText(scanResult);
      showToast('📋 Scanned content copied to clipboard!', 'success');
    }
  };

  const handleManualVerifyAndSubmit = async () => {
    if (!utrInput.trim()) {
      showToast('Please enter the 12-digit UPI reference / UTR number.', 'error');
      return;
    }
    if (utrInput.trim().length < 12) {
      showToast('UTR transaction references must be at least 12 digits.', 'error');
      return;
    }

    setIsVerifying(true);
    try {
      if (handlePlaceUpiOrderDirectly) {
        // Place the current cart order directly with this UTR reference!
        await handlePlaceUpiOrderDirectly(utrInput.trim());
        setIsVerificationSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        // Outside checkout, this only captures the reference for manual owner verification.
        await new Promise(resolve => setTimeout(resolve, 1200));
        setIsVerificationSuccess(true);
        showToast('UTR reference captured. Submit it on the order screen for owner verification.', 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'Verification failed. Please double check UTR.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRestartScanner = () => {
    setScanResult(null);
    setParsedUpi(null);
    setUtrInput('');
    setIsVerifying(false);
    setIsVerificationSuccess(false);
    setTimeout(() => {
      startScanner();
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <div className={`${commonStyles.modalOverlay} overflow-y-auto z-[999]`}>
      <div className={`${commonStyles.modalContent} max-w-lg p-5 flex flex-col space-y-4 shadow-2xl border border-indigo-100  transition-all`}>

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-150 ">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-50  text-indigo-600  flex items-center justify-center">
              <Camera className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-serif font-semibold text-sm tracking-normal text-slate-900 ">
                SVAYIRO Scan & Pay
              </h3>
              <p className="text-[10px] font-medium text-slate-500  leading-none">
                Scan approved COD collection QR codes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600  hover:bg-slate-100  transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Scan Stream Container */}
        {!scanResult && (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="w-full relative bg-black rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[280px]">
              {isCameraLoading && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center space-y-3 z-10">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                    Activating Secure Camera...
                  </span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 bg-slate-950 p-6 flex flex-col items-center justify-center text-center space-y-3 z-10">
                  <AlertCircle className="w-10 h-10 text-rose-500" />
                  <h4 className="text-white text-xs font-serif font-bold">Camera Access Blocked</h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed max-w-xs">
                    {cameraError}
                  </p>
                  <button
                    type="button"
                    onClick={startScanner}
                    className="bg-indigo-600 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-lg hover:bg-indigo-500 uppercase tracking-wider transition-all"
                  >
                    Retry Camera
                  </button>
                </div>
              )}

              {/* The Live Video Element Target Container */}
              <div
                id={containerId}
                className="w-full h-full text-white font-mono text-[10px] [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
              ></div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-slate-600  font-medium text-[11px] max-w-xs">
                Align the billing QR code shown on the desktop screen or paper invoice within the camera frame.
              </p>
              <p className="text-slate-400  text-[10px] italic">
                (It automatically decodes amounts, UPI handles, and reference details)
              </p>
            </div>
          </div>
        )}

        {/* Scan Success / Results View */}
        {scanResult && (
          <div className="space-y-4 py-2 animate-fadeIn">
            {parsedUpi ? (
              <div className="space-y-4">
                {/* Result Announcement Badge */}
                <div className="bg-emerald-50  text-emerald-700  p-3 rounded-2xl border border-emerald-100  flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    ✓
                  </div>
                  <div>
                    <h4 className="font-serif font-semibold text-xs">UPI Payment QR Detected!</h4>
                    <p className="text-[10px] opacity-95">Successfully parsed payment deep-link parameters.</p>
                  </div>
                </div>

                {/* Bill Details Summary Card */}
                <div className="bg-slate-50  p-4 rounded-2xl border border-slate-150  space-y-3">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ">Bill Parameters</span>

                  <div className="grid grid-cols-2 gap-y-2.5 font-mono text-[11px]">
                    <div className="text-slate-400 ">Merchant Name:</div>
                    <div className="font-bold text-slate-800  text-right">{parsedUpi.pn || shopName}</div>

                    <div className="text-slate-400 ">UPI ID / Handle:</div>
                    <div className="font-bold text-slate-800  text-right select-all">{parsedUpi.pa || shopUpiId}</div>

                    <div className="text-slate-400 ">Amount Due:</div>
                    <div className="font-semibold text-indigo-600  text-right text-xs">₹{parsedUpi.am || currentCartTotal || '0'}</div>

                    {parsedUpi.tr && (
                      <>
                        <div className="text-slate-400 ">Reference (TR):</div>
                        <div className="font-bold text-slate-800  text-right truncate max-w-[150px]">{parsedUpi.tr}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-1.5 bg-indigo-500/5  p-3 rounded-xl border border-indigo-500/10 ">
                  <h5 className="font-serif font-bold text-[11px] text-indigo-600  flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Secure Mobile Checkout Flow
                  </h5>
                  <p className="text-[10px] text-slate-500  leading-normal font-sans">
                    1. Click the <strong className="text-slate-700  font-bold">Launch UPI App</strong> button below to open your banking app and pay.
                    <br />
                    2. After paying, type your 12-digit UTR transaction reference ID below to finalize your order.
                  </p>
                </div>

                {/* Actions Form */}
                <div className="space-y-3.5 pt-1">
                  {/* Redirect Protocol Button */}
                  <a
                    href={scanResult}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2 uppercase tracking-wider transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Launch Pay UPI App</span>
                  </a>

                  {/* Manual UTR Insertion */}
                  <div className="border-t border-dashed border-slate-200  pt-3 space-y-2">
                    <label className="block text-slate-700  font-bold text-[10px] uppercase tracking-wider">
                      Verify With 12-Digit UPI UTR Ref <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="qr_scanner_upi_reference"
                        name="qr_scanner_upi_reference"
                        type="text"
                        placeholder="Enter 12-digit UPI Transaction Ref ID"
                        value={utrInput}
                        onChange={(e) => setUtrInput(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                        className="flex-1 bg-white  border border-slate-300  p-2.5 rounded-xl font-mono text-xs text-slate-850  font-bold focus:border-indigo-500 focus:outline-none transition-all tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:font-normal"
                      />
                      {utrInput && (
                        <button
                          type="button"
                          onClick={handleCopyUtr}
                          className="bg-slate-100  text-slate-500 hover:text-slate-700  p-2.5 rounded-xl transition-all"
                          title="Copy reference"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Direct submission or manual reference capture */}
                  {isVerificationSuccess ? (
                    <div className="bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold text-xs text-center uppercase tracking-wider animate-scaleUp">
                      Payment reference registered for owner verification
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isVerifying || !utrInput.trim()}
                      onClick={handleManualVerifyAndSubmit}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-emerald-600/15 uppercase tracking-wider transition-all"
                    >
                      {isVerifying ? 'Submitting Reference ID...' : 'Submit Reference ID'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // Handle general custom plain text or URL QR codes
              <div className="space-y-4">
                <div className="bg-slate-50  p-4 rounded-2xl border border-slate-200  space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ">Scanned Content</span>
                  <p className="font-mono text-xs text-slate-800  break-all select-all font-bold p-2.5 bg-white  rounded-xl border border-slate-150 ">
                    {scanResult}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyRawResult}
                    className="flex-1 bg-slate-100  hover:bg-slate-200 text-slate-700  font-bold text-[11px] py-2.5 rounded-xl transition-all"
                  >
                    Copy to Clipboard
                  </button>
                  {scanResult.startsWith('http') && (
                    <a
                      href={scanResult}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] py-2.5 rounded-xl text-center flex items-center justify-center gap-1 transition-all"
                    >
                      Open Link <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100  pt-3">
              <button
                type="button"
                onClick={handleRestartScanner}
                className="w-full text-indigo-600 hover:text-indigo-700   text-xs font-bold py-1.5 transition-all text-center uppercase tracking-wider"
              >
                Scan Another QR Code
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
