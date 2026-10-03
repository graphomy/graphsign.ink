import { LegalPage } from '@/components/layout/LegalPage';
import { privacySections } from '@/lib/legal-content';

export const metadata = { title: 'Privacy Notice | graphsign.ink' };

/** Privacy information for account holders and accountless invited signers. */
export default function PrivacyPage() {
  return <LegalPage title="Privacy Notice" sections={privacySections} />;
}
