'use client';

import React, { useState, useRef, useEffect } from 'react';

export type SignatureType = 'DRAWN' | 'TYPED' | 'UPLOADED';

export interface AdoptedSignature {
  type: SignatureType;
  dataUrl: string;
  fontFamily?: string;
  rawText?: string;
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
  { id: 'satisfy', name: 'Satisfy', family: "'Satisfy', cursive" },
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
  const [inkColor, setInkColor] = useState<string>('#1E3A8A'); // Navy blue default
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

  // Load Google Fonts dynamically for typed handwriting signatures
  useEffect(() => {
    const linkId = 'graphsign-handwriting-fonts';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&family=Sacramento&family=Satisfy&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Reset or initialize canvas when Draw tab is opened
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

  // --- DRAW HANDLERS (INK-100 & INK-106) ---
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

    // Save current canvas state for undo
    setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);

    setIsDrawing(true);
    setHasDrawn(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 3;
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
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

    const previousState = strokes[strokes.length - 1];
    if (previousState) {
      ctx.putImageData(previousState, 0, 0);
      setStrokes((prev) => prev.slice(0, -1));
      if (strokes.length === 1) {
        setHasDrawn(false);
      }
    }
  }

  // --- TYPE HANDLERS (INK-101) ---
  function generateTypedDataUrl(text: string, font: (typeof HANDWRITING_FONTS)[0]): string {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><text x="50%" y="50%" font-family="${font.name}" font-size="48" fill="${inkColor}" text-anchor="middle" dominant-baseline="central">${text || 'Signature'}</text></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `64px ${font.family}`;
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'Signature', canvas.width / 2, canvas.height / 2);

    try {
      return canvas.toDataURL('image/png');
    } catch {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><text x="50%" y="50%" font-family="${font.name}" font-size="48" fill="${inkColor}" text-anchor="middle" dominant-baseline="central">${text || 'Signature'}</text></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  }

  // --- UPLOAD HANDLERS (INK-102) ---
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  }

  function processImageFile(file: File) {
    setUploadError(null);

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (PNG, JPG, or SVG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size must be 5MB or less.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Fit image inside canvas while preserving aspect ratio
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;

        ctx.drawImage(img, x, y, w, h);

        if (removeWhiteBg) {
          // Process white pixels to transparent
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]!;
            const g = data[i + 1]!;
            const b = data[i + 2]!;
            // Brightness threshold for paper background
            if (r > 215 && g > 215 && b > 215) {
              data[i + 3] = 0; // Transparent
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        setUploadedImage(canvas.toDataURL('image/png'));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // --- SUBMISSION HANDLER ---
  function handleAdoptAndApply() {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      const dataUrl = canvas.toDataURL('image/png');
      onSave({
        type: 'DRAWN',
        dataUrl,
      });
    } else if (activeTab === 'type') {
      const textToUse = typedName.trim() || defaultSignerName || 'Signed';
      const dataUrl = generateTypedDataUrl(textToUse, selectedFont);
      onSave({
        type: 'TYPED',
        dataUrl,
        fontFamily: selectedFont.name,
        rawText: textToUse,
      });
    } else if (activeTab === 'upload') {
      if (!uploadedImage) return;
      onSave({
        type: 'UPLOADED',
        dataUrl: uploadedImage,
      });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      data-testid="signature-modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              {fieldType === 'INITIALS' ? 'Adopt Initials' : 'Adopt Signature'}
            </span>
            <h3 className="text-base font-bold text-neutral-900">
              {fieldType === 'INITIALS'
                ? 'Create Your Electronic Initials'
                : 'Create Your Electronic Signature'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
            data-testid="close-signature-modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 text-xs font-bold gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`py-2 px-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'draw'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
            data-testid="tab-draw-signature"
          >
            <span>✏️</span> Draw
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('type')}
            className={`py-2 px-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'type'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
            data-testid="tab-type-signature"
          >
            <span>⌨️</span> Type
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-2 px-3.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
            data-testid="tab-upload-signature"
          >
            <span>📁</span> Upload
          </button>
        </div>

        {/* Ink Color Selector */}
        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-neutral-500 text-[11px] font-semibold">Ink Color:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInkColor('#1E3A8A')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                inkColor === '#1E3A8A'
                  ? 'border-blue-700 bg-blue-50 text-blue-900 ring-1 ring-blue-600'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A]" />
              Classic Blue
            </button>
            <button
              type="button"
              onClick={() => setInkColor('#111827')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                inkColor === '#111827'
                  ? 'border-neutral-900 bg-neutral-100 text-neutral-900 ring-1 ring-neutral-900'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#111827]" />
              Rich Black
            </button>
          </div>
        </div>

        {/* DRAW TAB CONTENT (INK-100, INK-106) */}
        {activeTab === 'draw' && (
          <div className="space-y-2">
            <div className="relative border border-neutral-300 rounded-xl overflow-hidden bg-neutral-50 shadow-inner">
              <canvas
                ref={canvasRef}
                width={500}
                height={180}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-44 bg-white cursor-crosshair touch-none"
                data-testid="signature-canvas"
              />
              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-neutral-300 text-xs font-semibold">
                  Draw your {fieldType.toLowerCase()} here with mouse or finger
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={undoLastStroke}
                  disabled={strokes.length === 0}
                  className="text-neutral-600 hover:text-neutral-900 disabled:opacity-40 font-semibold"
                  data-testid="undo-signature-stroke"
                >
                  ↩ Undo
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-red-600 hover:text-red-700 font-semibold"
                  data-testid="clear-signature-canvas"
                >
                  Clear
                </button>
              </div>
              <span className="text-[10px] text-neutral-400">Touch &amp; stylus supported</span>
            </div>
          </div>
        )}

        {/* TYPE TAB CONTENT (INK-101) */}
        {activeTab === 'type' && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="typed-signature-input"
                className="block text-xs font-semibold text-neutral-700 mb-1"
              >
                Signer Legal Name
              </label>
              <input
                id="typed-signature-input"
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your name..."
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                data-testid="typed-signature-input"
              />
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                Choose Handwriting Style:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HANDWRITING_FONTS.map((font) => {
                  const isSelected = selectedFont.id === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setSelectedFont(font)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-neutral-200 bg-neutral-50/30 hover:border-neutral-300'
                      }`}
                      data-testid={`font-choice-${font.id}`}
                    >
                      <span
                        style={{ fontFamily: font.family, color: inkColor }}
                        className="text-xl sm:text-2xl truncate block leading-relaxed my-1"
                      >
                        {typedName || defaultSignerName || 'Your Signature'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans">{font.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD TAB CONTENT (INK-102) */}
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
                className="border-2 border-dashed border-neutral-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer bg-neutral-50/50 transition-colors space-y-2"
                data-testid="signature-dropzone"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl mx-auto">
                  📤
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-800">
                    Click or drag signature image here
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    PNG, JPG, or SVG up to 5MB (transparent or white background)
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border border-neutral-300 rounded-xl p-4 bg-neutral-50/70 flex items-center justify-center min-h-[140px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedImage}
                    alt="Uploaded Signature Preview"
                    className="max-h-28 object-contain"
                    data-testid="uploaded-sig-preview"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1.5 text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeWhiteBg}
                      onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-[11px]">Remove white background</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="text-red-600 font-semibold hover:underline text-xs"
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            )}

            {uploadError && <p className="text-xs text-red-600 font-medium">{uploadError}</p>}
          </div>
        )}

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-neutral-400 leading-tight pt-1">
          By clicking &quot;Adopt &amp; Apply&quot;, you agree that this electronic representation
          will be applied to the document and legally binds you as your signature.
        </p>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            data-testid="cancel-signature-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdoptAndApply}
            disabled={
              (activeTab === 'draw' && !hasDrawn) ||
              (activeTab === 'type' && !typedName.trim()) ||
              (activeTab === 'upload' && !uploadedImage)
            }
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            data-testid="adopt-signature-button"
          >
            Adopt &amp; Apply ✓
          </button>
        </div>
      </div>
    </div>
  );
}
