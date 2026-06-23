"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!session) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h1 className="text-xl font-bold text-indigo-600">Gobernanza</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Panel</p>
        </div>
        <nav className="mt-6 space-y-1">
          <Link
            href="/dashboard"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Resumen
          </Link>
          <Link
            href="/documents"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/documents"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Documentos Web
          </Link>
          <Link
            href="/dashboard/workspaces"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard/workspaces"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Espacios de Trabajo
          </Link>
          <Link
            href="/dashboard/users"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard/users"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Usuarios y Roles
          </Link>
          <Link
            href="/dashboard/policies"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard/policies"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Políticas de Seguridad
          </Link>
          <Link
            href="/dashboard/config"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard/config"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Configuración
          </Link>
          <Link
            href="/dashboard/logs"
            className={`block px-6 py-2 text-sm font-medium ${
              pathname === "/dashboard/logs"
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Auditoría Forense
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between bg-white px-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-800">
            Bienvenido, {session.user?.name || "Administrador"}
          </h2>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm font-medium text-gray-600 hover:text-red-600"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* Main View */}
        <main className="flex-1 overflow-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
