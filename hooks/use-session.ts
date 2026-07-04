'use client';

import { useEffect, useState } from 'react';
import type { SessionClaims } from '@/lib/auth';
import { apiRequest, isApiClientError } from '@/lib/api-client';

export function useSession() {
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ ok: true; claims: SessionClaims }>('/api/session/claims')
      .then((response) => {
        if (!cancelled) {
          setClaims(response.claims);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiClientError(err)
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Session error',
          );
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { claims, isLoading, error };
}
