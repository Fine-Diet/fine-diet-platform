/**
 * BarcodeScanner — Camera-based barcode scanner for food UPC lookup.
 *
 * Uses html5-qrcode to access the device camera and decode UPC-A, UPC-E,
 * EAN-13, EAN-8, and Code-128 barcodes. Falls back to manual entry when
 * camera access is denied or unavailable.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  /** Show manual entry as the initial view instead of camera */
  startWithManual?: boolean;
}

type ScannerMode = 'camera' | 'manual';

// ============================================================================
// Component
// ============================================================================

export default function BarcodeScanner({ onScan, onClose, startWithManual }: BarcodeScannerProps) {
  const [mode, setMode] = useState<ScannerMode>(startWithManual ? 'manual' : 'camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);
  const hasScannedRef = useRef(false);

  const cleanup = useCallback(async () => {
    const scanner = html5QrRef.current as {
      isScanning?: boolean;
      stop?: () => Promise<void>;
      clear?: () => void;
    } | null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop?.();
      scanner.clear?.();
    } catch {
      // Scanner may already be stopped
    }
    html5QrRef.current = null;
  }, []);

  useEffect(() => {
    if (mode !== 'camera') return;
    let cancelled = false;

    const startScanner = async () => {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode } = await import('html5-qrcode');

      if (cancelled || !scannerRef.current) return;

      const scannerId = 'barcode-scanner-region';
      let container = document.getElementById(scannerId);
      if (!container && scannerRef.current) {
        container = document.createElement('div');
        container.id = scannerId;
        scannerRef.current.appendChild(container);
      }
      if (!container) return;

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          0, // QR_CODE (as fallback)
          5, // CODE_128
          7, // EAN_8
          8, // EAN_13
          11, // UPC_A
          12, // UPC_E
        ],
        verbose: false,
      });
      html5QrRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 120 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (hasScannedRef.current) return;
            hasScannedRef.current = true;
            onScan(decodedText);
          },
          () => {
            // Scan failure on each frame — expected, ignore
          }
        );
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setCameraError('Camera permission denied. You can enter the barcode manually below.');
        } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
          setCameraError('No camera found on this device. Enter the barcode manually below.');
        } else {
          setCameraError('Could not start camera. Enter the barcode manually below.');
        }
        setMode('manual');
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [mode, onScan, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const handleManualSubmit = () => {
    const trimmed = manualCode.replace(/\D/g, '').trim();
    if (trimmed.length >= 8) {
      onScan(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-brand-800 rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-brand-50">
            {mode === 'camera' ? 'Scan Barcode' : 'Enter Barcode'}
          </h2>
          <button
            onClick={() => { cleanup(); onClose(); }}
            className="p-1 text-brand-50/60 hover:text-brand-50 transition-colors"
            aria-label="Close scanner"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera view */}
        {mode === 'camera' && (
          <div className="relative bg-black">
            <div ref={scannerRef} className="w-full" style={{ minHeight: 300 }} />
            {/* Aiming overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[280px] h-[120px] border-2 border-white/40 rounded-lg" />
            </div>
            <p className="text-center text-brand-50/60 text-xs py-2 bg-black">
              Point your camera at the barcode on the package
            </p>
          </div>
        )}

        {/* Manual entry */}
        <div className="p-5 space-y-3">
          {cameraError && (
            <p className="text-amber-400 text-sm">{cameraError}</p>
          )}

          {mode === 'camera' && (
            <button
              onClick={() => { cleanup(); setMode('manual'); }}
              className="w-full text-center text-sm text-brand-200 hover:text-brand-100 transition-colors py-1"
            >
              Enter barcode manually instead
            </button>
          )}

          {mode === 'manual' && (
            <>
              <p className="text-brand-50/70 text-sm">
                Type or paste the barcode number from the package.
              </p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g., 012345678905"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { cleanup(); onClose(); }}
                  className="flex-1 py-3 rounded-lg border border-white/20 text-brand-50 font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={manualCode.replace(/\D/g, '').length < 8}
                  className="flex-1 py-3 rounded-lg bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Look Up
                </button>
              </div>
              {!cameraError && (
                <button
                  onClick={() => { setCameraError(null); setMode('camera'); }}
                  className="w-full text-center text-sm text-brand-200 hover:text-brand-100 transition-colors py-1"
                >
                  Use camera instead
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
