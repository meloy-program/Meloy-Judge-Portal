'use client';

import { useParams, useRouter } from 'next/navigation';
import { CommentSheetsScreen } from '@/components/comment-sheets/comment-sheets-screen';

export default function CommentSheetsPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;

  return <CommentSheetsScreen eventId={eventId} onBack={() => router.push(`/events/${eventId}`)} />;
}
