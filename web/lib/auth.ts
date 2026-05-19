
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
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

          await connectDB();

          const user = await User.findOne({
            email: credentials.email,
          });

          if (!user || !user.password) {
            throw new Error("Invalid email or password");
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isValid) {
            throw new Error("Invalid email or password");
          }

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            image: user.image || null,
            role: user.role,
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
        await connectDB();

        if (account?.provider === "google") {
          const emailRaw = user.email || "";
          const emailNorm = emailRaw.toLowerCase().trim();
          const existingUser = await User.findOne({
            email: { $regex: new RegExp(`^${emailRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          });

          if (!existingUser) {
            const createdUser = await User.create({
              name: user.name,
              email: emailNorm || emailRaw,
              image: user.image,
              role: "student",
            });

            user.id = createdUser._id.toString();
            user.role = createdUser.role;
          } else {
            user.id = existingUser._id.toString();
            user.role = existingUser.role;
          }

          const calUpdate: Record<string, string | number | boolean | undefined> = {
            googleCalendarConnected: true,
          };
          if (account.refresh_token) {
            calUpdate.googleCalendarRefreshToken = account.refresh_token;
          }
          if (account.access_token) {
            calUpdate.googleCalendarAccessToken = account.access_token;
          }
          const acc = account as { expires_at?: number };
          if (acc.expires_at) {
            calUpdate.googleCalendarAccessTokenExpires = acc.expires_at * 1000;
          }
          await User.findByIdAndUpdate(user.id, calUpdate);
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
          await connectDB();
          const emailRaw =
            (typeof user?.email === "string" && user.email) || (typeof token.email === "string" && token.email);
          if (emailRaw) {
            const escaped = emailRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const calUpdate: Record<string, string | number | boolean> = {
              googleCalendarConnected: true,
            };
            if (account.refresh_token) {
              calUpdate.googleCalendarRefreshToken = account.refresh_token;
            }
            if (account.access_token) {
              calUpdate.googleCalendarAccessToken = account.access_token;
            }
            const acc = account as { expires_at?: number };
            if (acc.expires_at) {
              calUpdate.googleCalendarAccessTokenExpires = acc.expires_at * 1000;
            }

            const dbUser = await User.findOneAndUpdate(
              { email: { $regex: new RegExp(`^${escaped}$`, "i") } },
              { $set: calUpdate },
              { new: true }
            );

            if (dbUser) {
              token.id = dbUser._id.toString();
              token.role = dbUser.role;
            }
          }
        } else if (user) {
          token.id = user.id;
          token.role = user.role;
        } else if (token.email && !token.id) {
          await connectDB();
          const t = String(token.email);
          const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const dbUser = await User.findOne({ email: { $regex: new RegExp(`^${esc}$`, "i") } }).select("_id role");
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.role = dbUser.role;
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

