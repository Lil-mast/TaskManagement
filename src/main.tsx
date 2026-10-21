import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { AUTH_MODE } from './lib/api/config';
import { setAuthTokenProvider, createDevTokenProvider } from './lib/api/auth';
import { createFirebaseTokenProvider } from './lib/auth/firebase';
import { queryClient } from './lib/query/client';
import './styles/base.css';
import './styles/app.css';

if (AUTH_MODE === 'dev') {
  setAuthTokenProvider(createDevTokenProvider());
} else {
  setAuthTokenProvider(createFirebaseTokenProvider());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
