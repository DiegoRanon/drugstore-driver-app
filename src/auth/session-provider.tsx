/**
 * Who is signed in, and what happens when that stops being true.
 *
 * The session is derived from the secure store, never from React state that
 * outlives it: on launch the app asks the Keychain, not a cached boolean. That
 * is what makes "deactivated driver" a real wipe rather than a UI state a
 * relaunch could undo (PRD §4.5).
 */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, ApiUnreachableError } from '@/api/errors';
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  registerDriver as apiRegisterDriver,
} from '@/api/client';
import { setSessionTerminationHandler } from '@/api/refresh';
import type { LoginBody, MeResponse, RegisterDriverBody } from '@/api/types';
import { loadSession } from '@/auth/token-store';

export type SessionState =
  /** Reading the Keychain. One frame on a warm launch, never a login flash. */
  | { status: 'restoring' }
  /** `endedReason` is set only when the session was taken away, not on sign-out. */
  | { status: 'signed-out'; endedReason: string | null }
  /**
   * A credential exists. `profile` is null when the app launched offline with
   * a stored token: the driver is signed in, we just have not been able to ask
   * the server who they are yet. Kicking them to a login screen because the
   * van is in a parking garage would be exactly the wrong call (PRD §6.4).
   */
  | { status: 'signed-in'; profile: MeResponse | null };

type SessionContextValue = {
  state: SessionState;
  signIn: (credentials: LoginBody) => Promise<void>;
  register: (body: RegisterDriverBody) => Promise<void>;
  signOut: () => Promise<void>;
  /** Clears the "your session ended" notice once the driver has seen it. */
  acknowledgeEnded: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'restoring' });
  const queryClient = useQueryClient();

  /**
   * The one wipe path. Everything cached is patient data or derived from it,
   * so the cache goes with the credential — `removeQueries`, not
   * `invalidateQueries`, because invalidation leaves the data in memory and
   * merely marks it stale (PRD §8.1).
   *
   * The outbox is untouched on purpose: it holds order ids, verbs, and amounts
   * and no patient data at all, so purging PII never loses a pending write
   * (§6.3).
   */
  const purge = useCallback(
    (endedReason: string | null) => {
      queryClient.removeQueries();
      setState({ status: 'signed-out', endedReason });
    },
    [queryClient],
  );

  // A revoked token family or a deactivated driver surfaces from deep inside
  // the API client — possibly during a background drain, with no screen
  // involved. The client wipes the credential; this turns that into navigation.
  useEffect(() => {
    setSessionTerminationHandler((error: ApiError) => {
      purge(error.code === 'ACCOUNT_DISABLED' ? 'ACCOUNT_DISABLED' : 'DEFAULT');
    });
    return () => setSessionTerminationHandler(null);
  }, [purge]);

  // Launch: is there a credential, and does the server still accept it?
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;

      if (!stored) {
        setState({ status: 'signed-out', endedReason: null });
        return;
      }

      // Optimistic: the credential exists, so the driver is in. Confirming who
      // they are is a second, failable step.
      setState({ status: 'signed-in', profile: null });

      try {
        const profile = await getMe();
        if (!cancelled) setState({ status: 'signed-in', profile });
      } catch (error) {
        // A terminal failure already ran the handler above and signed them
        // out. Anything else — offline, a 500 — leaves them signed in with no
        // profile yet, which the header renders around.
        if (!cancelled && !(error instanceof ApiUnreachableError)) {
          if (!(error instanceof ApiError) || !error.isTerminalAuthFailure) {
            setState({ status: 'signed-in', profile: null });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials: LoginBody) => {
    // `login` persists the token pair itself, so there is no window where the
    // app believes it is signed in but the Keychain disagrees.
    await apiLogin(credentials);
    setState({ status: 'signed-in', profile: null });
    try {
      const profile = await getMe();
      setState({ status: 'signed-in', profile });
    } catch {
      // Signed in regardless; the header just has no pharmacy name yet.
    }
  }, []);

  const register = useCallback(async (body: RegisterDriverBody) => {
    // Registration returns no tokens — the driver signs in normally after.
    await apiRegisterDriver(body);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    purge(null);
  }, [purge]);

  const acknowledgeEnded = useCallback(() => {
    setState((current) =>
      current.status === 'signed-out' && current.endedReason !== null
        ? { status: 'signed-out', endedReason: null }
        : current,
    );
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ state, signIn, register, signOut, acknowledgeEnded }),
    [state, signIn, register, signOut, acknowledgeEnded],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
