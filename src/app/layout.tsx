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
