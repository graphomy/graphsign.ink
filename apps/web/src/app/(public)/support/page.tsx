import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Support | graphsign.ink' };

/** Public support, privacy and grievance channels. */
export default function SupportPage() {
  return (
    <LegalPage
      title="Support and contact"
      sections={[
        [
          'Business identity',
          'Graphsign.ink is operated by Graphomy Technologies LLP, a limited liability partnership located in Noida, Uttar Pradesh, India. Account holders and invited signers can contact us without purchasing a plan.',
        ],
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
          'The designated Grievance Officer is Kunal Priyadarshi, Designated Partner, Graphomy Technologies LLP. Send service or privacy grievances to support@graphsign.ink with the subject Grievance, addressed to Kunal Priyadarshi. We will respond within applicable legal time limits. This channel does not restrict complaints to competent authorities or any mandatory legal rights.',
        ],
        [
          'Paid services and business enquiries',
          'Contact support@graphsign.ink to discuss a paid plan and a separate written service agreement, including commercial terms, support commitments and any required data-processing arrangements. A paid agreement does not remove mandatory legal duties, and free use does not waive non-excludable rights.',
        ],
      ]}
    >
      <a href="mailto:support@graphsign.ink" className="font-semibold underline">
        Email support@graphsign.ink
      </a>
    </LegalPage>
  );
}
