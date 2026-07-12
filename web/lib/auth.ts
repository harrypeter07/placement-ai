import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
    };
  }

  interface User {
    id: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    email?: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar",
          ].join(" "),
        },
      },
    }),

    CredentialsProvider({
      name: "credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Missing credentials");
          }

          // Fetch user from Supabase
          const { data: user, error } = await supabase
            .from("users")
            .select("id, name, email, password_hash, image, role")
            .eq("email", credentials.email.toLowerCase().trim())
            .maybeSingle();

          if (error || !user || !user.password_hash) {
            throw new Error("Invalid email or password");
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            user.password_hash
          );

          if (!isValid) {
            throw new Error("Invalid email or password");
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image || null,
            role: user.role as UserRole,
          };
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      try {
        if (account?.provider === "google") {
          const emailRaw = user.email || "";
          const emailNorm = emailRaw.toLowerCase().trim();

          // Check if email already registered in Supabase
          const { data: existingUser, error: fetchError } = await supabase
            .from("users")
            .select("id, role")
            .eq("email", emailNorm)
            .maybeSingle();

          if (fetchError) throw fetchError;

          let userId = "";
          let userRole = "student";

          if (!existingUser) {
            // Create user in Supabase
            const { data: createdUser, error: insertError } = await supabase
              .from("users")
              .insert([
                {
                  name: user.name || "Google User",
                  email: emailNorm,
                  image: user.image || null,
                  role: "student",
                  updated_at: new Date().toISOString(),
                },
              ])
              .select("id, role")
              .single();

            if (insertError) throw insertError;
            userId = createdUser.id;
            userRole = createdUser.role;
          } else {
            userId = existingUser.id;
            userRole = existingUser.role;
          }

          user.id = userId;
          user.role = userRole as UserRole;

          // Update Google Calendar tokens in Supabase
          const calUpdate: Record<string, unknown> = {
            google_calendar_connected: true,
            updated_at: new Date().toISOString(),
          };
          if (account.refresh_token) {
            calUpdate.google_calendar_refresh_token = account.refresh_token;
          }
          if (account.access_token) {
            calUpdate.google_calendar_access_token = account.access_token;
          }
          const acc = account as { expires_at?: number };
          if (acc.expires_at) {
            calUpdate.google_calendar_expires_at = acc.expires_at * 1000;
          }

          const { error: updateError } = await supabase
            .from("users")
            .update(calUpdate)
            .eq("id", userId);

          if (updateError) throw updateError;
        }

        return true;
      } catch (error) {
        console.error("SignIn callback error:", error);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      try {
        if (user?.email) {
          token.email = user.email;
        }

        if (account?.provider === "google") {
          const emailRaw =
            (typeof user?.email === "string" && user.email) || (typeof token.email === "string" && token.email);
          if (emailRaw) {
            const emailNorm = emailRaw.toLowerCase().trim();
            const calUpdate: Record<string, unknown> = {
              google_calendar_connected: true,
              updated_at: new Date().toISOString(),
            };
            if (account.refresh_token) {
              calUpdate.google_calendar_refresh_token = account.refresh_token;
            }
            if (account.access_token) {
              calUpdate.google_calendar_access_token = account.access_token;
            }
            const acc = account as { expires_at?: number };
            if (acc.expires_at) {
              calUpdate.google_calendar_expires_at = acc.expires_at * 1000;
            }

            const { data: dbUser, error: updateError } = await supabase
              .from("users")
              .update(calUpdate)
              .eq("email", emailNorm)
              .select("id, role")
              .maybeSingle();

            if (!updateError && dbUser) {
              token.id = dbUser.id;
              token.role = dbUser.role as UserRole;
            }
          }
        } else if (user) {
          token.id = user.id;
          token.role = user.role;
        } else if (token.email && !token.id) {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id, role")
            .eq("email", String(token.email).toLowerCase().trim())
            .maybeSingle();

          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role as UserRole;
          }
        }

        return token;
      } catch (error) {
        console.error("JWT callback error:", error);
        return token;
      }
    },

    async session({ session, token }) {
      try {
        if (session.user) {
          session.user.id = token.id || "";
          session.user.role = token.role || "student";
        }

        return session;
      } catch (error) {
        console.error("Session callback error:", error);
        return session;
      }
    },
  },
};
