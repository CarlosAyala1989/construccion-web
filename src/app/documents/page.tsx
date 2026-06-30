"use client";

import { AppIcon } from "@/components/AppIcon";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Workspace = {
  id: string;
  name: string;
  cloudPath: string;
  provider: "GOOGLE_DRIVE" | "LOCAL" | "UNSUPPORTED";
};

type DocumentFile = {
  id: string;
  name: string;
  provider: string;
  size?: string;
  modifiedTime?: string;
};

type DocumentFolder = {
  id: string;
  name: string;
  provider: string;
  modifiedTime?: string;
};

type FolderBreadcrumb = {
  id: string;
  name: string;
};

type PasswordOption = {
  credentialKey: string;
  label: string;
  sourceType: "DEFAULT" | "POLICY";
  policyType: string | null;
};

type ActivePdf = {
  name: string;
  pages: Array<{
    pageNumber: number;
    src: string;
  }>;
};

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<FolderBreadcrumb[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [passwordOptions, setPasswordOptions] = useState<PasswordOption[]>([]);
  const [selectedCredentialKey, setSelectedCredentialKey] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [activePdf, setActivePdf] = useState<ActivePdf | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );
  const canUpload = session?.user?.role === "ADMIN";

  const refreshDocuments = useCallback(async (
    workspaceId = selectedWorkspaceId,
    folderId = currentFolderId,
  ) => {
    if (!workspaceId) return;
    await Promise.resolve();
    setIsLoadingDocuments(true);
    setMessage("");

    try {
      const params = new URLSearchParams({ workspaceId });
      if (folderId) params.set("folderId", folderId);
      const res = await fetch(`/api/documents?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setFolders([]);
        setDocuments([]);
        setMessage(data.error || "No se pudieron listar los documentos.");
        return;
      }

      setFolders(data.folders || []);
      setDocuments(data.files || []);
    } catch {
      setFolders([]);
      setMessage("No se pudieron listar los documentos.");
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [currentFolderId, selectedWorkspaceId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/documents/workspaces")
      .then(res => res.json())
      .then(data => {
        const nextWorkspaces = Array.isArray(data) ? data : [];
        setWorkspaces(nextWorkspaces);
        if (nextWorkspaces[0]) {
          setIsLoadingDocuments(true);
          setSelectedWorkspaceId(nextWorkspaces[0].id);
        }
      })
      .catch(() => setMessage("No se pudieron cargar los espacios de trabajo."))
      .finally(() => setIsLoadingWorkspaces(false));
  }, [status]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const workspaceId = selectedWorkspaceId;

    void Promise.resolve().then(() => refreshDocuments(workspaceId, currentFolderId));
  }, [currentFolderId, refreshDocuments, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const workspaceId = selectedWorkspaceId;

    fetch(`/api/documents/password-options?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async res => {
        const data = await res.json();
        const options = res.ok && Array.isArray(data) ? data : [];
        setPasswordOptions(options);
        setSelectedCredentialKey(options[0]?.credentialKey || "");
      })
      .catch(() => {
        setPasswordOptions([]);
        setSelectedCredentialKey("");
      });
  }, [selectedWorkspaceId]);

  const handleOpenFolder = (folder: DocumentFolder) => {
    setIsLoadingDocuments(true);
    setCurrentFolderId(folder.id);
    setBreadcrumbs(current => [...current, { id: folder.id, name: folder.name }]);
    setActivePdf(null);
  };

  const handleBreadcrumb = (index: number) => {
    setIsLoadingDocuments(true);
    if (index < 0) {
      setCurrentFolderId("");
      setBreadcrumbs([]);
    } else {
      const target = breadcrumbs[index];
      setCurrentFolderId(target.id);
      setBreadcrumbs(current => current.slice(0, index + 1));
    }
    setActivePdf(null);
  };

  const handleView = async (file: DocumentFile) => {
    if (!selectedWorkspaceId) return;

    setIsViewing(true);
    setMessage("");
    setActivePdf(null);

    try {
      const res = await fetch(
        `/api/documents/view?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&fileId=${encodeURIComponent(file.id)}`
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || "No se pudo abrir el documento.");
        return;
      }

      const data = await res.json();
      setActivePdf({
        name: data.fileName || file.name,
        pages: data.pages || [],
      });
    } catch {
      setMessage("No se pudo abrir el documento.");
    } finally {
      setIsViewing(false);
    }
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedWorkspaceId || !uploadFile || !selectedCredentialKey) {
      setMessage("Selecciona un espacio, una contraseña autorizada y un PDF.");
      return;
    }

    setIsUploading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("workspaceId", selectedWorkspaceId);
    formData.append("credentialKey", selectedCredentialKey);
    formData.append("file", uploadFile);
    if (currentFolderId) formData.append("folderId", currentFolderId);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "No se pudo subir el documento.");
        return;
      }

      setUploadFile(null);
      setMessage("Documento subido y cifrado correctamente.");
      await refreshDocuments(selectedWorkspaceId, currentFolderId);
    } catch {
      setMessage("No se pudo subir el documento.");
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (size?: string) => {
    const value = Number(size || 0);
    if (!value) return "Sin tamaño";
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date?: string) => {
    if (!date) return "Sin fecha";
    return new Date(date).toLocaleString("es-PE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (status === "loading" || isLoadingWorkspaces) {
    return (
      <div className="loading-state" role="status">
        <div><span className="spinner" aria-hidden="true" /> Preparando documentos…</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="documents-shell min-h-screen bg-gray-50">
      <header className="documents-topbar bg-white border-b border-gray-200">
        <div className="documents-topbar-inner mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="documents-brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
            <h1 className="text-lg font-semibold text-gray-900">DocuZen</h1>
            <p className="text-xs text-gray-500">{session.user?.name || session.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session.user?.role === "ADMIN" && (
              <Link
                href="/dashboard"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Administración
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="documents-content mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header className="documents-page-heading">
          <h2>Biblioteca de documentos</h2>
          <p>Busca, abre y protege los archivos autorizados de cada espacio de trabajo.</p>
        </header>
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Espacio de trabajo</label>
              <select
                value={selectedWorkspaceId}
                onChange={event => {
                  setIsLoadingDocuments(true);
                  setSelectedWorkspaceId(event.target.value);
                  setCurrentFolderId("");
                  setBreadcrumbs([]);
                  setFolders([]);
                  setDocuments([]);
                  setActivePdf(null);
                }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
              >
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {selectedWorkspace?.provider === "GOOGLE_DRIVE" ? "Google Drive" : selectedWorkspace?.provider === "LOCAL" ? "Ruta local del servidor" : "Repositorio no compatible"}
                </p>
                <p className="text-xs text-gray-500 truncate max-w-xl">{selectedWorkspace?.cloudPath || "Sin espacio asignado"}</p>
              </div>
              <button
                onClick={() => refreshDocuments(selectedWorkspaceId, currentFolderId)}
                disabled={!selectedWorkspaceId || isLoadingDocuments}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <AppIcon name="refresh" />
                {isLoadingDocuments ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        )}

        <section className={`grid grid-cols-1 ${canUpload ? "xl:grid-cols-3" : ""} gap-6`}>
          {canUpload && (
            <div className="xl:col-span-1 bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-base font-semibold text-gray-900">Subida administrativa</h2>
              <form onSubmit={handleUpload} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña aplicada</label>
                  <select
                    value={selectedCredentialKey}
                    onChange={event => setSelectedCredentialKey(event.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    {passwordOptions.map(option => (
                      <option key={option.credentialKey} value={option.credentialKey}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {passwordOptions.length === 0 && (
                    <p className="mt-1 text-xs text-red-600">No hay contraseñas autorizadas para subir en este espacio.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Archivo PDF</label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={event => setUploadFile(event.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile || passwordOptions.length === 0 || selectedWorkspace?.provider === "UNSUPPORTED"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  <AppIcon name="upload" />
                  {isUploading ? "Subiendo…" : "Proteger y subir"}
                </button>
                <p className="text-xs text-gray-500">
                  El documento se guardará en la carpeta que estás viendo.
                </p>
              </form>
            </div>
          )}

          <div className={`${canUpload ? "xl:col-span-2" : ""} bg-white border border-gray-200 rounded-lg overflow-hidden`}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Contenido de la carpeta</h2>
              <span className="text-xs text-gray-500">
                {folders.length} carpeta(s), {documents.length} documento(s)
              </span>
            </div>
            <nav className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-1 text-sm" aria-label="Ruta de carpetas">
              <button
                type="button"
                onClick={() => handleBreadcrumb(-1)}
                className="font-medium text-indigo-700 hover:text-indigo-900"
              >
                {selectedWorkspace?.name || "Raíz"}
              </button>
              {breadcrumbs.map((folder, index) => (
                <span key={folder.id} className="flex items-center gap-1">
                  <span className="text-gray-400">/</span>
                  <button
                    type="button"
                    onClick={() => handleBreadcrumb(index)}
                    className="font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    {folder.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Nombre</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Actualizado</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Tamaño</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {isLoadingDocuments ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-500">Cargando documentos...</td>
                    </tr>
                  ) : folders.length === 0 && documents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-500">Esta carpeta está vacía.</td>
                    </tr>
                  ) : (
                    <>
                      {folders.map(folder => (
                        <tr key={`folder-${folder.id}`} className="hover:bg-indigo-50">
                          <td className="px-5 py-4 text-sm font-medium text-gray-900 max-w-sm truncate" title={folder.name}>
                            <button
                              type="button"
                              onClick={() => handleOpenFolder(folder)}
                              className="flex items-center gap-2 text-left hover:text-indigo-700"
                            >
                              <AppIcon name="folder" />
                              <span>{folder.name}</span>
                            </button>
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(folder.modifiedTime)}</td>
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">Carpeta</td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenFolder(folder)}
                              className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              Abrir
                            </button>
                          </td>
                        </tr>
                      ))}
                      {documents.map(file => (
                        <tr key={`file-${file.id}`} className="hover:bg-gray-50">
                          <td className="px-5 py-4 text-sm font-medium text-gray-900 max-w-sm truncate" title={file.name}>
                            <AppIcon name="file" className="mr-2" />
                            {file.name}
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(file.modifiedTime)}</td>
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{formatSize(file.size)}</td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleView(file)}
                              disabled={isViewing}
                              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:bg-gray-400"
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">{activePdf?.name || "Visor PDF"}</h2>
            {activePdf && <span className="text-xs text-gray-500">{activePdf.pages.length} página(s)</span>}
          </div>
          <div className="h-[72vh] overflow-auto bg-gray-100 print:hidden">
            {activePdf ? (
              <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 p-6">
                {activePdf.pages.map(page => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={page.pageNumber}
                    src={page.src}
                    alt={`${activePdf.name} - página ${page.pageNumber}`}
                    draggable={false}
                    onContextMenu={event => event.preventDefault()}
                    className="w-full max-w-[960px] select-none rounded-sm bg-white shadow-sm"
                  />
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                Selecciona un documento para visualizarlo.
              </div>
            )}
          </div>
        </section>
      </main>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
        }
      `}</style>
    </div>
  );
}
