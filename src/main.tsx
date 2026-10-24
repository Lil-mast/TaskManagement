import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AUTH_MODE } from './lib/api/config';
import { setAuthTokenProvider, createDevTokenProvider } from './lib/api/auth';
import { createFirebaseTokenProvider } from './lib/auth/firebase';
import { SessionProvider } from './lib/auth/session';
import { queryClient } from './lib/query/client';
import './styles/base.css';
import './styles/app.css';
import './styles/shell.css';
import './styles/landing.css';
import './styles/login.css';
import './styles/workspace.css';
import './styles/drill.css';
import './styles/tasks.css';
import './styles/overlays.css';
import './styles/capture.css';
import './styles/onboarding.css';
import './styles/trash.css';
import './styles/status.css';
import './styles/intro.css';

if (AUTH_MODE === 'dev') {
  setAuthTokenProvider(createDevTokenProvider());
} else {
  setAuthTokenProvider(createFirebaseTokenProvider());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
