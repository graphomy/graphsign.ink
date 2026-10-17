import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Support | graphsign.ink' };

/** Public support, privacy and grievance channels. */
export default function SupportPage() {
  return (
    <LegalPage
      title="Support and contact"
      sections={[

        [
          'Support',
          'For account access, signing, downloads, exports or technical assistance, email support@graphsign.ink. Include a document or workflow identifier and a description of the issue. Do not send passwords, signing tokens or confidential documents.',
        ],
        [
          'Privacy requests',
          'For access, correction, deletion, consent withdrawal or other applicable privacy rights, email support@graphsign.ink with the subject Privacy request. Invited signers do not need an account. We may verify your identity or coordinate with the document sender.',
        ],
        [
          'Grievances and complaints',
          'Send service or privacy grievances to support@graphsign.ink with the subject Grievance. We will respond within 48 hours.',
        ],
        [
          'Paid services and business enquiries',
          'Contact support@graphsign.ink to discuss a paid plan and a separate written service agreement, including commercial terms, support commitments and any required data-processing arrangements.',
        ],
      ]}
    >
      <a href="mailto:support@graphsign.ink" className="font-semibold underline">
        Email support@graphsign.ink
      </a>
    </LegalPage>
  );
}
