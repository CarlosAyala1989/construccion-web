import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcrypt";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@empresa.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Credenciales inválidas.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) {
          throw new Error("El usuario no existe.");
        }

        if (!user.isActive) {
          throw new Error("Esta cuenta ha sido desactivada.");
        }

        if (user.role !== "ADMIN" && user.accessRole === "DESKTOP_SCANNER") {
          throw new Error("Esta cuenta es solo para la aplicación de escritorio.");
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error("Contraseña incorrecta.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accessRole: user.accessRole,
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 Days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessRole = user.accessRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.accessRole = token.accessRole;
      }
      return session;
    }
  },
  pages: {
    signIn: "/", // The root page will act as the login page for the administrator
  },
  secret: process.env.NEXTAUTH_SECRET,
};
