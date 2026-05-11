"use client";

import { useState, useEffect } from "react";

type Config = {
  id: string;
  compressionEnabled: boolean;
  compressionThresholdMb: number;
  deleteLocalAfterUpload: boolean;
  cloudProvider: string;
};

type NomenclatureField = {
  id: string;
  fieldName: string;
  fieldOrder: number;
  isRequired: boolean;
  separator: string;
};

export default function ConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nomenclatures, setNomenclatures] = useState<NomenclatureField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Nomenclature form
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldOrder, setNewFieldOrder] = useState(0);
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldSeparator, setNewFieldSeparator] = useState("_");

  useEffect(() => {
    fetchConfig();
    fetchNomenclatures();
  }, []);

  const fetchConfig = async () => {
    const res = await fetch("/api/config");
    if (res.ok) {
      setConfig(await res.json());
    }
    setIsLoading(false);
  };

  const fetchNomenclatures = async () => {
    const res = await fetch("/api/nomenclatures");
    if (res.ok) {
      setNomenclatures(await res.json());
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    setSaveMessage("");

    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compressionEnabled: config.compressionEnabled,
        compressionThresholdMb: config.compressionThresholdMb,
        deleteLocalAfterUpload: config.deleteLocalAfterUpload,
        cloudProvider: config.cloudProvider,
      }),
    });

    if (res.ok) {
      setSaveMessage("✅ Configuración guardada exitosamente.");
      setConfig(await res.json());
    } else {
      setSaveMessage("❌ Error al guardar configuración.");
    }
    setIsSaving(false);
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleAddNomenclature = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/nomenclatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: newFieldName,
        fieldOrder: newFieldOrder,
        isRequired: newFieldRequired,
        separator: newFieldSeparator,
      }),
    });

    if (res.ok) {
      setNewFieldName("");
      setNewFieldOrder(nomenclatures.length);
      fetchNomenclatures();
    } else {
      alert("Error al crear campo de nomenclatura.");
    }
  };

  const handleDeleteNomenclature = async (id: string) => {
    if (!confirm("¿Eliminar este campo de nomenclatura?")) return;

    const res = await fetch(`/api/nomenclatures?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchNomenclatures();
    } else {
      alert("Error al eliminar campo.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Configuración Global del Sistema</h3>
        <p className="mt-2 text-sm text-gray-500">
          Configura el comportamiento global del software: compresión, eliminación post-subida, proveedor de nube y nomenclaturas de clasificación.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Settings */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-4">Opciones del Sistema</h4>

          {config && (
            <div className="space-y-5">
              {/* Compression */}
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={config.compressionEnabled}
                    onChange={e => setConfig({ ...config, compressionEnabled: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-sm font-medium text-gray-700">Compresión Dinámica de PDF</span>
                </label>
                <p className="ml-7 text-xs text-gray-500 mt-1">
                  Comprimir archivos PDF antes de la subida a la nube si superan el umbral.
                </p>
              </div>

              {config.compressionEnabled && (
                <div className="ml-7">
                  <label className="block text-sm font-medium text-gray-700">Umbral (MB)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={config.compressionThresholdMb}
                    onChange={e => setConfig({ ...config, compressionThresholdMb: Number(e.target.value) })}
                    className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Por defecto: 10 MB</p>
                </div>
              )}

              {/* Delete Local */}
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={config.deleteLocalAfterUpload}
                    onChange={e => setConfig({ ...config, deleteLocalAfterUpload: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-sm font-medium text-gray-700">Eliminación Local Post-Subida</span>
                </label>
                <p className="ml-7 text-xs text-gray-500 mt-1">
                  Eliminar permanentemente la copia local tras confirmar subida exitosa a la nube.
                </p>
              </div>

              {/* Cloud Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Proveedor de Nube</label>
                <select
                  value={config.cloudProvider}
                  onChange={e => setConfig({ ...config, cloudProvider: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                >
                  <option value="MANUAL">Manual (Ruta personalizada)</option>
                  <option value="GOOGLE_DRIVE">Google Drive</option>
                  <option value="DROPBOX">Dropbox</option>
                </select>
              </div>

              {saveMessage && (
                <div className={`text-sm p-3 rounded-md ${saveMessage.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {saveMessage}
                </div>
              )}

              <button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="w-full bg-indigo-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {isSaving ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          )}
        </div>

        {/* Nomenclatures */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-2">Nomenclaturas Aceptadas</h4>
          <p className="text-xs text-gray-500 mb-4">
            Define los campos que la IA local usará para renombrar y clasificar documentos automáticamente.
          </p>

          <form onSubmit={handleAddNomenclature} className="space-y-3 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del Campo</label>
              <input
                type="text"
                required
                placeholder="Ej. Código de Proyecto"
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Orden</label>
                <input
                  type="number"
                  value={newFieldOrder}
                  onChange={e => setNewFieldOrder(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Separador</label>
                <input
                  type="text"
                  maxLength={3}
                  value={newFieldSeparator}
                  onChange={e => setNewFieldSeparator(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center space-x-2 pb-2">
                  <input
                    type="checkbox"
                    checked={newFieldRequired}
                    onChange={e => setNewFieldRequired(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-sm text-gray-700">Requerido</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-indigo-700"
            >
              Agregar Campo
            </button>
          </form>

          {/* Preview */}
          {nomenclatures.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md border">
              <p className="text-xs font-medium text-gray-500 mb-1">Vista previa del nombre de archivo:</p>
              <p className="text-sm font-mono text-indigo-700">
                {nomenclatures.map(f => `[${f.fieldName}]`).join(nomenclatures[0]?.separator || "_")}
                .pdf
              </p>
            </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {nomenclatures.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No hay campos definidos.</p>
            ) : (
              nomenclatures.map(field => (
                <div key={field.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{field.fieldName}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      (Orden: {field.fieldOrder}, Sep: &quot;{field.separator}&quot;
                      {field.isRequired ? ", Requerido" : ", Opcional"})
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteNomenclature(field.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
