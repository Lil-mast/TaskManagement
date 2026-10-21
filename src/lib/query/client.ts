import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        if (error instanceof ApiError) {
          if (error.code === 'aborted' || error.code === 'timeout') return false;
          if (error.status === 0) return true;
          return error.status >= 500 && error.status !== 501;
        }
        return false;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
