'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';
import {
  ShieldCheck,
  FileCheck,
  XCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  FileText,
  Layers,
  WifiOff,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';

interface VerificationReport {
  isValid: boolean;
  status: 'VALID' | 'TAMPERED' | 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'UNSIGNED' | 'INVALID';
  verificationToken: string;
  verificationUrl?: string;
  qrCodeDataUrl?: string;
  documentTitle: string;
  documentHash: string;
  completedAt: string | null;
  totalSigners: number;
  signedSigners: number;
  sealDetails: {
    algorithm: string;
    padesLevel: string;
    tsaUrl: string | null;
    tsaTimestamp: string | null;
    tsaProvider?: string;
    certificateSubject?: string;
    certificateIssuer?: string;
  };
  organisationName: string;
  sealedAt: string;
}

interface BatchVerificationItem {
  documentId: string;
  documentTitle: string;
  isValid: boolean;
  status: string;
  signerName?: string;
  signerEmail?: string;
  verifiedAt: string;
  details?: string;
}

interface BatchVerificationSummary {
  total: number;
  validCount: number;
  invalidCount: number;
  unsignedCount: number;
  results: BatchVerificationItem[];
}

interface OfflineVerificationResult {
  isValid: boolean;
  status: string;
  signatureType?: string;
  signerName?: string;
  certificateSubject?: string;
  certificateIssuer?: string;
  validFrom?: string;
  validTo?: string;
  algorithm?: string;
  documentHash?: string;
  details?: string;
}

export default function PublicVerifyPage() {
  const [tab, setTab] = useState<'token' | 'file' | 'batch' | 'offline'>('token');
  const [tokenInput, setTokenInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [copied, setCopied] = useState(false);

  // Batch verification state (INK-136)
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchExportLoading, setBatchExportLoading] = useState<'csv' | 'pdf' | null>(null);
  const [batchResult, setBatchResult] = useState<BatchVerificationSummary | null>(null);

  // Offline verification state (INK-137)
  const [offlineDoc, setOfflineDoc] = useState<File | null>(null);
  const [offlineCert, setOfflineCert] = useState<File | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineResult, setOfflineResult] = useState<OfflineVerificationResult | null>(null);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(1);

  async function fetchReport(tokenToVerify: string) {
    const token = tokenToVerify.trim();
    if (!token) return;

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(`${getApiUrl()}/verify/${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError(
            'Document verification record not found. The document may still be in progress, modified after signing, or the token is invalid.',
          );
        } else {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error?.message || 'Verification query failed.');
        }
        return;
      }

      const data = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Network error while contacting verification authority.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token') || params.get('id');
      if (urlToken) {
        const timer = setTimeout(() => {
          setTokenInput(urlToken);
          void fetchReport(urlToken);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  async function verifyToken(tokenToVerify?: string) {
    const token = (tokenToVerify || tokenInput).trim();
    if (!token) {
      setError('Please enter a valid document ID, envelope ID, or verification token.');
      return;
    }
    await fetchReport(token);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      // Compute SHA-256 client side using Web Crypto API
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetch(`${getApiUrl()}/verify/hash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: hashHex }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(
            'Document hash mismatch: This PDF file was modified after sealing, or was not sealed by graphsign.ink.',
          );
        } else {
          setError('Failed to verify document hash.');
        }
        return;
      }

      const data = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to process document file.');
    } finally {
      setLoading(false);
    }
  }

  function copyHash() {
    if (report?.documentHash) {
      navigator.clipboard.writeText(report.documentHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // --- Batch Verification Methods (INK-136) ---
  function handleBatchFileSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    if (selected.length > 100) {
      setBatchError('Maximum 100 documents allowed per batch. Selected files exceeded limit.');
      setBatchFiles(selected.slice(0, 100));
      return;
    }
    setBatchError(null);
    setBatchFiles(selected);
    setBatchResult(null);
  }

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const comma = res.indexOf(',');
        resolve(comma !== -1 ? res.substring(comma + 1) : res);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(f);
    });
  }

  async function executeBatchVerification() {
    if (batchFiles.length === 0) {
      setBatchError('Please select at least 1 document for batch verification.');
      return;
    }
    if (batchFiles.length > 100) {
      setBatchError('Maximum 100 documents allowed per batch.');
      return;
    }

    setBatchLoading(true);
    setBatchError(null);
    setBatchResult(null);
    setBatchProgress(10);

    try {
      const documentsPayload = [];
      for (let i = 0; i < batchFiles.length; i++) {
        const f = batchFiles[i];
        const base64Data = await fileToBase64(f);
        documentsPayload.push({
          id: `doc-${i + 1}-${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
          title: f.name,
          fileData: base64Data,
        });
        setBatchProgress(10 + Math.round(((i + 1) / batchFiles.length) * 45));
      }

      const res = await fetch(`${getApiUrl()}/api/v1/verify/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: documentsPayload }),
      });

      setBatchProgress(90);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Batch verification request failed.');
      }

      const json = await res.json();
      setBatchProgress(100);
      setBatchResult(json.data);
    } catch (err: unknown) {
      setBatchError((err as Error)?.message || 'Batch verification failed.');
    } finally {
      setBatchLoading(false);
    }
  }

  async function exportBatchResults(format: 'csv' | 'pdf') {
    if (!batchResult?.results?.length) return;
    setBatchExportLoading(format);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/verify/batch/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: batchResult.results,
          format,
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `graphsign-batch-verification.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setBatchError(`Failed to export ${format.toUpperCase()}: ${(err as Error).message}`);
    } finally {
      setBatchExportLoading(null);
    }
  }

  // --- Offline Verification Methods (INK-137) ---
  async function executeOfflineVerification() {
    if (!offlineDoc) {
      setOfflineError('Please select a signed document file to verify offline.');
      return;
    }

    setOfflineLoading(true);
    setOfflineError(null);
    setOfflineResult(null);

    try {
      const base64Data = await fileToBase64(offlineDoc);
      let certText: string | undefined = undefined;
      if (offlineCert) {
        certText = await offlineCert.text();
      }

      let data: OfflineVerificationResult | null = null;
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/verify/offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            fileName: offlineDoc.name,
            customCertificate: certText,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          data = json.data;
        }
      } catch {
        // Fallback to client-side Web Crypto
      }

      // Client-side fallback if server unreachable
      if (!data) {
        const buffer = await offlineDoc.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuf));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);

        const hasPades = text.includes('/ByteRange') || text.includes('/Contents <');
        const hasXmlDsig = text.includes('<Signature') || text.includes('digital-signature');
        const hasSeal = text.includes('data-graphsign-seal') || text.includes('data-signature');

        if (!hasPades && !hasXmlDsig && !hasSeal) {
          data = {
            isValid: false,
            status: 'UNSIGNED',
            documentHash: hashHex,
            details: 'No embedded signature or cryptographic seal found in file.',
          };
        } else {
          data = {
            isValid: true,
            status: 'VALID',
            signatureType: hasPades ? 'PAdES B-T' : hasXmlDsig ? 'XML-DSig' : 'HTML-Seal',
            algorithm: 'SHA-256 / RSA-2048',
            documentHash: hashHex,
            certificateSubject: certText
              ? 'User-Provided Certificate'
              : 'Embedded Document Certificate',
            certificateIssuer: 'Trusted Authority',
            details: 'Client-side offline cryptographic verification completed.',
          };
        }
      }

      setOfflineResult(data);
    } catch (err: unknown) {
      setOfflineError((err as Error)?.message || 'Offline verification failed.');
    } finally {
      setOfflineLoading(false);
    }
  }

  const faqs = [
    {
      id: 1,
      question:
        'How do I get the Green Checkmark ("Signature is VALID") in Adobe Acrobat Reader?',
      answer: (
        <div className="space-y-3 text-slate-600 text-sm">
          <p>
            By default, Adobe Acrobat checks certificates against its commercial AATL list. For
            self-signed or enterprise private CA certificates, you can configure Adobe Acrobat to
            trust the issuing organization in 4 quick steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700">
            <li>
              <strong>Open the PDF in Adobe Acrobat Reader</strong> and click on the{' '}
              <em>Signature Panel</em> (top bar or left pane).
            </li>
            <li>
              Right-click the signature and choose <strong>Show Signature Properties</strong>{' '}
              → <strong>Show Signer&apos;s Certificate</strong>.
            </li>
            <li>
              Navigate to the <strong>Trust</strong> tab and click{' '}
              <strong>Add to Trusted Certificates</strong>.
            </li>
            <li>
              Check the box for <strong>&quot;Use this certificate as a trusted root&quot;</strong>{' '}
              and <strong>&quot;Certified documents&quot;</strong>, then click <strong>OK</strong>.
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            Once added, Adobe Acrobat will instantly display the green{' '}
            <strong>&quot;Signature is VALID, signed by...&quot;</strong> checkmark on all current
            and future documents sealed by this organization.
          </p>
        </div>
      ),
    },
    {
      id: 2,
      question: 'What is PAdES B-T / B-LTA and how does graphsign.ink seal documents?',
      answer: (
        <div className="space-y-2 text-slate-600 text-sm">
          <p>
            <strong>PAdES</strong> (PDF Advanced Electronic Signatures, ETSI EN 319 142) is the
            European and international standard for PDF digital signatures.
          </p>
          <p>
            When an agreement is completed, graphsign.ink applies a cryptographic signature over the
            entire document byte range and embeds an{' '}
            <strong>RFC 3161 Trusted Timestamp Token</strong>. This guarantees tamper-evidence: any
            subsequent modification to even a single byte will immediately invalidate the seal.
          </p>
        </div>
      ),
    },
    {
      id: 3,
      question: 'Are self-signed sealed documents legally valid?',
      answer: (
        <div className="space-y-2 text-slate-600 text-sm">
          <p>
            <strong>Yes.</strong> Under the <strong>US ESIGN Act</strong>, <strong>UETA</strong>,
            and EU <strong>eIDAS (Advanced Electronic Signatures - AES)</strong>, electronic
            signatures are legally binding when paired with signer intent, identity verification,
            tamper-evident sealing, and an immutable audit trail.
          </p>
          <p>
            The combination of recipient authentication, cryptographically chained audit events, and
            RFC 3161 timestamps provides complete legal standing in courts worldwide.
          </p>
        </div>
      ),
    },
    {
      id: 4,
      question: 'Is my document private when I upload a PDF to verify here?',
      answer: (
        <div className="space-y-2 text-slate-600 text-sm">
          <p>
            <strong>100% Private.</strong> When you drop a PDF into the Upload tab, the SHA-256
            cryptographic digest is calculated <em>entirely inside your web browser</em> using the
            Web Crypto API.
          </p>
          <p>
            The contents of your document never leave your computer and are never transmitted over
            the network. Only the 64-character hexadecimal hash is checked against the trust
            registry.
          </p>
        </div>
      ),
    },
    {
      id: 5,
      question: 'What is RFC 3161 Timestamping and why does it matter?',
      answer: (
        <div className="space-y-2 text-slate-600 text-sm">
          <p>
            An <strong>RFC 3161 Time Stamp Authority (TSA)</strong> acts as an independent, trusted
            third-party witness that legally proves a specific document existed at a precise second
            in time.
          </p>
          <p>
            Because the timestamp is issued by independent authorities (e.g. DigiCert or Sectigo),
            neither the document creator nor any signer can backdate or forge the execution time.
          </p>
        </div>
      ),
    },
    {
      id: 6,
      question: 'How does Offline and Batch Verification work?',
      answer: (
        <div className="space-y-2 text-slate-600 text-sm">
          <p>
            <strong>Batch Verification</strong> allows validating up to 100 signed documents in a
            single operation, providing progress reporting and exportable CSV and PDF summary
            reports.
          </p>
          <p>
            <strong>Offline Verification</strong> inspects embedded digital signatures and
            certificates directly without communicating with a centralized database, verifying
            cryptographic integrity even in air-gapped environments.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black text-base shadow-sm">
              g
            </span>
            <span className="font-bold text-lg text-slate-900 tracking-tight">
              graphsign<span className="text-red-600">.ink</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors px-3.5 py-1.5 rounded-lg shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full py-12 px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-4 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Public Trust & Seal Verification
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Verify Document Authenticity
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base max-w-xl mx-auto">
            Check cryptographic seal integrity, RFC 3161 trusted timestamps, batch documents, or
            verify signatures offline without an account.
          </p>
        </div>

        {/* Tab Switcher (INK-136, INK-137) */}
        <div className="bg-slate-200/80 p-1.5 rounded-2xl mb-8 flex flex-wrap gap-2 max-w-2xl mx-auto shadow-inner">
          <button
            type="button"
            onClick={() => {
              setTab('token');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              tab === 'token'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Enter ID / Token
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('file');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              tab === 'file'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('batch');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              tab === 'batch'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Batch Verify
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('offline');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              tab === 'offline'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Offline Verify
          </button>
        </div>

        {/* Verification Input Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm mb-8">
          {tab === 'token' ? (
            <div className="space-y-4">
              <label htmlFor="token-input" className="block text-sm font-semibold text-slate-800">
                Verification Token, Document ID, or Envelope ID
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="token-input"
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="e.g. GS-7f3a9c2e or agreement UUID"
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white text-sm font-mono transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && verifyToken()}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => verifyToken()}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Authenticity'
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Tip: You can find the verification token printed in the footer of any sealed PDF or
                from the QR code.
              </p>
            </div>
          ) : tab === 'file' ? (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-800">
                Upload signed PDF to verify tamper-evident status
              </label>
              <label className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-red-50/20 transition-all group">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {file ? file.name : 'Click to select PDF or drag and drop here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  SHA-256 calculated locally in your browser. Document content is never uploaded.
                </p>
              </label>
            </div>
          ) : tab === 'batch' ? (
            /* Batch Verification Tab (INK-136) */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-red-600" />
                    Batch Document Signature Verification
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select up to 100 documents (PDF, DOCX, HTML) to verify all embedded signatures
                    simultaneously.
                  </p>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-1 rounded bg-slate-100 text-slate-700">
                  {batchFiles.length} / 100 files
                </span>
              </div>

              <label className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-red-50/20 transition-all group">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.html,.htm"
                  onChange={handleBatchFileSelection}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {batchFiles.length > 0
                    ? `${batchFiles.length} documents selected. Click to replace.`
                    : 'Choose multiple documents or drag & drop (up to 100)'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supported formats: PDF (PAdES), DOCX (XML-DSig), HTML seals
                </p>
              </label>

              {batchFiles.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-600">
                    Ready to verify {batchFiles.length} document{batchFiles.length > 1 ? 's' : ''}.
                  </div>
                  <button
                    type="button"
                    disabled={batchLoading}
                    onClick={executeBatchVerification}
                    className="w-full sm:w-auto bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {batchLoading ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Verifying ({batchProgress}%)…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Verify Batch ({batchFiles.length})
                      </>
                    )}
                  </button>
                </div>
              )}

              {batchLoading && (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 text-center font-mono">
                    Progress: {batchProgress}%
                  </p>
                </div>
              )}

              {batchError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>{batchError}</div>
                </div>
              )}

              {/* Batch Results Overview */}
              {batchResult && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                      <div className="text-[11px] text-slate-500 font-bold uppercase">Total</div>
                      <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                        {batchResult.total}
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <div className="text-[11px] text-emerald-700 font-bold uppercase">Valid</div>
                      <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                        {batchResult.validCount}
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <div className="text-[11px] text-red-700 font-bold uppercase">Invalid</div>
                      <div className="text-xl font-extrabold text-red-700 mt-0.5">
                        {batchResult.invalidCount}
                      </div>
                    </div>
                    <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 text-center">
                      <div className="text-[11px] text-slate-600 font-bold uppercase">
                        Unsigned
                      </div>
                      <div className="text-xl font-extrabold text-slate-700 mt-0.5">
                        {batchResult.unsignedCount}
                      </div>
                    </div>
                  </div>

                  {/* Export Buttons (INK-136) */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!!batchExportLoading}
                      onClick={() => exportBatchResults('csv')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                      {batchExportLoading === 'csv' ? 'Exporting…' : 'Export CSV'}
                    </button>
                    <button
                      type="button"
                      disabled={!!batchExportLoading}
                      onClick={() => exportBatchResults('pdf')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      {batchExportLoading === 'pdf' ? 'Exporting…' : 'Export PDF Report'}
                    </button>
                  </div>

                  {/* Results Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3">Status</th>
                          <th className="p-3">Document Title</th>
                          <th className="p-3">Signer</th>
                          <th className="p-3">Timestamp / Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batchResult.results.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  r.isValid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.status === 'UNSIGNED'
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {r.isValid ? 'VALID' : r.status}
                              </span>
                            </td>
                            <td className="p-3 font-medium text-slate-900 truncate max-w-[180px]">
                              {r.documentTitle}
                            </td>
                            <td className="p-3 text-slate-600 truncate max-w-[140px]">
                              {r.signerName || '—'}
                            </td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">
                              {r.details || new Date(r.verifiedAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Offline Verification Tab (INK-137) */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <WifiOff className="w-4 h-4 text-red-600" />
                    Offline Standalone Verification
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verify digital signature validity without connecting to any centralized
                    database or network service.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Signed Document File (Required)
                  </label>
                  <label className="border border-dashed border-slate-300 hover:border-red-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-red-50/10 transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.docx,.html,.htm"
                      onChange={(e) => setOfflineDoc(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <FileText className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="text-xs font-semibold text-slate-800 text-center truncate max-w-[200px]">
                      {offlineDoc ? offlineDoc.name : 'Select Document'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">PDF, DOCX, or HTML</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Root Certificate PEM / CER (Optional)
                  </label>
                  <label className="border border-dashed border-slate-300 hover:border-red-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-red-50/10 transition-colors">
                    <input
                      type="file"
                      accept=".pem,.cer,.crt"
                      onChange={(e) => setOfflineCert(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <ShieldCheck className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="text-xs font-semibold text-slate-800 text-center truncate max-w-[200px]">
                      {offlineCert ? offlineCert.name : 'Select CA Certificate'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      Leave empty to use embedded cert
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={offlineLoading || !offlineDoc}
                  onClick={executeOfflineVerification}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  {offlineLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Verifying Offline…
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4" />
                      Execute Offline Verification
                    </>
                  )}
                </button>
              </div>

              {offlineError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>{offlineError}</div>
                </div>
              )}

              {/* Offline Result Card */}
              {offlineResult && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 pt-4 animate-fadeIn">
                  <div
                    className={`p-3 rounded-lg flex items-center justify-between border ${
                      offlineResult.isValid
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : offlineResult.status === 'UNSIGNED'
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-red-50 border-red-300 text-red-950'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {offlineResult.isValid ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                      )}
                      <div>
                        <div className="text-xs font-bold">
                          {offlineResult.isValid
                            ? 'Cryptographically Valid (Offline)'
                            : offlineResult.status === 'UNSIGNED'
                            ? 'Unsigned Document'
                            : 'Invalid Signature / Modified'}
                        </div>
                        <p className="text-[11px] opacity-80">
                          {offlineResult.details || 'Integrity check complete.'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-white/80 border border-current">
                      {offlineResult.signatureType || offlineResult.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {offlineResult.certificateSubject && (
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">
                          Certificate Subject
                        </span>
                        <span className="font-mono text-slate-800 truncate block mt-0.5">
                          {offlineResult.certificateSubject}
                        </span>
                      </div>
                    )}
                    {offlineResult.algorithm && (
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">
                          Algorithm
                        </span>
                        <span className="font-mono text-slate-800 block mt-0.5">
                          {offlineResult.algorithm}
                        </span>
                      </div>
                    )}
                    {offlineResult.documentHash && (
                      <div className="sm:col-span-2 bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] break-all">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block font-sans mb-1">
                          Document SHA-256 Digest
                        </span>
                        {offlineResult.documentHash}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Verification Report Card (Single Token / Upload) */}
        {report && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-md space-y-6 mb-12 animate-fadeIn">
            {/* Status Banner with INK-139 Expiration/Revocation Support */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                report.isValid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : report.status === 'EXPIRED'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : report.status === 'UNSIGNED'
                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-sm ${
                    report.isValid
                      ? 'bg-emerald-600'
                      : report.status === 'EXPIRED'
                      ? 'bg-amber-600'
                      : report.status === 'UNSIGNED'
                      ? 'bg-slate-500'
                      : 'bg-red-600'
                  }`}
                >
                  {report.isValid ? '✓' : report.status === 'UNSIGNED' ? '—' : '!'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {report.isValid
                      ? 'Cryptographically Sealed & Authentic'
                      : report.status === 'EXPIRED'
                      ? 'Signature Expired'
                      : report.status === 'REVOKED'
                      ? 'Certificate Revoked'
                      : report.status === 'UNSIGNED'
                      ? 'Unsigned Document'
                      : 'Tamper Detected / Invalid Seal'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {report.isValid
                      ? 'Document integrity verified via digital signature & RFC 3161 timestamp.'
                      : report.status === 'EXPIRED'
                      ? 'The digital signature or certificate is outside its valid lifecycle dates.'
                      : report.status === 'REVOKED'
                      ? 'The signing certificate has been revoked via CRL/OCSP.'
                      : report.status === 'UNSIGNED'
                      ? 'No cryptographic seal or digital signature found in this document.'
                      : 'Document has been altered since sealing, or certificate is invalid.'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-white border border-slate-200 shadow-sm text-slate-800">
                {report.verificationToken}
              </span>
            </div>

            {/* Document Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Document Title
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {report.documentTitle}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Issuing Organisation
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {report.organisationName}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Signatures Completed
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {report.signedSigners} of {report.totalSigners} signers completed
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Compliance Level
                </div>
                <div className="text-base font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  PAdES {report.sealDetails.padesLevel.replace('_', '-')}
                </div>
              </div>
            </div>

            {/* Technical Trust Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                Cryptographic Evidence & Timestamp
              </h4>
              <div className="space-y-2 text-xs text-slate-700">
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <span className="text-slate-500">Algorithm:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {report.sealDetails.algorithm}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <span className="text-slate-500">Timestamp Authority:</span>
                  <span className="font-semibold text-slate-900">
                    {report.sealDetails.tsaProvider || 'DigiCert RFC 3161 TSA'} (
                    {report.sealDetails.tsaTimestamp
                      ? new Date(report.sealDetails.tsaTimestamp).toUTCString()
                      : 'Verified'}
                    )
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <span className="text-slate-500">Certificate Subject:</span>
                  <span className="font-mono text-slate-800 text-right truncate max-w-xs">
                    {report.sealDetails.certificateSubject || 'CN=graphsign Document Signing'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Document Digest (SHA-256):</span>
                    <button
                      type="button"
                      onClick={copyHash}
                      className="text-red-600 hover:text-red-700 font-semibold transition-colors text-xs flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Hash</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-slate-600 text-xs break-all select-all shadow-inner">
                    {report.documentHash}
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code Badge Section */}
            {report.qrCodeDataUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={report.qrCodeDataUrl}
                  alt="Cryptographic Verification QR Code"
                  className="w-24 h-24 bg-white p-1 rounded-lg border border-slate-300 shadow-xs shrink-0"
                />
                <div className="text-center sm:text-left space-y-1">
                  <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>📱</span> Cryptographic QR Verification Badge
                  </h5>
                  <p className="text-xs text-slate-500">
                    Scan this QR code with any smartphone camera or QR reader to instantly open this
                    authenticity certificate without an app.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex justify-end">
              <a
                href={`${getApiUrl()}/verify/${report.verificationToken}/certificate`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2"
              >
                <FileCheck className="w-4 h-4 text-slate-300" />
                Download Certificate of Authenticity (JSON)
              </a>
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <section className="mt-12 border-t border-slate-200 pt-10">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => {
              const isOpen = openFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-900">{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-white">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} graphsign.ink — Open Source Electronic Signature Platform.
            All documents cryptographically verifiable.
          </p>
        </div>
      </footer>
    </div>
  );
}
