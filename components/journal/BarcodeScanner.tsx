/**
 * BarcodeScanner — Camera-based barcode scanner for food UPC lookup.
 *
 * Uses html5-qrcode to access the device camera and decode UPC-A, UPC-E,
 * EAN-13, EAN-8, and Code-128 barcodes. Manual entry field is always
 * visible below the camera feed.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState('Starting camera…');
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const html5QrRef = useRef<unknown>(null);
  const hasScannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const frameCountRef = useRef(0);

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

  // Try to enable continuous autofocus after camera starts
  const enableAutofocus = useCallback(async () => {
    const scanner = html5QrRef.current as {
      getRunningTrackSettings?: () => MediaTrackSettings;
      getRunningTrackCapabilities?: () => MediaTrackCapabilities;
      applyVideoConstraints?: (c: MediaTrackConstraints) => Promise<void>;
    } | null;
    if (!scanner) return;

    try {
      const caps = scanner.getRunningTrackCapabilities?.();
      const supportedModes = (caps as Record<string, unknown>)?.focusMode as string[] | undefined;
      if (supportedModes?.includes('continuous')) {
        await scanner.applyVideoConstraints?.({
          focusMode: 'continuous',
        } as MediaTrackConstraints);
      }

      // Check torch support
      if ((caps as Record<string, unknown>)?.torch) {
        setHasTorch(true);
      }
    } catch {
      // Autofocus not supported — silent fail
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const scanner = html5QrRef.current as {
      applyVideoConstraints?: (c: MediaTrackConstraints) => Promise<void>;
    } | null;
    if (!scanner) return;

    const next = !torchOn;
    try {
      await scanner.applyVideoConstraints?.({
        torch: next,
      } as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      // Torch not available
    }
  }, [torchOn]);

  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: Fmt } = await import('html5-qrcode');
        if (cancelled) return;

        const container = document.getElementById('barcode-reader');
        if (!container) {
          setCameraError('Scanner container not found.');
          setCameraActive(false);
          return;
        }

        const scanner = new Html5Qrcode('barcode-reader', {
          formatsToSupport: [
            Fmt.UPC_A,
            Fmt.UPC_E,
            Fmt.EAN_13,
            Fmt.EAN_8,
            Fmt.CODE_128,
          ],
          verbose: false,
        });
        html5QrRef.current = scanner;

        setScanStatus('Requesting camera…');

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (vw: number, vh: number) => ({
              width: Math.floor(vw * 0.88),
              height: Math.floor(vh * 0.35),
            }),
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              ...({ focusMode: { ideal: 'continuous' } }),
            } as MediaTrackConstraints,
          },
          (decodedText) => {
            if (hasScannedRef.current) return;
            hasScannedRef.current = true;
            setScanStatus(`Found: ${decodedText}`);
            if (navigator.vibrate) navigator.vibrate(100);
            onScanRef.current(decodedText);
          },
          () => {
            frameCountRef.current++;
            if (frameCountRef.current % 24 === 0) {
              setScanStatus('Scanning…');
            }
          }
        );

        if (!cancelled) {
          setScanStatus('Scanning — hold steady on barcode');
          enableAutofocus();
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BarcodeScanner] Start failed:', msg);

        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setCameraError('Camera permission denied.');
        } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
          setCameraError('No camera found.');
        } else {
          setCameraError(`Camera error: ${msg}`);
        }
        setCameraActive(false);
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cameraActive, cleanup, enableAutofocus]);

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
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-brand-50">Scan Barcode</h2>
          <div className="flex items-center gap-2">
            {/* Torch toggle */}
            {hasTorch && cameraActive && (
              <button
                onClick={toggleTorch}
                className={`p-1.5 rounded-lg transition-colors ${torchOn ? 'bg-yellow-500/20 text-yellow-300' : 'text-brand-50/60 hover:text-brand-50'}`}
                aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
              </button>
            )}
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
        </div>

        {/* Camera feed */}
        {cameraActive && (
          <div className="bg-black shrink-0">
            <div id="barcode-reader" className="w-full" style={{ minHeight: 280 }} />
            <div className="flex items-center justify-center gap-2 py-1.5 bg-black">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <p className="text-brand-50/60 text-xs">{scanStatus}</p>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="px-5 pt-4">
            <p className="text-amber-400 text-sm">{cameraError}</p>
          </div>
        )}

        {/* Manual entry — always visible */}
        <div className="p-5 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-brand-50/40 text-xs uppercase tracking-wider">or type barcode</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g., 012345678905"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
              className="flex-1 px-4 py-2.5 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/40 text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-200/30"
            />
            <button
              onClick={handleManualSubmit}
              disabled={manualCode.replace(/\D/g, '').length < 8}
              className="px-5 py-2.5 rounded-lg bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
