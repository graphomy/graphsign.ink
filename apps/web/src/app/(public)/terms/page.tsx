import Link from 'next/link';

export const metadata = {
  title: 'Terms of Use — graphsign.ink',
  description: 'Terms of Use and Service Agreement for graphsign.ink',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ink-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-neutral-200 p-8 sm:p-12 shadow-sm">
        <div className="border-b border-neutral-200 pb-6 mb-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-neutral-900">
            graph<span className="text-[#ba0000]">sign</span>.ink
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold text-neutral-900 tracking-tight">Terms of Use</h1>
          <p className="mt-2 text-sm text-neutral-500">Effective Date: October 2026</p>
        </div>

        <div className="prose prose-neutral max-w-none text-sm text-neutral-700 space-y-6 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">1. Eligibility & Age Requirement</h2>
            <p>
              By accessing or using graphsign.ink (&quot;the Service&quot;), including creating an account or executing
              any document as a signer, you represent and warrant that you are at least 18 years of age and possess
              the full legal capacity to enter into legally binding agreements.
            </p>
            <p className="mt-2">
              <strong>All signers and participants must be 18 years of age or older</strong>, not solely paying account
              holders or workspace administrators. If we learn or have reason to believe that any user, account holder,
              or document signer is underage (under 18 years old), the associated account and access will be immediately
              suspended, pending agreements may be voided, and services terminated in accordance with applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">2. Electronic Signatures & Legal Effect</h2>
            <p>
              graphsign.ink provides cryptographic and electronic signature workflows designed to comply with applicable
              electronic signature laws (including eIDAS, ESIGN, and UETA). By executing documents through the Service,
              you acknowledge that electronic signatures carry the same legal weight and enforceability as handwritten
              signatures.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">3. Account Security & Verification</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials, multi-factor
              authentication tokens, and cryptographic keys. You agree to notify us immediately of any unauthorized
              access to your account or any security breach.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">4. Acceptable Use</h2>
            <p>
              You agree not to use the Service for any unlawful, fraudulent, or abusive activities, including but not
              limited to forging signatures, impersonating individuals or legal entities, or transmitting malicious code.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">5. Termination & Modifications</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms. We may update these Terms
              periodically, and continued use of the Service following revisions constitutes acceptance of the modified Terms.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-neutral-200 flex justify-between items-center text-xs text-neutral-500">
          <span>&copy; {new Date().getFullYear()} graphsign.ink</span>
          <Link href="/register" className="font-semibold text-[#ba0000] hover:text-[#a00000]">
            Return to Registration →
          </Link>
        </div>
      </div>
    </div>
  );
}
