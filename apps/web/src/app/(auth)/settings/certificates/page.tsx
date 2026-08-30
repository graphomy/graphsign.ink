'use client';

import { useState, useEffect } from 'react';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { Award, Plus, Upload, CheckCircle2, Shield, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface SigningCertificate {
  id: string;
  name: string;
  type: 'SELF_SIGNED' | 'BYO';
  algorithm: string;
  keyFingerprint: string;
  serialNumber: string;
  subjectDn: string;
  issuerDn: string;
  validFrom: string;
  validTo: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  padesLevel: string;
  tsaUrl: string | null;
  createdAt: string;
}

function CertificatesContent() {
  const [certificates, setCertificates] = useState<SigningCertificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Modal States
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [genName, setGenName] = useState('');
  const [genCommonName, setGenCommonName] = useState('');
  const [genOrg, setGenOrg] = useState('');
  const [genOrgUnit, setGenOrgUnit] = useState('');
  const [genCountry, setGenCountry] = useState('US');
  const [genState, setGenState] = useState('');
  const [genLocality, setGenLocality] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [genAlgo, setGenAlgo] = useState<'RSA_2048' | 'RSA_4096' | 'ECDSA_P256' | 'ECDSA_P384'>('RSA_2048');
  const [genValidityDays, setGenValidityDays] = useState(730);

  const [uploadName, setUploadName] = useState('');
  const [certPem, setCertPem] = useState('');
  const [chainPem, setChainPem] = useState('');
  const [uploadAlgo] = useState<'RSA_2048' | 'RSA_4096' | 'ECDSA_P256' | 'ECDSA_P384'>('RSA_2048');
  const [uploadTsaUrl, setUploadTsaUrl] = useState('');

  useEffect(() => {
    loadCertificates();
  }, []);

  async function loadCertificates() {
    try {
      setIsLoading(true);
      setError('');
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const res = await fetch(`${getApiUrl()}/api/v1/certificates`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
      });

      if (!res.ok) {
        // If 404 or no certs found yet, treat as empty list
        if (res.status === 404) {
          setCertificates([]);
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to load organisation certificates.');
      }

      const data = await res.json();
      setCertificates(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error fetching certificates.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genName.trim()) return;

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const res = await fetch(`${getApiUrl()}/api/v1/certificates/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
        body: JSON.stringify({
          name: genName.trim(),
          commonName: genCommonName.trim() || undefined,
          organization: genOrg.trim() || undefined,
          organizationUnit: genOrgUnit.trim() || undefined,
          country: genCountry.trim() || 'US',
          state: genState.trim() || undefined,
          locality: genLocality.trim() || undefined,
          email: genEmail.trim() || undefined,
          algorithm: genAlgo,
          validityDays: Number(genValidityDays),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to generate certificate.');
      }

      setMessage('Self-signed X.509 certificate generated successfully with custom credentials.');
      setShowGenerateModal(false);
      setGenName('');
      setGenCommonName('');
      setGenOrg('');
      setGenOrgUnit('');
      setGenState('');
      setGenLocality('');
      setGenEmail('');
      loadCertificates();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to generate certificate.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadName.trim() || !certPem.trim()) return;

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const res = await fetch(`${getApiUrl()}/api/v1/certificates/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
        body: JSON.stringify({
          name: uploadName.trim(),
          certificatePem: certPem.trim(),
          chainPem: chainPem.trim() || undefined,
          algorithm: uploadAlgo,
          tsaUrl: uploadTsaUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to upload BYO certificate.');
      }

      setMessage('Bring Your Own (BYO) certificate imported successfully.');
      setShowUploadModal(false);
      setUploadName('');
      setCertPem('');
      setChainPem('');
      loadCertificates();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to upload certificate.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      setError('');
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const res = await fetch(`${getApiUrl()}/api/v1/certificates/${id}/default`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
      });

      if (!res.ok) throw new Error('Failed to set default certificate.');
      setMessage('Default signing certificate updated.');
      loadCertificates();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error updating default certificate.');
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Are you sure you want to revoke this signing certificate? Future signatures will not be able to use it.')) {
      return;
    }

    try {
      setError('');
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const res = await fetch(`${getApiUrl()}/api/v1/certificates/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
      });

      if (!res.ok) throw new Error('Failed to revoke certificate.');
      setMessage('Certificate successfully revoked.');
      loadCertificates();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error revoking certificate.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <div>
        <HeaderNav />
        <main className="max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-5 h-5 text-red-600" />
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Cryptographic Trust & Certificates
                </h1>
              </div>
              <p className="text-slate-600 text-sm">
                Manage X.509 signing certificates, PKCS#11 key handles, and RFC 3161 PAdES sealing profiles.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowGenerateModal(true)}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Generate Self-Signed
              </button>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm transition-all border border-slate-300 shadow-sm flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                Upload BYO Certificate
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {message && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Verification Callout Box */}
          <div className="mb-8 p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                🛡️
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Independent Document Verification</h4>
                <p className="text-xs text-slate-500">
                  Anyone can verify documents sealed with these certificates using the public verification portal.
                </p>
              </div>
            </div>
            <Link
              href="/verify"
              className="py-1.5 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
            >
              Open Public /verify Portal <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>
          </div>

          {/* Certificates List */}
          {isLoading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
              <p className="text-sm">Loading certificate registry...</p>
            </div>
          ) : certificates.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3 text-xl">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Signing Certificates Configured</h3>
              <p className="text-sm text-slate-600 mt-1 max-w-sm mx-auto">
                Generate a free self-signed certificate or upload your organization&apos;s BYO X.509 certificate to enable PAdES sealing.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(true)}
                  className="py-2 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm"
                >
                  Generate Free Certificate
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-6 shadow-sm transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900">{cert.name}</h3>
                        {cert.isDefault && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700">
                            Default Signer
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            cert.status === 'ACTIVE'
                              ? 'bg-blue-50 border border-blue-200 text-blue-700'
                              : 'bg-red-50 border border-red-200 text-red-700'
                          }`}
                        >
                          {cert.status}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 border border-slate-200 text-slate-700">
                          {cert.type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate max-w-xl">
                        Subject: {cert.subjectDn}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!cert.isDefault && cert.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(cert.id)}
                          className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all border border-slate-200"
                        >
                          Set Default
                        </button>
                      )}
                      {cert.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(cert.id)}
                          className="py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-all border border-red-200"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Algorithm</span>
                      <span className="font-mono text-slate-800 font-semibold">{cert.algorithm}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">PAdES Level</span>
                      <span className="text-emerald-700 font-semibold">PAdES-{cert.padesLevel.replace('_', '-')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Valid Until</span>
                      <span className="text-slate-700 font-medium">{new Date(cert.validTo).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Key Fingerprint</span>
                      <span className="font-mono text-slate-600 truncate block">{cert.keyFingerprint}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Generate Self-Signed Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Generate Self-Signed X.509 Certificate</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize your certificate identity credentials to match your organization or personal signing authority.
              </p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Certificate Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  placeholder="e.g. Acme Corp Primary Signing Key"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>

              {/* X.509 Subject Identity Information */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  X.509 Subject Identity &amp; Credentials
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Common Name (CN)</label>
                    <input
                      type="text"
                      value={genCommonName}
                      onChange={(e) => setGenCommonName(e.target.value)}
                      placeholder="e.g. Acme Corp Document Signer"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Organization (O)</label>
                    <input
                      type="text"
                      value={genOrg}
                      onChange={(e) => setGenOrg(e.target.value)}
                      placeholder="e.g. Acme Corporation"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Organizational Unit (OU)</label>
                    <input
                      type="text"
                      value={genOrgUnit}
                      onChange={(e) => setGenOrgUnit(e.target.value)}
                      placeholder="e.g. Legal &amp; Compliance"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Signer Email</label>
                    <input
                      type="email"
                      value={genEmail}
                      onChange={(e) => setGenEmail(e.target.value)}
                      placeholder="e.g. legal@acme.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">City / Locality (L)</label>
                    <input
                      type="text"
                      value={genLocality}
                      onChange={(e) => setGenLocality(e.target.value)}
                      placeholder="e.g. San Francisco"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">State / Province (ST)</label>
                    <input
                      type="text"
                      value={genState}
                      onChange={(e) => setGenState(e.target.value)}
                      placeholder="e.g. California"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Country (2 Letters)</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={genCountry}
                      onChange={(e) => setGenCountry(e.target.value.toUpperCase())}
                      placeholder="US"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white uppercase text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Cryptographic Parameters */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cryptographic Algorithm</label>
                  <select
                    value={genAlgo}
                    onChange={(e) => setGenAlgo(e.target.value as typeof genAlgo)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                  >
                    <option value="RSA_2048">RSA 2048-bit (Standard / Universal Compatibility)</option>
                    <option value="RSA_4096">RSA 4096-bit (High Security)</option>
                    <option value="ECDSA_P256">ECDSA P-256 (NIST Curve / Modern)</option>
                    <option value="ECDSA_P384">ECDSA P-384 (Suite B Compliant)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Validity Duration</label>
                  <select
                    value={genValidityDays}
                    onChange={(e) => setGenValidityDays(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                  >
                    <option value={365}>1 Year (365 days)</option>
                    <option value={730}>2 Years (730 days - Recommended)</option>
                    <option value={1095}>3 Years (1,095 days)</option>
                    <option value={1825}>5 Years (1,825 days)</option>
                    <option value={3650}>10 Years (3,650 days)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="py-2 px-4 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Generating...' : 'Generate Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload BYO Certificate Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Import Bring Your Own (BYO) Certificate</h3>
            <p className="text-xs text-slate-500">
              Upload your organization&apos;s commercial (e.g. DigiCert AATL) or private CA certificate.
            </p>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Certificate Name / Description</label>
                <input
                  type="text"
                  required
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. DigiCert Commercial Certificate"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Certificate PEM</label>
                <textarea
                  required
                  rows={4}
                  value={certPem}
                  onChange={(e) => setCertPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Intermediate / Root Chain PEM (Optional for PAdES B-LTA)</label>
                <textarea
                  rows={3}
                  value={chainPem}
                  onChange={(e) => setChainPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;CA Intermediate Chain...&#10;-----END CERTIFICATE-----"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Custom TSA URL (Optional)</label>
                <input
                  type="url"
                  value={uploadTsaUrl}
                  onChange={(e) => setUploadTsaUrl(e.target.value)}
                  placeholder="https://timestamp.yourca.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="py-2 px-4 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Importing...' : 'Import Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default function CertificatesPage() {
  return (
    <SessionGuard>
      <CertificatesContent />
    </SessionGuard>
  );
}
