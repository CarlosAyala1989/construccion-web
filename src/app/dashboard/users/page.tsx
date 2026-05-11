"use client";

import { useState, useEffect } from "react";

type Workspace = {
  id: string;
  name: string;
  cloudPath: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  workspaces: Workspace[];
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);

  // Password Reset Modal
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    fetchUsers();
    fetchWorkspaces();
  }, []);

  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data);
    setIsLoading(false);
  };

  const fetchWorkspaces = async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    setWorkspaces(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role: "EMPLOYEE", workspaceIds: selectedWorkspaces }),
    });

    if (res.ok) {
      setName("");
      setEmail("");
      setPassword("");
      setSelectedWorkspaces([]);
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Error al crear usuario.");
    }
  };

  const toggleUserStatus = async (id: string, currentStatus: boolean) => {
    const action = currentStatus ? "dar de baja" : "reactivar";
    if (!confirm(`¿Deseas ${action} a este usuario?`)) return;

    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !currentStatus }),
    });

    if (res.ok) {
      fetchUsers();
    } else {
      alert("Error al actualizar el estado del usuario.");
    }
  };

  const toggleWorkspace = (id: string) => {
    setSelectedWorkspaces(prev => 
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const openResetModal = (userId: string, userName: string) => {
    setResetUserId(userId);
    setResetUserName(userName);
    setNewPassword("");
    setResetMessage("");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId) return;

    const res = await fetch(`/api/users/${resetUserId}/reset-password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (res.ok) {
      setResetMessage("✅ Contraseña actualizada exitosamente.");
      setNewPassword("");
      setTimeout(() => {
        setResetUserId(null);
        setResetMessage("");
      }, 2000);
    } else {
      const data = await res.json();
      setResetMessage(`❌ ${data.error || "Error al resetear contraseña."}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Password Reset Modal */}
      {resetUserId && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Forzar Rotación de Contraseña
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Resetear contraseña de: <strong>{resetUserName}</strong>
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              {resetMessage && (
                <div className={`text-sm p-3 rounded-md ${resetMessage.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {resetMessage}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                >
                  Cambiar Contraseña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Gestión de Empleados y Seguridad (Zero Trust)</h3>
        <p className="mt-2 text-sm text-gray-500">
          Crea empleados manualmente y asigna sus espacios de trabajo. No se permiten registros automáticos.
          Puedes forzar la rotación de contraseñas en cualquier momento.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-4">Crear Nuevo Empleado</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Correo (Usuario)</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña Inicial</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Asignar Espacios de Trabajo</label>
              {workspaces.length === 0 ? (
                <p className="text-xs text-red-500">No hay espacios creados. Créalos primero.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto border p-2 rounded-md bg-white">
                  {workspaces.map(ws => (
                    <label key={ws.id} className="flex items-center space-x-2 text-sm text-gray-900">
                      <input 
                        type="checkbox" 
                        checked={selectedWorkspaces.includes(ws.id)}
                        onChange={() => toggleWorkspace(ws.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                      />
                      <span>{ws.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-indigo-700">
              Crear Credenciales
            </button>
          </form>
        </div>

        <div className="md:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h4 className="text-md font-medium text-gray-900">Directorio de Usuarios</h4>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado / Rol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espacios (Silos)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">Cargando...</td></tr>
              ) : users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.isActive ? 'Activo' : 'Baja (Soft Delete)'}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">{user.role}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.workspaces.map(ws => (
                        <span key={ws.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {ws.name}
                        </span>
                      ))}
                      {user.workspaces.length === 0 && <span className="text-xs text-gray-400">Sin acceso</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    {user.role !== 'ADMIN' && (
                      <>
                        <button
                          onClick={() => openResetModal(user.id, user.name)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Resetear Clave
                        </button>
                        <button 
                          onClick={() => toggleUserStatus(user.id, user.isActive)}
                          className={`${user.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          {user.isActive ? 'Dar de Baja' : 'Reactivar'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
