"use client";

import { useCallback, useEffect, useState } from "react";

type AuditLog = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  details: string;
  status: string;
  workspaceId: string | null;
  workspace: { name: string } | null;
  createdAt: string;
};

type Workspace = {
  id: string;
  name: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });

  // Filters
  const [filterUserId, setFilterUserId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWorkspaceId, setFilterWorkspaceId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(pagination.page));
    params.set("limit", String(pagination.limit));
    if (filterUserId) params.set("userId", filterUserId);
    if (filterStatus) params.set("status", filterStatus);
    if (filterWorkspaceId) params.set("workspaceId", filterWorkspaceId);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);

    const res = await fetch(`/api/logs?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    }
    setIsLoading(false);
  }, [filterDateFrom, filterDateTo, filterStatus, filterUserId, filterWorkspaceId, pagination.limit, pagination.page]);

  useEffect(() => {
    let active = true;
    void Promise.all([fetch("/api/workspaces"), fetch("/api/users")])
      .then(async ([workspaceResponse, userResponse]) => {
        const [workspaceData, userData] = await Promise.all([
          workspaceResponse.ok ? workspaceResponse.json() : [],
          userResponse.ok ? userResponse.json() : [],
        ]);
        if (!active) return;
        setWorkspaces(workspaceData);
        setUsers(userData);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchLogs());
  }, [fetchLogs]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterUserId) params.set("userId", filterUserId);
    if (filterStatus) params.set("status", filterStatus);
    if (filterWorkspaceId) params.set("workspaceId", filterWorkspaceId);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);

    window.open(`/api/logs/export?${params.toString()}`, "_blank");
  };

  const resetFilters = () => {
    setFilterUserId("");
    setFilterStatus("");
    setFilterWorkspaceId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const parseDetails = (details: string): string => {
    try {
      const parsed = JSON.parse(details);
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");
    } catch {
      return details;
    }
  };

  return (
    <div className="admin-page space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Historial de actividad</h3>
            <p className="mt-2 text-sm text-gray-500">
              Consulta las operaciones realizadas y filtra por fecha, usuario, espacio o resultado.
            </p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-4">Filtros de búsqueda</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
            <select
              value={filterUserId}
              onChange={e => { setFilterUserId(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 border text-gray-900 bg-white"
            >
              <option value="">Todos</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 border text-gray-900 bg-white"
            >
              <option value="">Todos</option>
              <option value="SUCCESS">Éxito</option>
              <option value="FAILURE">Fallo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Espacio</label>
            <select
              value={filterWorkspaceId}
              onChange={e => { setFilterWorkspaceId(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 border text-gray-900 bg-white"
            >
              <option value="">Todos</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 border text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 border text-gray-900 bg-white"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={resetFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Limpiar Filtros
          </button>
          <span className="text-xs text-gray-500">
            {pagination.total} registros encontrados
          </span>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detalle del Registro</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500">ID</dt>
                <dd className="text-sm text-gray-900 font-mono">{selectedLog.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Fecha</dt>
                <dd className="text-sm text-gray-900">{formatDate(selectedLog.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Usuario</dt>
                <dd className="text-sm text-gray-900">{selectedLog.userName || selectedLog.userId || "Sistema"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Acción</dt>
                <dd className="text-sm text-gray-900">{selectedLog.action}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Estado</dt>
                <dd>
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${selectedLog.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {selectedLog.status === "SUCCESS" ? "Éxito" : "Fallo"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Espacio de Trabajo</dt>
                <dd className="text-sm text-gray-900">{selectedLog.workspace?.name || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Detalles</dt>
                <dd className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded-md border mt-1 font-mono text-xs">
                  {parseDetails(selectedLog.details)}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espacio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Detalle</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">Cargando registros...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No se encontraron registros con los filtros actuales.</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(log.createdAt)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.userName || log.userId || "Sistema"}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">{log.action}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {log.workspace ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {log.workspace.name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {log.status === "SUCCESS" ? "Éxito" : "Fallo"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white px-6 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Página {pagination.page} de {pagination.totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-gray-700"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-gray-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
