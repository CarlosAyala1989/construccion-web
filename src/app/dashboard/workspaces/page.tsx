"use client";

import { useState, useEffect } from "react";
import Script from "next/script";

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
  defaultPassword: string;
  users?: User[];
};

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || "";

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [cloudPath, setCloudPath] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");

  const [pickerApiLoaded, setPickerApiLoaded] = useState(false);
  const [oauthToken, setOauthToken] = useState<string | null>(null);

  // Assignment Modal State
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    fetchWorkspaces();
    fetchUsers();
  }, []);

  const fetchWorkspaces = async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    setWorkspaces(data);
    setIsLoading(false);
  };

  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    // Exclude admins from being assigned to workspaces (usually only employees need them)
    setAllUsers(data.filter((u: any) => u.role !== "ADMIN"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cloudPath, defaultPassword }),
    });

    if (res.ok) {
      setName("");
      setCloudPath("");
      setDefaultPassword("");
      fetchWorkspaces();
    } else {
      alert("Error al crear espacio de trabajo.");
    }
  };

  const openAssignModal = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    // Fetch users for this workspace specifically to populate the checkboxes
    fetch(`/api/users`)
      .then(res => res.json())
      .then(data => {
        const assignedUserIds = data
          .filter((user: any) => user.workspaces.some((ws: any) => ws.id === workspace.id))
          .map((user: any) => user.id);
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
      fetchWorkspaces(); // Refresh
      alert("Usuarios asignados correctamente.");
    } else {
      alert("Error al asignar usuarios.");
    }
  };

  const handleGoogleApiLoad = () => {
    window.gapi.load("auth", { callback: onAuthApiLoad });
    window.gapi.load("picker", { callback: onPickerApiLoad });
  };

  const onAuthApiLoad = () => {
    window.gapi.auth.authorize(
      {
        client_id: GOOGLE_CLIENT_ID,
        scope: ["https://www.googleapis.com/auth/drive.readonly"],
        immediate: false,
      },
      handleAuthResult
    );
  };

  const onPickerApiLoad = () => {
    setPickerApiLoaded(true);
  };

  const handleAuthResult = (authResult: any) => {
    if (authResult && !authResult.error) {
      setOauthToken(authResult.access_token);
    }
  };

  const createPicker = () => {
    if (pickerApiLoaded && oauthToken) {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId(GOOGLE_APP_ID)
        .setOAuthToken(oauthToken)
        .addView(view)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(pickerCallback)
        .build();
      picker.setVisible(true);
    } else {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
        alert("Faltan credenciales de Google. Usa la ruta manual por ahora.");
        return;
      }
      onAuthApiLoad();
    }
  };

  const pickerCallback = (data: any) => {
    if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
      const doc = data[window.google.picker.Response.DOCUMENTS][0];
      const folderName = doc[window.google.picker.Document.NAME];
      const folderId = doc[window.google.picker.Document.ID];
      setCloudPath(`Drive: ${folderName} (${folderId})`);
    }
  };

  return (
    <div className="space-y-6">
      <Script src="https://apis.google.com/js/api.js" onLoad={handleGoogleApiLoad} />

      {/* Assignment Modal */}
      {editingWorkspace && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
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

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Espacios de Trabajo (Silos Lógicos)</h3>
        <p className="mt-2 text-sm text-gray-500">
          Crea ecosistemas independientes. Cada espacio posee una ruta destino en la nube y una contraseña base.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-4">Crear Espacio</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del Espacio</label>
              <input type="text" placeholder="Ej. R.R.H.H." required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ruta en la Nube</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input 
                  type="text" 
                  placeholder="Ej. Drive/Recursos_Humanos" 
                  required 
                  value={cloudPath} 
                  onChange={(e) => setCloudPath(e.target.value)} 
                  className="block w-full flex-1 rounded-none rounded-l-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" 
                />
                <button
                  type="button"
                  onClick={createPicker}
                  className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <span>Elegir</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña Predeterminada</label>
              <input type="text" required value={defaultPassword} onChange={(e) => setDefaultPassword(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruta Destino</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">Cargando...</td></tr>
              ) : workspaces.map(ws => (
                <tr key={ws.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ws.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ws.cloudPath}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => openAssignModal(ws)}
                      className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-3 py-1 rounded-md"
                    >
                      Asignar Usuarios
                    </button>
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
