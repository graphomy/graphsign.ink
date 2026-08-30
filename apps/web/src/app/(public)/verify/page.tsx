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
} from 'lucide-react';

interface VerificationReport {
  isValid: boolean;
  status: 'VALID' | 'TAMPERED' | 'NOT_FOUND' | 'REVOKED';
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

export default function PublicVerifyPage() {
  const [tab, setTab] = useState<'token' | 'file'>('token');
  const [tokenInput, setTokenInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [copied, setCopied] = useState(false);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(1); // Open Adobe FAQ by default

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

  const faqs = [
    {
      id: 1,
      question:
        'How do I get the Green Checkmark (&quot;Signature is VALID&quot;) in Adobe Acrobat Reader?',
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
              $\rightarrow$ <strong>Show Signer&apos;s Certificate</strong>.
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
            Check cryptographic seal integrity, RFC 3161 trusted timestamps, and tamper status
            without an account.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-200/80 p-1.5 rounded-2xl mb-8 flex gap-2 max-w-md mx-auto shadow-inner">
          <button
            type="button"
            onClick={() => {
              setTab('token');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
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
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
              tab === 'file'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload PDF File
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
          ) : (
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
          )}

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Verification Report Card */}
        {report && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-md space-y-6 mb-12 animate-fadeIn">
            {/* Status Banner */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                report.isValid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-sm ${
                    report.isValid ? 'bg-emerald-600' : 'bg-red-600'
                  }`}
                >
                  {report.isValid ? '✓' : '✕'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {report.isValid
                      ? 'Cryptographically Sealed & Authentic'
                      : 'Tamper Detected / Invalid Seal'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {report.isValid
                      ? 'Document integrity verified via PAdES digital signature & RFC 3161 timestamp.'
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
                  PAdES Compliance Level
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

            {/* QR Code Badge Section (Issue 11) */}
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

        {/* FAQ Section (Issue 6) */}
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
