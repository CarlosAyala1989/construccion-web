"use client";

import { AppIcon } from "@/components/AppIcon";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const navigation = [
  { href: "/dashboard", label: "Resumen", icon: "home" as const },
  { href: "/documents", label: "Documentos", icon: "documents" as const },
  { href: "/dashboard/workspaces", label: "Espacios de trabajo", icon: "workspaces" as const },
  { href: "/dashboard/users", label: "Usuarios y accesos", icon: "users" as const },
  { href: "/dashboard/policies", label: "Políticas de protección", icon: "shield" as const },
  { href: "/dashboard/logs", label: "Historial de actividad", icon: "activity" as const },
  { href: "/dashboard/config", label: "Configuración", icon: "settings" as const },
];

const titles: Record<string, string> = {
  "/dashboard": "Resumen",
  "/dashboard/workspaces": "Espacios de trabajo",
  "/dashboard/users": "Usuarios y accesos",
  "/dashboard/policies": "Políticas de protección",
  "/dashboard/logs": "Historial de actividad",
  "/dashboard/config": "Configuración",
};

function initials(name?: string | null) {
  if (!name) return "AD";
  return name
    .split(" ")
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const currentTitle = useMemo(() => titles[pathname] || "Administración", [pathname]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [router, status]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  if (status === "loading") {
    return (
      <div className="loading-state" role="status">
        <div><span className="spinner" aria-hidden="true" /> Preparando tu espacio…</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="admin-shell">
      {isMenuOpen && (
        <button
          type="button"
          className="mobile-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${isMenuOpen ? "open" : ""}`} aria-label="Navegación principal">
        <div className="sidebar-header">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="sidebar-brand-title">Gobernanza</p>
            <p className="sidebar-brand-subtitle">Administración documental</p>
          </div>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <AppIcon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-nav-label">Gestión</p>
          {navigation.slice(0, 6).map(item => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
                <AppIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <p className="sidebar-nav-label">Sistema</p>
          {navigation.slice(6).map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
                <AppIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-session">
            <span className="avatar" aria-hidden="true">{initials(session.user?.name)}</span>
            <div className="sidebar-session-copy">
              <strong>{session.user?.name || "Administrador"}</strong>
              <span>{session.user?.email || "Sesión activa"}</span>
            </div>
          </div>
          <button type="button" className="signout-button" onClick={() => signOut({ callbackUrl: "/" })}>
            <AppIcon name="logout" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            type="button"
            className="icon-button menu-button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={isMenuOpen}
          >
            <AppIcon name="menu" />
          </button>
          <div className="topbar-title">
            <span>Administración</span>
            <strong>{currentTitle}</strong>
          </div>
          <span className="topbar-pill">Sistema operativo</span>
        </header>
        <main className="admin-main" id="main-content">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
