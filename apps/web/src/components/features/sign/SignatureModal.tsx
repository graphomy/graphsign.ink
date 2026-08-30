'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { PenLine, Type as TypeIcon, Upload as UploadIcon, X, RotateCcw, Trash2 } from 'lucide-react';

export type SignatureType = 'DRAWN' | 'TYPED' | 'UPLOADED';

export interface AdoptedSignature {
  type: SignatureType;
  dataUrl: string;
  fontFamily?: string;
  rawText?: string;
  initialsDataUrl?: string;
}

export interface SignatureModalProps {
  isOpen: boolean;
  fieldType?: 'SIGNATURE' | 'INITIALS';
  defaultSignerName?: string;
  onSave: (sig: AdoptedSignature) => void;
  onClose: () => void;
}

const HANDWRITING_FONTS = [
  { id: 'dancing-script', name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { id: 'caveat', name: 'Caveat', family: "'Caveat', cursive" },
  { id: 'great-vibes', name: 'Great Vibes', family: "'Great Vibes', cursive" },
  { id: 'sacramento', name: 'Sacramento', family: "'Sacramento', cursive" },
];

export function SignatureModal({
  isOpen,
  fieldType = 'SIGNATURE',
  defaultSignerName = '',
  onSave,
  onClose,
}: SignatureModalProps) {
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');

  // Draw State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inkColor, setInkColor] = useState<string>('#16181D');
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Type State
  const [typedName, setTypedName] = useState(defaultSignerName || '');
  const [selectedFont, setSelectedFont] = useState(HANDWRITING_FONTS[0]!);

  // Upload State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removeWhiteBg, setRemoveWhiteBg] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Legal Consent Checkbox
  const [consentAgreed, setConsentAgreed] = useState(true);

  // Load Google Fonts
  useEffect(() => {
    const linkId = 'graphsign-handwriting-fonts';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (isOpen && activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  function getCanvasCoords(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      clientX = touch?.clientX || 0;
      clientY = touch?.clientY || 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save previous snapshot for undo
    setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);

    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setHasDrawn(true);

    ctx.beginPath();
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.5;
    ctx.moveTo(coords.x, coords.y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setHasDrawn(false);
  }

  function undoLastStroke() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prevStroke = strokes[strokes.length - 1];
    if (prevStroke) {
      ctx.putImageData(prevStroke, 0, 0);
      setStrokes((prev) => prev.slice(0, -1));
      if (strokes.length === 1) {
        setHasDrawn(false);
      }
    }
  }

  function generateTypedDataUrl(text: string, font: { name: string; family: string }) {
    if (typeof window === 'undefined') return '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `48px ${font.family}, cursive`;
        ctx.fillStyle = inkColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text || 'Signature', 300, 100);
        return canvas.toDataURL('image/png');
      }
    } catch {}
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><text x="50%" y="50%" font-family="${font.name}" font-size="48" fill="${inkColor}" text-anchor="middle" dominant-baseline="central">${text || 'Signature'}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Image size must be under 2MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (PNG, JPG, or SVG).');
      return;
    }

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function deriveInitials(fullName: string): string {
    if (!fullName) return 'S';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }

  function handleAdoptAndApply() {
    if (!consentAgreed) return;

    let finalDataUrl = '';
    let finalType: SignatureType = 'DRAWN';
    let fontFamily: string | undefined = undefined;
    let rawText: string | undefined = undefined;
    let initialsDataUrl: string | undefined = undefined;

    const initialsText = deriveInitials(typedName || defaultSignerName || 'Signer');

    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      finalDataUrl = canvas.toDataURL('image/png');
      finalType = 'DRAWN';
      initialsDataUrl = generateTypedDataUrl(initialsText, selectedFont);
    } else if (activeTab === 'type') {
      const text = typedName.trim() || defaultSignerName || 'Signature';
      finalDataUrl = generateTypedDataUrl(text, selectedFont);
      finalType = 'TYPED';
      fontFamily = selectedFont.name;
      rawText = text;
      initialsDataUrl = generateTypedDataUrl(initialsText, selectedFont);
    } else if (activeTab === 'upload') {
      if (!uploadedImage) return;
      finalDataUrl = uploadedImage;
      finalType = 'UPLOADED';
      initialsDataUrl = generateTypedDataUrl(initialsText, selectedFont);
    }

    if (finalDataUrl) {
      onSave({
        type: finalType,
        dataUrl: finalDataUrl,
        fontFamily,
        rawText,
        initialsDataUrl,
      });
      onClose();
    }
  }

  const currentInitials = deriveInitials(typedName || defaultSignerName || 'Signer');

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      data-testid="signature-modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-[560px] w-full p-6 sm:p-7 shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)] space-y-5 border border-ink-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">
              {fieldType === 'INITIALS' ? 'Adopt Initials' : 'Adopt Signature'}
            </span>
            <h3 className="text-lg font-bold text-ink-900">
              {fieldType === 'INITIALS'
                ? 'Create your electronic initials'
                : 'Create your electronic signature'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 p-1.5 rounded-md hover:bg-ink-100 transition-colors"
            data-testid="close-signature-modal"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-ink-200 text-xs font-semibold gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`py-2.5 px-4 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'draw'
                ? 'border-brand-600 text-ink-900 font-bold'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
            data-testid="tab-draw-signature"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Draw</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('type')}
            className={`py-2.5 px-4 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'type'
                ? 'border-brand-600 text-ink-900 font-bold'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
            data-testid="tab-type-signature"
          >
            <TypeIcon className="w-3.5 h-3.5" />
            <span>Type</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-2.5 px-4 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-brand-600 text-ink-900 font-bold'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
            data-testid="tab-upload-signature"
          >
            <UploadIcon className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>

        {/* DRAW TAB */}
        {activeTab === 'draw' && (
          <div className="space-y-2">
            <div className="relative border border-ink-200 rounded-md overflow-hidden bg-white shadow-inner">
              <canvas
                ref={canvasRef}
                width={480}
                height={160}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-40 bg-white cursor-crosshair touch-none"
                data-testid="signature-canvas"
              />
              {/* Baseline indicator */}
              <div className="absolute bottom-8 inset-x-6 border-b border-dashed border-ink-200 pointer-events-none" />

              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-ink-300 text-xs font-medium">
                  Draw your {fieldType.toLowerCase()} here with mouse, touch, or stylus
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={undoLastStroke}
                  disabled={strokes.length === 0}
                  data-testid="undo-signature-stroke"
                >
                  Undo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={clearCanvas}
                  data-testid="clear-signature-canvas"
                >
                  Clear
                </Button>
              </div>
              <span className="text-[11px] text-ink-400">Pointer &amp; touch enabled</span>
            </div>
          </div>
        )}

        {/* TYPE TAB */}
        {activeTab === 'type' && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="typed-signature-input"
                className="block text-xs font-semibold text-ink-700 mb-1"
              >
                Signer Legal Name
              </label>
              <input
                id="typed-signature-input"
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full legal name..."
                className="w-full rounded-md border border-ink-200 px-3 py-2 text-sm bg-white text-ink-900 focus:border-ink-900 focus:outline-none"
                data-testid="typed-signature-input"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-ink-500">
                Select Signature Style:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {HANDWRITING_FONTS.map((font) => {
                  const isSelected = selectedFont.id === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setSelectedFont(font)}
                      className={`h-[88px] p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50/40 ring-1 ring-brand-600'
                          : 'border-ink-200 bg-white hover:border-ink-300'
                      }`}
                      data-testid={`font-choice-${font.id}`}
                    >
                      <span
                        style={{ fontFamily: font.family }}
                        className="text-xl sm:text-2xl truncate block text-ink-900 my-1"
                      >
                        {typedName || defaultSignerName || 'Your Signature'}
                      </span>
                      <span className="text-[10px] text-ink-400 font-sans">{font.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD TAB */}
        {activeTab === 'upload' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
              data-testid="signature-file-input"
            />

            {!uploadedImage ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-ink-200 hover:border-ink-400 rounded-lg p-8 text-center cursor-pointer bg-ink-50 transition-colors space-y-2"
                data-testid="signature-dropzone"
              >
                <div className="w-10 h-10 rounded-full bg-white text-ink-600 flex items-center justify-center mx-auto shadow-xs">
                  <UploadIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-ink-800">
                    Click or drag signature image here
                  </p>
                  <p className="text-[11px] text-ink-500 mt-0.5">
                    PNG, JPG, or SVG under 2MB (transparent or white background)
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border border-ink-200 rounded-lg p-4 bg-white flex items-center justify-center min-h-[140px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedImage}
                    alt="Uploaded Signature Preview"
                    className="max-h-28 object-contain"
                    data-testid="uploaded-sig-preview"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1.5 text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeWhiteBg}
                      onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                      className="rounded border-ink-300 text-brand-600"
                    />
                    <span className="text-[11px]">Remove white background</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="text-brand-700 font-semibold hover:underline text-xs"
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            )}

            {uploadError && <p className="text-xs text-brand-700 font-medium">{uploadError}</p>}
          </div>
        )}

        {/* Preview Strip showing Signature and Initials */}
        <div className="bg-ink-50 border border-ink-200 rounded-md p-3 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block mb-1">
              Full Signature
            </span>
            <div className="h-10 flex items-center bg-white border border-ink-200 rounded px-2.5 overflow-hidden">
              {activeTab === 'type' ? (
                <span style={{ fontFamily: selectedFont.family }} className="text-xl text-ink-900 truncate">
                  {typedName || defaultSignerName || 'Signature'}
                </span>
              ) : activeTab === 'upload' && uploadedImage ? (
                <img src={uploadedImage} alt="Signature preview" className="h-7 object-contain" />
              ) : (
                <span className="text-xs text-ink-400 italic">Drawn on canvas</span>
              )}
            </div>
          </div>

          <div className="w-24 shrink-0">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block mb-1">
              Initials
            </span>
            <div className="h-10 flex items-center justify-center bg-white border border-ink-200 rounded px-2 overflow-hidden">
              <span style={{ fontFamily: selectedFont.family }} className="text-lg text-ink-900 font-bold">
                {currentInitials}
              </span>
            </div>
          </div>
        </div>

        {/* Legal Consent Line with 20px Checkbox */}
        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="signature-adoption-consent"
            type="checkbox"
            checked={consentAgreed}
            onChange={(e) => setConsentAgreed(e.target.checked)}
            className="h-5 w-5 rounded border border-ink-300 text-brand-600 focus:ring-2 focus:ring-ink-950 mt-0.5 cursor-pointer"
          />
          <label htmlFor="signature-adoption-consent" className="text-[13px] text-ink-700 select-none cursor-pointer leading-tight">
            I agree that this signature and initials are the electronic representation of my signature
            for all purposes when used on documents, including legally binding contracts.
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-ink-100">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            data-testid="cancel-signature-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={
              !consentAgreed ||
              (activeTab === 'draw' && !hasDrawn) ||
              (activeTab === 'type' && !typedName.trim() && !defaultSignerName) ||
              (activeTab === 'upload' && !uploadedImage)
            }
            onClick={handleAdoptAndApply}
            data-testid="adopt-signature-button"
          >
            Adopt and sign
          </Button>
        </div>
      </div>
    </div>
  );
}
