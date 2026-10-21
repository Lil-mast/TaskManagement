import { afterEach } from 'vitest';

import { setAuthTokenProvider } from '@/lib/api/auth';

afterEach(() => {
  setAuthTokenProvider(null);
});
