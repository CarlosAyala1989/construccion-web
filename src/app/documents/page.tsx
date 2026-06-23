"use client";

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

  const refreshDocuments = useCallback(async (workspaceId = selectedWorkspaceId) => {
    if (!workspaceId) return;
    await Promise.resolve();
    setIsLoadingDocuments(true);
    setMessage("");

    try {
      const res = await fetch(`/api/documents?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = await res.json();

      if (!res.ok) {
        setDocuments([]);
        setMessage(data.error || "No se pudieron listar los documentos.");
        return;
      }

      setDocuments(data.files || []);
    } catch {
      setMessage("No se pudieron listar los documentos.");
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [selectedWorkspaceId]);

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

    fetch(`/api/documents?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async res => {
        const data = await res.json();

        if (!res.ok) {
          setDocuments([]);
          setMessage(data.error || "No se pudieron listar los documentos.");
          return;
        }

        setDocuments(data.files || []);
      })
      .catch(() => setMessage("No se pudieron listar los documentos."))
      .finally(() => setIsLoadingDocuments(false));

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

  const handleView = async (file: DocumentFile) => {
    if (!selectedWorkspaceId) return;

    setIsViewing(true);
    setMessage("");

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
      await refreshDocuments(selectedWorkspaceId);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Cargando documentos...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Documentos Web</h1>
            <p className="text-xs text-gray-500">{session.user?.name || session.user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {session.user?.role === "ADMIN" && (
              <Link
                href="/dashboard"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Panel admin
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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Espacio de trabajo</label>
              <select
                value={selectedWorkspaceId}
                onChange={event => {
                  setIsLoadingDocuments(true);
                  setSelectedWorkspaceId(event.target.value);
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
                onClick={() => refreshDocuments()}
                disabled={!selectedWorkspaceId || isLoadingDocuments}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoadingDocuments ? "Actualizando..." : "Actualizar"}
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
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {isUploading ? "Subiendo..." : "Cifrar y subir"}
                </button>
              </form>
            </div>
          )}

          <div className={`${canUpload ? "xl:col-span-2" : ""} bg-white border border-gray-200 rounded-lg overflow-hidden`}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Documentos disponibles</h2>
              <span className="text-xs text-gray-500">{documents.length} documento(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Documento</th>
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
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-500">No hay PDFs en este espacio.</td>
                    </tr>
                  ) : (
                    documents.map(file => (
                      <tr key={file.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 text-sm font-medium text-gray-900 max-w-sm truncate" title={file.name}>
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
                    ))
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
