"use client";

import { useState, useEffect } from "react";

type Workspace = {
  id: string;
  name: string;
  cloudPath: string;
};

type PasswordGrant = {
  id: string;
  workspaceId: string;
  credentialKey: string;
  sourceType: string;
  label: string;
};

type PasswordOption = {
  credentialKey: string;
  workspaceId: string;
  workspaceName: string;
  sourceType: "DEFAULT" | "POLICY";
  label: string;
  policyType: string | null;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  accessRole: "WEB_VIEWER" | "DESKTOP_SCANNER";
  documentAccessMode: "GLOBAL" | "PASSWORD_SCOPED";
  workspaces: Workspace[];
  documentPasswordGrants: PasswordGrant[];
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
  const [accessRole, setAccessRole] = useState<"WEB_VIEWER" | "DESKTOP_SCANNER">("DESKTOP_SCANNER");
  const [documentAccessMode, setDocumentAccessMode] = useState<"GLOBAL" | "PASSWORD_SCOPED">("PASSWORD_SCOPED");
  const [passwordGrantKeys, setPasswordGrantKeys] = useState<string[]>([]);
  const [passwordOptions, setPasswordOptions] = useState<PasswordOption[]>([]);

  // Password Reset Modal
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  // Document Access Modal
  const [editingAccessUser, setEditingAccessUser] = useState<User | null>(null);
  const [editWorkspaceIds, setEditWorkspaceIds] = useState<string[]>([]);
  const [editAccessRole, setEditAccessRole] = useState<"WEB_VIEWER" | "DESKTOP_SCANNER">("DESKTOP_SCANNER");
  const [editAccessMode, setEditAccessMode] = useState<"GLOBAL" | "PASSWORD_SCOPED">("PASSWORD_SCOPED");
  const [editGrantKeys, setEditGrantKeys] = useState<string[]>([]);
  const [editPasswordOptions, setEditPasswordOptions] = useState<PasswordOption[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    loadPasswordOptions(selectedWorkspaces).then(options => {
      setPasswordOptions(options);
      setPasswordGrantKeys(prev => keepValidGrantKeys(prev, options));
    });
  }, [selectedWorkspaces]);

  useEffect(() => {
    if (!editingAccessUser) return;

    loadPasswordOptions(editWorkspaceIds).then(options => {
      setEditPasswordOptions(options);
      setEditGrantKeys(prev => keepValidGrantKeys(prev, options));
    });
  }, [editingAccessUser, editWorkspaceIds]);

  async function fetchUsers() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data);
    setIsLoading(false);
  }

  async function fetchWorkspaces() {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    setWorkspaces(data);
  }

  async function loadPasswordOptions(workspaceIds: string[]) {
    if (workspaceIds.length === 0) return [];

    const params = new URLSearchParams();
    workspaceIds.forEach(id => params.append("workspaceId", id));
    const res = await fetch(`/api/document-password-options?${params.toString()}`);
    if (!res.ok) return [];

    return res.json() as Promise<PasswordOption[]>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role: "EMPLOYEE",
        accessRole,
        workspaceIds: selectedWorkspaces,
        documentAccessMode,
        passwordGrantKeys: accessRole === "WEB_VIEWER" && documentAccessMode !== "GLOBAL" ? passwordGrantKeys : [],
      }),
    });

    if (res.ok) {
      setName("");
      setEmail("");
      setPassword("");
      setSelectedWorkspaces([]);
      setAccessRole("DESKTOP_SCANNER");
      setDocumentAccessMode("PASSWORD_SCOPED");
      setPasswordGrantKeys([]);
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

  const togglePasswordGrant = (credentialKey: string) => {
    setPasswordGrantKeys(prev =>
      prev.includes(credentialKey) ? prev.filter(key => key !== credentialKey) : [...prev, credentialKey]
    );
  };

  const toggleEditWorkspace = (id: string) => {
    setEditWorkspaceIds(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const toggleEditPasswordGrant = (credentialKey: string) => {
    setEditGrantKeys(prev =>
      prev.includes(credentialKey) ? prev.filter(key => key !== credentialKey) : [...prev, credentialKey]
    );
  };

  const openResetModal = (userId: string, userName: string) => {
    setResetUserId(userId);
    setResetUserName(userName);
    setNewPassword("");
    setResetMessage("");
  };

  const openAccessModal = (user: User) => {
    setEditingAccessUser(user);
    setEditWorkspaceIds(user.workspaces.map(ws => ws.id));
    setEditAccessRole(user.accessRole || "DESKTOP_SCANNER");
    setEditAccessMode(user.documentAccessMode || "PASSWORD_SCOPED");
    setEditGrantKeys(user.documentPasswordGrants?.map(grant => grant.credentialKey) || []);
  };

  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccessUser) return;

    setIsSavingAccess(true);
    const res = await fetch(`/api/users/${editingAccessUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceIds: editWorkspaceIds,
        accessRole: editAccessRole,
        documentAccessMode: editAccessMode,
        passwordGrantKeys: editAccessRole === "WEB_VIEWER" && editAccessMode !== "GLOBAL" ? editGrantKeys : [],
      }),
    });

    setIsSavingAccess(false);
    if (res.ok) {
      setEditingAccessUser(null);
      fetchUsers();
    } else {
      alert("Error al actualizar el acceso documental.");
    }
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

  function keepValidGrantKeys(currentKeys: string[], options: PasswordOption[]) {
    const allowedKeys = new Set(options.map(option => option.credentialKey));
    const byWorkspace = new Map(options.map(option => [option.credentialKey, option.workspaceId]));
    const nextKeys = currentKeys.filter(key => allowedKeys.has(key));
    const coveredWorkspaces = new Set(nextKeys.map(key => byWorkspace.get(key)).filter(Boolean));

    for (const option of options) {
      if (option.sourceType === "DEFAULT" && !coveredWorkspaces.has(option.workspaceId)) {
        nextKeys.push(option.credentialKey);
        coveredWorkspaces.add(option.workspaceId);
      }
    }

    return [...new Set(nextKeys)];
  }

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

      {/* Document Access Modal */}
      {editingAccessUser && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-xl max-h-[88vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Editar acceso documental
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Usuario: <strong>{editingAccessUser.name}</strong>
            </p>
            <form onSubmit={handleSaveAccess} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Espacios asignados</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-3 rounded-md bg-white">
                  {workspaces.map(ws => (
                    <label key={ws.id} className="flex items-center space-x-2 text-sm text-gray-900">
                      <input
                        type="checkbox"
                        checked={editWorkspaceIds.includes(ws.id)}
                        onChange={() => toggleEditWorkspace(ws.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                      />
                      <span>{ws.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de cuenta</label>
                <select
                  value={editAccessRole}
                  onChange={e => setEditAccessRole(e.target.value as "WEB_VIEWER" | "DESKTOP_SCANNER")}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                >
                  <option value="DESKTOP_SCANNER">Operador de escritorio (escaneo)</option>
                  <option value="WEB_VIEWER">Visor web (jefatura/directivo)</option>
                </select>
              </div>

              {editAccessRole === "WEB_VIEWER" && (
                <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Modo del visor</label>
                <select
                  value={editAccessMode}
                  onChange={e => setEditAccessMode(e.target.value as "GLOBAL" | "PASSWORD_SCOPED")}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                >
                  <option value="PASSWORD_SCOPED">Por contraseña autorizada</option>
                  <option value="GLOBAL">Global dentro de sus espacios</option>
                </select>
              </div>

              {editAccessMode === "PASSWORD_SCOPED" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contraseñas autorizadas</label>
                  {editPasswordOptions.length === 0 ? (
                    <p className="text-xs text-red-500">No hay contraseñas disponibles para los espacios seleccionados.</p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto border p-3 rounded-md bg-white">
                      {editPasswordOptions.map(option => (
                        <label key={option.credentialKey} className="flex items-start space-x-2 text-sm text-gray-900">
                          <input
                            type="checkbox"
                            checked={editGrantKeys.includes(option.credentialKey)}
                            onChange={() => toggleEditPasswordGrant(option.credentialKey)}
                            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                          />
                          <span>
                            <span className="font-medium">{option.label}</span>
                            <span className="block text-xs text-gray-500">{option.sourceType === "DEFAULT" ? "Contraseña base" : option.policyType}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
                </>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingAccessUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAccess}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {isSavingAccess ? "Guardando..." : "Guardar acceso"}
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
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de cuenta</label>
              <select
                value={accessRole}
                onChange={e => setAccessRole(e.target.value as "WEB_VIEWER" | "DESKTOP_SCANNER")}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
              >
                <option value="DESKTOP_SCANNER">Operador de escritorio (escaneo)</option>
                <option value="WEB_VIEWER">Visor web (jefatura/directivo)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                El operador usa la aplicación de escritorio. El visor web solo puede entrar a la página de documentos.
              </p>
            </div>
            {accessRole === "WEB_VIEWER" && (
              <>
            <div>
              <label className="block text-sm font-medium text-gray-700">Modo del visor documental</label>
              <select
                value={documentAccessMode}
                onChange={e => setDocumentAccessMode(e.target.value as "GLOBAL" | "PASSWORD_SCOPED")}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
              >
                <option value="PASSWORD_SCOPED">Por contraseña autorizada</option>
                <option value="GLOBAL">Global dentro de sus espacios</option>
              </select>
            </div>
            {documentAccessMode === "PASSWORD_SCOPED" && selectedWorkspaces.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contraseñas autorizadas</label>
                {passwordOptions.length === 0 ? (
                  <p className="text-xs text-red-500">No hay contraseñas disponibles.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border p-2 rounded-md bg-white">
                    {passwordOptions.map(option => (
                      <label key={option.credentialKey} className="flex items-start space-x-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          checked={passwordGrantKeys.includes(option.credentialKey)}
                          onChange={() => togglePasswordGrant(option.credentialKey)}
                          className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                        />
                        <span>
                          <span className="font-medium">{option.label}</span>
                          <span className="block text-xs text-gray-500">{option.sourceType === "DEFAULT" ? "Contraseña base" : option.policyType}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
              </>
            )}
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
                    <div className="text-xs text-gray-500 mt-1">
                      {user.accessRole === "WEB_VIEWER" ? "Visor web" : "Operador escritorio"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {user.accessRole === "WEB_VIEWER"
                        ? user.documentAccessMode === "GLOBAL" ? "Acceso global" : `${user.documentPasswordGrants?.length || 0} contraseña(s)`
                        : "Sin acceso web a documentos"}
                    </div>
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
                          onClick={() => openAccessModal(user)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Editar Acceso
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
