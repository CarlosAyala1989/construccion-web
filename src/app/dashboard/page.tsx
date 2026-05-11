"use client";

import { useState, useEffect } from "react";

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
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("es-MX", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando estadísticas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Panel de Control Principal</h3>
        <p className="mt-2 text-sm text-gray-500">
          Desde aquí puedes gestionar las políticas globales de seguridad, usuarios y revisar la auditoría forense.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Usuarios Activos</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.activeUsers ?? 0}</p>
          <p className="mt-1 text-sm text-gray-500">
            {stats?.inactiveUsers ?? 0} desactivados (Soft Delete)
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Espacios de Trabajo</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.totalWorkspaces ?? 0}</p>
          <p className="mt-1 text-sm text-gray-500">Silos lógicos configurados</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Reglas de Seguridad</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.totalPolicies ?? 0}</p>
          <p className="mt-1 text-sm text-gray-500">Políticas criptográficas activas</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Registros de Auditoría</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.totalLogs ?? 0}</p>
          <div className="mt-1 flex space-x-3 text-sm">
            <span className="text-green-600">✓ {stats?.successLogs ?? 0}</span>
            <span className="text-red-600">✗ {stats?.failureLogs ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h4 className="text-md font-medium text-gray-900">Actividad Reciente</h4>
        </div>
        <div className="divide-y divide-gray-100">
          {(!stats?.recentLogs || stats.recentLogs.length === 0) ? (
            <div className="p-6 text-center text-sm text-gray-500">
              No hay actividad registrada aún. Los registros aparecerán aquí cuando el cliente de escritorio sincronice operaciones.
            </div>
          ) : (
            stats.recentLogs.map(log => (
              <div key={log.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  <span className={`w-2 h-2 rounded-full ${log.status === 'SUCCESS' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{log.action}</p>
                    <p className="text-xs text-gray-500">{log.userName || "Sistema"}</p>
                  </div>
                </div>
                <div className="text-right">
                  {log.workspace && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                      {log.workspace.name}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(log.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
