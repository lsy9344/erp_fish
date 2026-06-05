import NextAuth, { type Session } from "next-auth";
import { cache } from "react";

import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

/**
 * Resolve the current session, treating an unreadable session token as "no
 * session" instead of throwing.
 *
 * A stale or otherwise invalid JWT cookie (e.g. left over after the
 * `AUTH_SECRET` changed) makes Auth.js raise `JWTSessionError`. That surfaces as
 * a server error on every page that reads the session — including the login
 * page itself, which then becomes impossible to reach. Swallowing the decode
 * failure lets such users fall back to the unauthenticated flow and sign in
 * again, which clears the bad cookie.
 */
async function safeAuth(): Promise<Session | null> {
  try {
    return await uncachedAuth();
  } catch (error) {
    if (error instanceof Error && error.name === "JWTSessionError") {
      return null;
    }

    throw error;
  }
}

const auth = cache(safeAuth);

export { auth, handlers, signIn, signOut };
