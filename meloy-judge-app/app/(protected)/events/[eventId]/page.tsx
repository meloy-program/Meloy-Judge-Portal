'use client';

import { EventDetailScreen } from '@/components/events/event-detail-screen';
import { JudgeSelectionScreen } from '@/components/judging/judge-selection-screen';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { getCurrentUser, getJudgeProfiles } from '@/lib/api';
import { useAuthToken } from '@/lib/auth-context';

// Session storage key for judge profile
const JUDGE_SESSION_KEY = 'current_judge_session';

interface JudgeSession {
  eventId: string;
  judgeId: string;
  judgeName: string;
  timestamp: number;
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const { user: auth0User } = useUser();
  
  const [userId, setUserId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('judge');
  const [userName, setUserName] = useState<string>('User');
  const [eventName, setEventName] = useState<string>('');
  const [judgeId, setJudgeId] = useState<string | null>(null);
  const [needsProfileSelection, setNeedsProfileSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isTokenValid, isValidating } = useAuthToken();

  // Check if coming from dashboard (force profile selection)
  const fromDashboard = searchParams.get('from') === 'dashboard';

  useEffect(() => {
    if (isValidating || !isTokenValid) {
      return;
    }

    async function fetchUser() {
      try {
        const userData = await getCurrentUser();
        setUserId(userData.user.id);
        setUserRole(userData.user.role);
        setUserName(userData.user.name || auth0User?.name || auth0User?.email?.split('@')[0] || 'User');
        
        // Fetch event name for judge selection screen
        try {
          const { getEvent } = await import('@/lib/api/events');
          const { event } = await getEvent(eventId);
          setEventName(event.name);
        } catch (error) {
          console.error('Failed to fetch event name:', error);
        }
        
        // Check if user is a judge and needs to select a profile
        if (userData.user.role === 'judge') {
          // If coming from dashboard, clear any existing session and force selection
          if (fromDashboard) {
            sessionStorage.removeItem(JUDGE_SESSION_KEY);
            console.log('Coming from dashboard - forcing profile selection');
          }

          // Check for existing session
          const sessionData = sessionStorage.getItem(JUDGE_SESSION_KEY);
          if (sessionData && !fromDashboard) {
            try {
              const session: JudgeSession = JSON.parse(sessionData);
              // Verify session is for this event and not expired (1 hour)
              const isExpired = Date.now() - session.timestamp > 3600000;
              if (session.eventId === eventId && !isExpired) {
                console.log('Found valid judge session:', session.judgeName);
                setJudgeId(session.judgeId);
                setUserName(session.judgeName);
                setNeedsProfileSelection(false);
                setLoading(false);
                return;
              } else {
                console.log('Session expired or wrong event, clearing...');
                sessionStorage.removeItem(JUDGE_SESSION_KEY);
              }
            } catch (error) {
              console.error('Failed to parse session data:', error);
              sessionStorage.removeItem(JUDGE_SESSION_KEY);
            }
          }

          // No valid session - check if profiles exist and show selection
          console.log('No valid session, checking available profiles...');
          try {
            const { profiles } = await getJudgeProfiles(eventId);
            if (profiles.length > 0) {
              console.log(`Found ${profiles.length} available profiles, showing selection screen`);
              setNeedsProfileSelection(true);
            } else {
              console.log('No profiles available for this event');
              setNeedsProfileSelection(false);
            }
          } catch (error) {
            console.error('Failed to fetch judge profiles:', error);
            setNeedsProfileSelection(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUserName(auth0User?.name || auth0User?.email?.split('@')[0] || 'User');
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [auth0User, eventId, fromDashboard, isTokenValid, isValidating]);

  const handleSelectJudge = (selectedJudgeId: string, selectedJudgeName: string) => {
    // Store in session storage
    const session: JudgeSession = {
      eventId,
      judgeId: selectedJudgeId,
      judgeName: selectedJudgeName,
      timestamp: Date.now()
    };
    sessionStorage.setItem(JUDGE_SESSION_KEY, JSON.stringify(session));
    
    setJudgeId(selectedJudgeId);
    setUserName(selectedJudgeName);
    setNeedsProfileSelection(false);
  };

  const handleSelectTeam = (teamId: string) => {
    router.push(`/events/${eventId}/teams/${teamId}`);
  };

  const handleBack = () => {
    // Clear session when going back to dashboard
    sessionStorage.removeItem(JUDGE_SESSION_KEY);
    router.push('/dashboard');
  };

  const handleNavigate = (screen: string) => {
    if (screen === 'leaderboard') {
      router.push(`/events/${eventId}/leaderboard`);
    } else if (screen === 'moderator') {
      router.push(`/events/${eventId}/moderator`);
    }
  };

  const handleManageEvent = (eventId: string) => {
    router.push(`/admin/events/${eventId}/manage`);
  };

  if (loading || isValidating) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  // Show judge selection screen if user is a judge and hasn't selected a profile
  if (needsProfileSelection) {
    return (
      <JudgeSelectionScreen
        eventId={eventId}
        eventName={eventName || 'Event'}
        onSelectJudge={handleSelectJudge}
        onBack={handleBack}
      />
    );
  }

  return (
    <EventDetailScreen
      eventId={eventId}
      judgeId={judgeId}
      onSelectTeam={handleSelectTeam}
      onBack={handleBack}
      onNavigate={handleNavigate}
      onManageEvent={handleManageEvent}
      onOpenModerator={() => router.push(`/events/${eventId}/moderator`)}
      onOpenCommentSheets={() => router.push(`/events/${eventId}/comment-sheets`)}
      onOpenUploadSheets={() => router.push(`/events/${eventId}/comment-sheets/upload`)}
      isAdmin={userRole === 'admin' || userRole === 'moderator'}
      judgeName={userName}
    />
  );
}
