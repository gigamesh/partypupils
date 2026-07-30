/**
 * Shown when an admin API call comes back 401 mid-flow. Deliberately tells the
 * admin to log in *in a new tab*: the release form holds unsaved work (typed
 * fields, attached WAVs, parsed artwork previews) purely in React state, so
 * reloading this tab to reach the login form would throw it all away.
 */
export const SESSION_EXPIRED_MESSAGE =
  "Your admin session expired. Log in again in a new tab, then come back here and save — nothing on this page will be lost.";

/** Thrown when an admin fetch is rejected by the auth gate in `src/proxy.ts`. */
export class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = "SessionExpiredError";
  }
}

/** Throw `SessionExpiredError` if a response was rejected by the admin auth gate. */
export function throwIfSessionExpired(res: Response): void {
  if (res.status === 401) throw new SessionExpiredError();
}
