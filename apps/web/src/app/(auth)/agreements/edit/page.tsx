'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { AgreementEditModal } from '@/components/features/agreements/AgreementEditModal';
import { getApiUrl } from '@/lib/api';

interface AgreementDetails {
  id: string;
  title: string;
  description?: string;
  markdownContent?: string;
  tags?: string[];
  version: string | number;
  status: string;
}

function EditorPageContent() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const [agreement, setAgreement] = useState<AgreementDetails | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    async function load() {
      try {
        const token =
          localStorage.getItem('graphsign_session_token') || localStorage.getItem('token');
        const res = await fetch(`${getApiUrl()}/api/v1/agreements/${encodeURIComponent(id!)}`, {
          headers: { Authorization: `Bearer ${token || ''}` },
          signal: controller.signal,
        });
        if (!res.ok)
          throw new Error(
            'Unable to load this agreement. It may be unavailable or you may not have access.',
          );
        const data: AgreementDetails = await res.json();
        if (!controller.signal.aborted) setAgreement(data);
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, [id]);

  if (!id || error)
    return (
      <main className="p-8 space-y-4">
        <p role="alert">{error || 'Choose an agreement to edit.'}</p>
        <Link href="/agreements" className="underline">
          Back to agreements
        </Link>
      </main>
    );
  if (!agreement) return <EditorLoading />;
  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-3 md:px-8">
        <Link href="/agreements" className="text-sm font-semibold underline">
          Back to agreements
        </Link>
        <p role="status" className="text-sm text-ink-700">
          {message}
        </p>
      </div>
      <AgreementEditModal
        key={agreement.id}
        fullPage
        agreementId={agreement.id}
        initialTitle={agreement.title}
        initialDescription={agreement.description}
        initialMarkdown={agreement.markdownContent}
        initialTags={agreement.tags}
        currentVersion={agreement.version}
        currentStatus={agreement.status}
        onClose={() => router.push('/agreements')}
        onSuccess={setMessage}
      />
    </main>
  );
}

function EditorLoading() {
  return (
    <main className="p-8" role="status">
      Loading agreement editor...
    </main>
  );
}

/** Full-page agreement editing, using the same form and save actions as the modal. */
export default function AgreementEditorPage() {
  return (
    <SessionGuard>
      <Suspense fallback={<EditorLoading />}>
        <EditorPageContent />
      </Suspense>
    </SessionGuard>
  );
}
