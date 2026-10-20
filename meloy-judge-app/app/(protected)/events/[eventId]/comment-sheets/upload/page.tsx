'use client';

import { useParams, useRouter } from 'next/navigation';
import { UploadSheetsScreen } from '@/components/comment-sheets/upload-sheets-screen';

export default function UploadSheetsPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;

  return (
    <UploadSheetsScreen
      eventId={eventId}
      onBack={() => router.push(`/events/${eventId}`)}
    />
  );
}
