import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Cookie Notice | graphsign.ink' };

/** Describes the essential storage currently used; no optional trackers are loaded. */
export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Notice and preferences"
      sections={[
        [
          'Cookies and similar technologies',
          'The current application uses authentication cookies where configured and browser local storage for session tokens, account/workspace identifiers, branding and preferences such as timezone. Cookies are sent with matching requests; local storage remains in your browser until cleared. These technologies support sign-in, access control and the settings you request. Network providers may also use essential security technologies to protect requests.',
        ],
        [
          'Current tracking choices',
          'The current application does not load optional advertising or analytics trackers, so there is no optional tracking to accept or reject. Essential authentication and security storage remains necessary to provide the service you request. If optional tracking is introduced, it must remain disabled until any legally required consent is obtained, with equally accessible rejection and withdrawal controls. Signing consent does not authorize optional tracking.',
        ],
        [
          'Managing your browser preferences',
          'You can block cookies or clear this site’s cookies and local storage in your browser’s site-data settings. Sign out before clearing session data on a shared device. Blocking or clearing essential storage may sign you out, reset preferences or prevent authenticated features from working. Browser storage removal does not delete server-held documents or audit records; use the Privacy Notice’s request process for those.',
        ],
        [
          'Contact',
          'Questions about storage technologies or privacy choices can be sent to Graphomy Technologies LLP at support@graphsign.ink. See the Privacy Notice for processing purposes, retention and rights.',
        ],
      ]}
    />
  );
}
