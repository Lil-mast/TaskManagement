import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import { Intro } from '@/components/Intro';
import { Wordmark } from '@/components/Wordmark';
import { useSession } from '@/lib/auth/session';
import { isOnboardingComplete } from '@/lib/onboarding';
import { BriefScreen } from '@/screens/BriefScreen';
import { CaptureScreen } from '@/screens/CaptureScreen';
import { LandingScreen } from '@/screens/LandingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { StatusScreen } from '@/screens/StatusScreen';
import { TasksScreen } from '@/screens/TasksScreen';
import { TrashScreen } from '@/screens/TrashScreen';

function ScreenGate({ label = 'CHECKING SESSION' }: { label?: string }) {
  return (
    <div className="screen-gate" role="status" aria-live="polite">
      <Wordmark />
      <span className="mono-label">{label}</span>
    </div>
  );
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === 'loading') return <ScreenGate />;
  if (status === 'authenticated') return <Navigate to="/brief" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') return <ScreenGate />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function Onboarded({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (!user || !isOnboardingComplete(user.id)) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function App() {
  const [introKey, setIntroKey] = useState(0);

  return (
    <>
      <Intro key={introKey} />
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnly>
              <LandingScreen onReplayIntro={() => setIntroKey((key) => key + 1)} />
            </PublicOnly>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginScreen />
            </PublicOnly>
          }
        />
        <Route
          path="/onboarding"
          element={
            <Protected>
              <OnboardingScreen />
            </Protected>
          }
        />
        <Route
          path="/capture"
          element={
            <Protected>
              <CaptureScreen />
            </Protected>
          }
        />
        <Route
          element={
            <Protected>
              <Onboarded>
                <AppShell />
              </Onboarded>
            </Protected>
          }
        >
          <Route path="/brief" element={<BriefScreen />} />
          <Route path="/tasks" element={<TasksScreen />} />
          <Route path="/tasks/:id" element={<TasksScreen />} />
          <Route path="/trash" element={<TrashScreen />} />
        </Route>
        <Route path="/status" element={<StatusScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </>
  );
}
