"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import DriveFolderBrowser from "@/components/DriveFolderBrowser";
import { AppIcon } from "@/components/AppIcon";

type User = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

type Workspace = {
  id: string;
  name: string;
  cloudPath: string;
  cloudFolderId?: string | null;
  cloudRefreshToken?: string | null;
  defaultPassword: string;
  users?: User[];
};

type UserApiItem = User & {
  role: string;
  workspaces?: Array<Pick<Workspace, "id">>;
};

type DriveOauthConfig = {
  clientId?: string;
  isConfigured?: boolean;
};

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState("");
  const [isGoogleOauthConfigured, setIsGoogleOauthConfigured] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [cloudPath, setCloudPath] = useState("");
  const [cloudFolderId, setCloudFolderId] = useState("");
  const [cloudRefreshToken, setCloudRefreshToken] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");

  // Folder Picker Modal State
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"local" | "gdrive" | "dropbox">("local");
  const [localPath, setLocalPath] = useState("");
  const [dropboxPath, setDropboxPath] = useState("");

  // Google Drive Browser Modal
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [reconnectingWorkspace, setReconnectingWorkspace] = useState<Workspace | null>(null);
  const [isReconnectingDrive, setIsReconnectingDrive] = useState(false);

  // Assignment Modal State
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const fetchWorkspaces = async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json() as Workspace[];
    setWorkspaces(data);
    setIsLoading(false);
  };

  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    const data = await res.json() as UserApiItem[];
    setAllUsers(data.filter(user => user.role !== "ADMIN"));
  };

  const fetchDriveOauthConfig = async () => {
    const res = await fetch("/api/drive/oauth-config");
    if (!res.ok) return;

    const data = await res.json() as DriveOauthConfig;
    setGoogleClientId(data.clientId || "");
    setIsGoogleOauthConfigured(Boolean(data.isConfigured));
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchWorkspaces();
      fetchUsers();
      fetchDriveOauthConfig();
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        cloudPath,
        defaultPassword,
        cloudFolderId: cloudFolderId || null,
        cloudRefreshToken: cloudRefreshToken || null,
      }),
    });

    if (res.ok) {
      setName("");
      setCloudPath("");
      setCloudFolderId("");
      setCloudRefreshToken("");
      setDefaultPassword("");
      fetchWorkspaces();
    } else {
      alert("Error al crear espacio de trabajo.");
    }
  };

  const openAssignModal = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    fetch(`/api/users`)
      .then(res => res.json())
      .then((data: UserApiItem[]) => {
        const assignedUserIds = data
          .filter(user => user.workspaces?.some(ws => ws.id === workspace.id))
          .map(user => user.id);
        setSelectedUserIds(assignedUserIds);
      });
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkspace) return;

    const res = await fetch(`/api/workspaces/${editingWorkspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: selectedUserIds }),
    });

    if (res.ok) {
      setEditingWorkspace(null);
      fetchWorkspaces();
      alert("Usuarios asignados correctamente.");
    } else {
      alert("Error al asignar usuarios.");
    }
  };

  // ─── Folder Picker Logic ─────────────────────
  const openFolderPicker = () => {
    setLocalPath("");
    setDropboxPath("");
    setPickerTab("local");
    setShowFolderPicker(true);
  };

  const confirmLocalSelection = () => {
    const path = localPath.trim();
    if (!path) {
      alert("Ingresa una ruta local válida.");
      return;
    }
    setCloudPath(`LOCAL: ${path}`);
    setCloudFolderId("");
    setCloudRefreshToken("");
    setShowFolderPicker(false);
  };

  const confirmDropboxSelection = () => {
    const path = dropboxPath.trim();
    if (!path) {
      alert("Ingresa la ruta de Dropbox.");
      return;
    }
    setCloudPath(`Dropbox: ${path}`);
    setCloudFolderId("");
    setCloudRefreshToken("");
    setShowFolderPicker(false);
  };

  const handleDriveSelect = (path: string, folderId: string, driveRefreshToken: string | null) => {
    if (!driveRefreshToken) {
      alert("Google no devolvió refresh token. Revoca el acceso de la app en tu cuenta Google y vuelve a conectar Drive.");
      return;
    }

    if (reconnectingWorkspace) {
      reconnectDriveWorkspace(reconnectingWorkspace.id, path, folderId, driveRefreshToken);
      return;
    }

    setCloudPath(path);
    setCloudFolderId(folderId);
    setCloudRefreshToken(driveRefreshToken);
    setShowFolderPicker(false);
    setShowDriveBrowser(false);
  };

  const openDriveReconnect = (workspace: Workspace) => {
    setReconnectingWorkspace(workspace);
    setShowDriveBrowser(true);
  };

  const reconnectDriveWorkspace = async (workspaceId: string, path: string, folderId: string, driveRefreshToken: string) => {
    setIsReconnectingDrive(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudPath: path,
          cloudFolderId: folderId,
          cloudRefreshToken: driveRefreshToken,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "No se pudo reconectar Google Drive.");
        return;
      }

      setReconnectingWorkspace(null);
      setShowDriveBrowser(false);
      fetchWorkspaces();
      alert("Google Drive reconectado correctamente.");
    } catch {
      alert("No se pudo reconectar Google Drive.");
    } finally {
      setIsReconnectingDrive(false);
    }
  };

  // Common local folder suggestions
  const localSuggestions = [
    { label: "Escritorio", path: "~/Escritorio/Documentos_Gobernanza" },
    { label: "Documentos", path: "~/Documentos/Gobernanza" },
    { label: "Disco D:", path: "D:/Gobernanza_Documental" },
    { label: "Servidor NAS", path: "//servidor/compartido/Gobernanza" },
  ];

  const dropboxSuggestions = [
    { label: "Raíz", path: "/" },
    { label: "Empresa", path: "/Empresa" },
    { label: "Documentos", path: "/Documentos/Escaneados" },
  ];

  // Detect type from existing cloudPath for display
  const getPathBadge = (path: string) => {
    if (path.startsWith("LOCAL:")) return { label: "Local", color: "bg-emerald-100 text-emerald-800", icon: "workspaces" as const };
    if (path.startsWith("Google Drive:")) return { label: "Google Drive", color: "bg-blue-100 text-blue-800", icon: "upload" as const };
    if (path.startsWith("Dropbox:")) return { label: "Dropbox", color: "bg-indigo-100 text-indigo-800", icon: "documents" as const };
    if (path.startsWith("Drive:")) return { label: "Google Drive", color: "bg-blue-100 text-blue-800", icon: "upload" as const };
    return { label: "Ruta", color: "bg-gray-100 text-gray-700", icon: "folder" as const };
  };

  return (
    <div className="admin-page space-y-6">
      {/* Google Identity Services Script */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* ── Google Drive Browser Modal ────────────── */}
      <DriveFolderBrowser
        isOpen={showDriveBrowser}
        onClose={() => {
          setShowDriveBrowser(false);
          setReconnectingWorkspace(null);
        }}
        onSelect={handleDriveSelect}
        clientId={googleClientId}
      />

      {/* ── Folder Picker Modal ──────────────────── */}
      {showFolderPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFolderPicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-indigo-600 px-6 py-4 text-white">
              <h3 className="text-lg font-semibold">Seleccionar carpeta de destino</h3>
              <p className="text-sm text-indigo-200 mt-1">
                Elige dónde se guardarán los documentos procesados de este espacio.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setPickerTab("local")}
                className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                  pickerTab === "local"
                    ? "border-emerald-500 text-emerald-700 bg-emerald-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Carpeta local
              </button>
              <button
                onClick={() => setPickerTab("gdrive")}
                className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                  pickerTab === "gdrive"
                    ? "border-blue-500 text-blue-700 bg-blue-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Google Drive
              </button>
              <button
                onClick={() => setPickerTab("dropbox")}
                className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                  pickerTab === "dropbox"
                    ? "border-indigo-500 text-indigo-700 bg-indigo-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Dropbox
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6">

              {/* LOCAL TAB */}
              {pickerTab === "local" && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs text-emerald-800">
                      <strong>Modo Local:</strong> Los documentos procesados se guardarán en esta carpeta de la computadora del empleado.
                      Se aplicará la contraseña de encriptación a cada PDF según las políticas de seguridad configuradas.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ruta de la carpeta</label>
                    <input
                      type="text"
                      value={localPath}
                      onChange={e => setLocalPath(e.target.value)}
                      placeholder="Ej. C:/Documentos/Gobernanza o ~/Documentos/Empresa"
                      className="w-full rounded-lg border border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-sm p-3 text-gray-900 bg-white"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Sugerencias rápidas:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {localSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLocalPath(s.path)}
                          className="text-left p-2 rounded-lg border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                        >
                          <span className="text-xs font-medium text-gray-700">{s.label}</span>
                          <span className="block text-xs text-gray-400 truncate">{s.path}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* GOOGLE DRIVE TAB */}
              {pickerTab === "gdrive" && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-800">
                      <strong>Google Drive:</strong> Explora tu Drive, navega las carpetas y selecciona (o crea) 
                      la carpeta destino. El programa de escritorio subirá los documentos encriptados a esta ubicación.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowFolderPicker(false);
                      setTimeout(() => setShowDriveBrowser(true), 200);
                    }}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-blue-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-400 transition-all group"
                  >
                    <svg className="w-8 h-8 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                      <path d="M7.71 3.5L1.41 14l3.18 5.5h6.36L7.71 3.5zM9.93 14H4.24l2.85-4.93L9.93 14z" fill="#4285F4" />
                      <path d="M16.29 3.5h-8.58l3.18 5.5 3.17 5.5h6.36l-4.13-11z" fill="#EA4335" />
                      <path d="M4.59 19.5h14.82l-3.18-5.5H7.77l-3.18 5.5z" fill="#FBBC04" />
                    </svg>
                    <div className="text-left">
                      <span className="block font-semibold text-gray-900">Explorar Google Drive</span>
                      <span className="block text-xs text-gray-500">Navegar carpetas, crear nuevas y seleccionar destino</span>
                    </div>
                    <span className="text-blue-500 text-xl ml-auto">→</span>
                  </button>

                  {!isGoogleOauthConfigured && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-800">
                        <strong>Configuración pendiente:</strong> Para usar Google Drive, configura las credenciales OAuth
                        en Configuración o en las variables de entorno.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* DROPBOX TAB */}
              {pickerTab === "dropbox" && (
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-xs text-indigo-800">
                      <strong>Dropbox:</strong> Ingresa la ruta dentro de tu cuenta Dropbox.
                      Los documentos se encriptarán localmente antes de subirse.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ruta en Dropbox</label>
                    <input
                      type="text"
                      value={dropboxPath}
                      onChange={e => setDropboxPath(e.target.value)}
                      placeholder="Ej. /Empresa/Documentos_Escaneados"
                      className="w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-3 text-gray-900 bg-white"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Carpetas sugeridas:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {dropboxSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setDropboxPath(s.path)}
                          className="text-left p-2 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                        >
                          <span className="text-xs font-medium text-gray-700">{s.label}</span>
                          <span className="block text-xs text-gray-400 truncate">{s.path}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Security info banner */}
            <div className="px-6 pb-3">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-800">
                  <strong>Seguridad:</strong> Independientemente de la ubicación, cada PDF será
                  encriptado con la contraseña del espacio (o la política específica si coincide). 
                  La encriptación ocurre <strong>antes</strong> de guardar el archivo.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowFolderPicker(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              {pickerTab === "local" && (
                <button
                  type="button"
                  onClick={confirmLocalSelection}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm"
                >
                  ✓ Confirmar Ruta Local
                </button>
              )}
              {pickerTab === "dropbox" && (
                <button
                  type="button"
                  onClick={confirmDropboxSelection}
                  className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
                >
                  ✓ Confirmar Dropbox
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Assignment Modal ──────────────────────── */}
      {editingWorkspace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Asignar Usuarios a: {editingWorkspace.name}
            </h3>
            <form onSubmit={handleAssignSubmit}>
              <div className="max-h-60 overflow-y-auto border rounded p-3 space-y-2">
                {allUsers.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay empleados creados.</p>
                ) : (
                  allUsers.map(user => (
                    <label key={user.id} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                      />
                      <div>
                        <span className={`text-sm ${user.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {user.name} ({user.email})
                        </span>
                        {!user.isActive && <span className="ml-2 text-xs text-red-500">Baja</span>}
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-5 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                >
                  Guardar Asignaciones
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Page Header ──────────────────────────── */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Espacios de trabajo</h3>
        <p className="mt-2 text-sm text-gray-500">
          Crea ecosistemas independientes. Cada espacio posee una ruta destino (local o nube) y una contraseña base 
          de encriptación que protege todo documento procesado en ese espacio.
        </p>
      </div>

      {/* ── Create + Table ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-4">Crear espacio</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del Espacio</label>
              <input type="text" placeholder="Ej. R.R.H.H." required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ruta de Destino</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  placeholder="Haz clic en 'Elegir Carpeta'…"
                  required
                  readOnly
                  value={cloudPath}
                  className="block w-full flex-1 rounded-l-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-gray-50 cursor-pointer"
                  onClick={openFolderPicker}
                />
                <button
                  type="button"
                  onClick={openFolderPicker}
                  className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <AppIcon name="folder" />
                  <span>Elegir carpeta</span>
                </button>
              </div>
              {cloudPath && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPathBadge(cloudPath).color}`}>
                    <AppIcon name={getPathBadge(cloudPath).icon} /> {getPathBadge(cloudPath).label}
                  </span>
                  <span className="text-xs text-gray-500 truncate">{cloudPath.replace(/^(LOCAL:|Google Drive:|Dropbox:|Drive:)\s*/, "")}</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña Predeterminada</label>
              <input type="text" required value={defaultPassword} onChange={(e) => setDefaultPassword(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
              <p className="mt-1 text-xs text-gray-400">
                Todos los PDFs de este espacio se encriptarán con esta contraseña (a menos que una política específica la reemplace).
              </p>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-indigo-700">
              Crear Espacio
            </button>
          </form>
        </div>

        <div className="md:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espacio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destino</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">Cargando...</td></tr>
              ) : workspaces.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No hay espacios de trabajo creados.</td></tr>
              ) : workspaces.map(ws => {
                const badge = getPathBadge(ws.cloudPath);
                return (
                  <tr key={ws.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ws.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[200px] truncate" title={ws.cloudPath}>
                      {ws.cloudPath.replace(/^(LOCAL:|Google Drive:|Dropbox:|Drive:)\s*/, "")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        <AppIcon name={badge.icon} /> {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openAssignModal(ws)}
                        className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-3 py-1 rounded-md"
                      >
                        Asignar Usuarios
                      </button>
                      {(ws.cloudPath.startsWith("Google Drive:") || ws.cloudPath.startsWith("Drive:")) && (
                        <button
                          onClick={() => openDriveReconnect(ws)}
                          disabled={isReconnectingDrive}
                          className="ml-2 text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded-md disabled:opacity-50"
                        >
                          {isReconnectingDrive && reconnectingWorkspace?.id === ws.id ? "Reconectando..." : "Reconectar Drive"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
