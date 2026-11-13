"use client";
/**
 * Componente visual Providers: administra su presentación y eventos de usuario.
 */

import { SessionProvider } from "next-auth/react";

/** Renderiza Providers y coordina su funcionamiento en la interfaz. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
