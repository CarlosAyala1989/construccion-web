"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────
type DriveFolder = {
  id: string;
  name: string;
};

type BreadcrumbItem = {
  id: string;
  name: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string, folderId: string, refreshToken: string | null) => void;
  clientId: string;
};

type GoogleCodeResponse = {
  code?: string;
  error?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

type GoogleOAuth2 = {
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    select_account: boolean;
    ux_mode: "popup";
    callback: (response: GoogleCodeResponse) => void | Promise<void>;
  }) => GoogleCodeClient;
};

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: GoogleOAuth2;
    };
  };
};

type TokenExchangeResponse = {
  access_token?: string;
  refresh_token?: string | null;
};

type ApiErrorResponse = {
  error?: string;
};

type DriveFoldersResponse = ApiErrorResponse & {
  folders?: DriveFolder[];
};

// ─── Component ────────────────────────────────────────
export default function DriveFolderBrowser({ isOpen, onClose, onSelect, clientId }: Props) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: "root", name: "Mi Drive" }]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);

  // New folder creation
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const currentParentId = breadcrumb[breadcrumb.length - 1].id;

  const loadFolders = useCallback(async (parentId: string) => {
    if (!accessToken) return;
    setIsLoading(true);
    setError("");
    setSelectedFolder(null);

    try {
      const res = await fetch(`/api/drive/folders?parentId=${parentId}&token=${accessToken}`);
      const data = await res.json() as DriveFoldersResponse;

      if (!res.ok) {
        if (res.status === 401) {
          setAccessToken(null);
          setError("Sesión de Google expirada. Inicia sesión nuevamente.");
          return;
        }
        setError(data.error || "Error al cargar carpetas");
        return;
      }

      setFolders(data.folders || []);
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  // ─── Google Auth (Authorization Code Flow for refresh token) ──
  const handleGoogleAuth = useCallback(() => {
    if (!clientId) {
      setError("Falta configurar el Client ID OAuth de Google Drive.");
      return;
    }

    const gis = (window as GoogleWindow).google?.accounts?.oauth2;
    if (!gis) {
      setError("La librería de Google Identity Services no se cargó. Recarga la página.");
      return;
    }

    // Use code client (authorization code flow) to get a refresh_token
    const codeClient = gis.initCodeClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
      include_granted_scopes: true,
      select_account: true,
      ux_mode: "popup",
      callback: async (response: GoogleCodeResponse) => {
        if (response.error) {
          setError(`Error de autenticación: ${response.error}`);
          return;
        }

        if (!response.code) {
          setError("Google no devolvió código de autorización.");
          return;
        }

        // Exchange the authorization code for tokens on our server
        try {
          const tokenRes = await fetch("/api/drive/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XmlHttpRequest",
            },
            body: JSON.stringify({
              code: response.code,
              redirectUri: window.location.origin,
            }),
          });

          if (!tokenRes.ok) {
            const errData = await tokenRes.json() as ApiErrorResponse;
            setError(errData.error || "Error al obtener credenciales");
            return;
          }

          const tokens = await tokenRes.json() as TokenExchangeResponse;

          if (!tokens.access_token) {
            setError("Google no devolvió access token.");
            return;
          }

          setAccessToken(tokens.access_token);
          setRefreshToken(tokens.refresh_token || null);
          setError("");

          if (!tokens.refresh_token) {
            console.warn("[DRIVE] No refresh_token received — user may have previously authorized this app. Revoke access and retry to get a new refresh_token.");
          }
        } catch {
          setError("Error de conexión al intercambiar credenciales");
        }
      },
    });

    codeClient.requestCode();
  }, [clientId]);

  // ─── Load folders when token or parent changes ────
  useEffect(() => {
    if (accessToken && isOpen) {
      void Promise.resolve().then(() => loadFolders(currentParentId));
    }
  }, [accessToken, currentParentId, isOpen, loadFolders]);

  // ─── Navigation ───────────────────────────────────
  const navigateToFolder = (folder: DriveFolder) => {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFolder(null);
  };

  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumb(prev => prev.slice(0, index + 1));
    setSelectedFolder(null);
  };

  // ─── Create Folder ────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !accessToken) return;
    setIsCreating(true);

    try {
      const res = await fetch("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          name: newFolderName.trim(),
          parentId: currentParentId,
        }),
      });

      if (res.ok) {
        setNewFolderName("");
        setShowNewFolder(false);
        await loadFolders(currentParentId);
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear carpeta");
      }
    } catch {
      setError("Error al crear carpeta");
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Confirm Selection ────────────────────────────
  const handleConfirm = () => {
    if (!refreshToken) {
      setError("Google no devolvió credenciales persistentes. Revoca el acceso de esta app en tu cuenta Google y vuelve a conectar Drive.");
      return;
    }

    const target = selectedFolder || breadcrumb[breadcrumb.length - 1];
    const path = breadcrumb
      .slice(1)
      .map(b => b.name)
      .concat(selectedFolder ? [selectedFolder.name] : [])
      .join("/");

    onSelect(`Google Drive: /${path || ""}`, target.id, refreshToken);
    onClose();
  };

  // ─── Render ───────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-blue-600 px-6 py-4 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.41 14l3.18 5.5h6.36L7.71 3.5zM9.93 14H4.24l2.85-4.93L9.93 14z" fill="#4285F4" />
                  <path d="M16.29 3.5h-8.58l3.18 5.5 3.17 5.5h6.36l-4.13-11z" fill="#EA4335" />
                  <path d="M4.59 19.5h14.82l-3.18-5.5H7.77l-3.18 5.5z" fill="#FBBC04" />
                </svg>
                Explorar Google Drive
              </h3>
              <p className="text-sm text-blue-200 mt-1">Navega tus carpetas y selecciona el destino</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Not authenticated */}
          {!accessToken ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Conecta tu Google Drive</h4>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">
                Inicia sesión con tu cuenta de Google para explorar tus carpetas y seleccionar el destino de los documentos.
                El programa de escritorio usará estas credenciales para subir archivos automáticamente.
              </p>
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm w-full max-w-sm">{error}</div>
              )}
              <button
                onClick={handleGoogleAuth}
                className="inline-flex items-center gap-3 px-6 py-3 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Iniciar sesión con Google
              </button>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-1 overflow-x-auto flex-shrink-0">
                {breadcrumb.map((item, idx) => (
                  <span key={item.id} className="flex items-center flex-shrink-0">
                    {idx > 0 && <span className="text-gray-400 mx-1">/</span>}
                    <button
                      onClick={() => navigateToBreadcrumb(idx)}
                      className={`text-sm px-2 py-1 rounded hover:bg-blue-100 transition-colors ${
                        idx === breadcrumb.length - 1
                          ? "font-semibold text-blue-700 bg-blue-50"
                          : "text-gray-600 hover:text-blue-600"
                      }`}
                    >
                      {idx === 0 ? "📁 Mi Drive" : item.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Toolbar */}
              <div className="px-4 py-2 border-b flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-gray-500">
                  {isLoading ? "Cargando..." : `${folders.length} carpeta${folders.length !== 1 ? "s" : ""}`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadFolders(currentParentId)}
                    className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100"
                    title="Recargar"
                  >
                    🔄 Recargar
                  </button>
                  <button
                    onClick={() => { setShowNewFolder(true); setNewFolderName(""); }}
                    className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md font-medium"
                  >
                    + Nueva Carpeta
                  </button>
                </div>
              </div>

              {/* New folder input */}
              {showNewFolder && (
                <div className="px-4 py-3 bg-blue-50 border-b flex items-center gap-2 flex-shrink-0">
                  <span className="text-lg">📁</span>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                    placeholder="Nombre de la nueva carpeta..."
                    autoFocus
                    className="flex-1 text-sm border border-blue-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={isCreating || !newFolderName.trim()}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:bg-blue-300 font-medium"
                  >
                    {isCreating ? "Creando..." : "Crear"}
                  </button>
                  <button
                    onClick={() => setShowNewFolder(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mx-4 mt-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex-shrink-0">{error}</div>
              )}

              {/* Folder list */}
              <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-gray-500">
                      <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm">Cargando carpetas...</span>
                    </div>
                  </div>
                ) : folders.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">📂</div>
                    <p className="text-sm text-gray-500">No hay carpetas aquí.</p>
                    <p className="text-xs text-gray-400 mt-1">Puedes crear una nueva con el botón de arriba.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {folders.map(folder => (
                      <div
                        key={folder.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
                          selectedFolder?.id === folder.id
                            ? "bg-blue-100 border border-blue-300"
                            : "hover:bg-gray-100 border border-transparent"
                        }`}
                        onClick={() => setSelectedFolder(selectedFolder?.id === folder.id ? null : folder)}
                        onDoubleClick={() => navigateToFolder(folder)}
                      >
                        <span className="text-xl flex-shrink-0">
                          {selectedFolder?.id === folder.id ? "📂" : "📁"}
                        </span>
                        <span className="text-sm text-gray-800 flex-1 truncate font-medium">
                          {folder.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigateToFolder(folder); }}
                          className="text-xs text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Abrir →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection info */}
              <div className="px-4 py-3 bg-gray-50 border-t flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>📍 Destino:</span>
                  <span className="font-medium text-gray-700">
                    {selectedFolder
                      ? `${breadcrumb.slice(1).map(b => b.name).join("/")}${breadcrumb.length > 1 ? "/" : ""}${selectedFolder.name}`
                      : breadcrumb.slice(1).map(b => b.name).join("/") || "Raíz de Mi Drive"
                    }
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Clic = seleccionar, Doble clic = abrir carpeta. Si no seleccionas ninguna, se usará la carpeta actual.
                </p>
                {refreshToken && (
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Credenciales de larga duración obtenidas — el escritorio podrá subir archivos automáticamente.
                  </p>
                )}
                {!refreshToken && accessToken && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ No se obtuvo refresh token — la subida automática podría requerir re-autorización.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          {accessToken && (
            <button
              onClick={handleConfirm}
              disabled={!refreshToken}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:bg-blue-300"
            >
              ✓ Seleccionar esta carpeta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
