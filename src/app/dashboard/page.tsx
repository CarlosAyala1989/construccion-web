"use client";

import { AppIcon } from "@/components/AppIcon";
import Link from "next/link";
import { useEffect, useState } from "react";

type RecentLog = {
  id: string;
  userName: string | null;
  action: string;
  status: string;
  createdAt: string;
  workspace: { name: string } | null;
};

type Stats = {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalWorkspaces: number;
  totalPolicies: number;
  totalLogs: number;
  successLogs: number;
  failureLogs: number;
  recentLogs: RecentLog[];
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(response => response.json())
      .then(data => setStats(data))
      .finally(() => setIsLoading(false));
  }, []);

  const formatDate = (date: string) => new Date(date).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isLoading) {
    return (
      <div className="empty-state" role="status">
        <div><span className="spinner" aria-hidden="true" /> Cargando resumen…</div>
      </div>
    );
  }

  const metrics = [
    {
      label: "Usuarios activos",
      value: stats?.activeUsers ?? 0,
      note: `${stats?.inactiveUsers ?? 0} cuentas desactivadas`,
      icon: "users" as const,
    },
    {
      label: "Espacios de trabajo",
      value: stats?.totalWorkspaces ?? 0,
      note: "Áreas documentales configuradas",
      icon: "workspaces" as const,
    },
    {
      label: "Políticas activas",
      value: stats?.totalPolicies ?? 0,
      note: "Reglas de protección configuradas",
      icon: "shield" as const,
    },
    {
      label: "Eventos registrados",
      value: stats?.totalLogs ?? 0,
      note: `${stats?.successLogs ?? 0} correctos · ${stats?.failureLogs ?? 0} con error`,
      icon: "activity" as const,
    },
  ];

  return (
    <div>
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">Vista general</p>
          <h1>Todo bajo control.</h1>
          <p>Revisa el estado de la plataforma y accede a las tareas más frecuentes.</p>
        </div>
        <Link href="/documents" className="primary-button">
          Abrir documentos
          <AppIcon name="chevronRight" />
        </Link>
      </header>

      <section className="metrics-grid" aria-label="Indicadores principales">
        {metrics.map(metric => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-card-top">
              <span className="metric-card-label">{metric.label}</span>
              <span className="metric-icon"><AppIcon name={metric.icon} /></span>
            </div>
            <p className="metric-card-value">{metric.value}</p>
            <p className="metric-card-note">{metric.note}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="activity-title">
          <div className="panel-header">
            <h2 id="activity-title">Actividad reciente</h2>
            <Link href="/dashboard/logs" className="panel-link">Ver historial completo</Link>
          </div>
          {!stats?.recentLogs?.length ? (
            <div className="empty-state">
              <p>Aún no hay actividad. Los eventos aparecerán cuando el equipo use la plataforma.</p>
            </div>
          ) : (
            <div className="activity-list">
              {stats.recentLogs.map(log => (
                <div className="activity-row" key={log.id}>
                  <span className={`activity-status ${log.status === "SUCCESS" ? "" : "failure"}`} aria-label={log.status === "SUCCESS" ? "Correcto" : "Con error"} />
                  <div className="activity-main">
                    <strong>{log.action}</strong>
                    <span>{log.userName || "Sistema"}{log.workspace ? ` · ${log.workspace.name}` : ""}</span>
                  </div>
                  <time className="activity-meta" dateTime={log.createdAt}>{formatDate(log.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="quick-links-title">
          <div className="panel-header">
            <h2 id="quick-links-title">Accesos rápidos</h2>
          </div>
          <div className="quick-links">
            <QuickLink href="/documents" icon="documents" title="Documentos" description="Consulta y protege archivos" />
            <QuickLink href="/dashboard/users" icon="users" title="Usuarios" description="Administra roles y permisos" />
            <QuickLink href="/dashboard/workspaces" icon="workspaces" title="Espacios" description="Organiza áreas de trabajo" />
            <QuickLink href="/dashboard/policies" icon="shield" title="Políticas" description="Define reglas de protección" />
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: "documents" | "users" | "workspaces" | "shield";
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="quick-link">
      <span className="quick-link-icon"><AppIcon name={icon} /></span>
      <span className="quick-link-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <AppIcon name="chevronRight" />
    </Link>
  );
}
