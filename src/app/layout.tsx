/**
 * Componente principal layout para la navegación y renderización de la aplicación.
 */
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: {
    default: "DocuZen",
    template: "%s · DocuZen",
  },
  description: "Gestión segura de documentos, accesos y trazabilidad.",
};

/** Renderiza RootLayout y coordina su funcionamiento en la interfaz. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
