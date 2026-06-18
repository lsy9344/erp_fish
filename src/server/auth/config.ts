import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { type UserRole } from "../../../generated/prisma";
import { loginSchema } from "~/features/auth/schema";
import { db } from "~/server/db";
import { verifyPassword } from "~/server/password";

const DUMMY_PASSWORD_HASH =
  "scrypt$00000000000000000000000000000000$02e0ac5cfabe3a015df96e866e04b4d6848755aeb5c39a79ed6214d6717fd36ed30cf3ee69cc590d6e55e962b304e13ee229c5fd2a5e24d454a01c41dc6d84a0";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "ERP Fish 내부 계정",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user?.passwordHash) {
          await verifyPassword(parsed.data.password, DUMMY_PASSWORD_HASH);
          return null;
        }

        const isValidPassword = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );

        if (!isValidPassword) {
          return null;
        }

        if (!user.isActive) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  logger: {
    error(error) {
      if (
        error instanceof Error &&
        (error.name === "CredentialsSignin" || error.name === "JWTSessionError")
      ) {
        // Expected: a bad sign-in attempt or a stale/invalid session cookie.
        // These are handled gracefully (see safeAuth) and should not spam logs.
        return;
      }

      console.error(error);
    },
  },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
        role: token.role as UserRole,
      },
    }),
  },
} satisfies NextAuthConfig;
