import { LegalPage } from '@/components/layout/LegalPage';
import { termsSections } from '@/lib/legal-content';

export const metadata = { title: 'Terms of Service | graphsign.ink' };

/** Terms for voluntary hosted-service use and electronic signing. */
export default function TermsPage() {
  return <LegalPage title="Terms of Service" sections={termsSections} />;
}
