/**
 * Contratos de tipos TypeScript para next autenticación.
 */
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  /** Define los datos de sesión. */
  interface Session {
    user: {
      id: string
      role: string
      accessRole: string
    } & DefaultSession["user"]
  }

  /** Define los datos de usuario. */
  interface User {
    id: string
    role: string
    accessRole: string
  }
}

declare module "next-auth/jwt" {
  /** Define los datos de jwt. */
  interface JWT {
    id: string
    role: string
    accessRole: string
  }
}
