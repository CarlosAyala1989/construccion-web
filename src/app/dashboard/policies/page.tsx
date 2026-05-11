"use client";

import { useState, useEffect } from "react";

type Policy = {
  id: string;
  type: string;
  target: string;
  password: string;
  priority: number;
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [type, setType] = useState("SEMANTIC");
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    const res = await fetch("/api/policies");
    const data = await res.json();
    setPolicies(data);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, target, password, priority: Number(priority) }),
    });

    if (res.ok) {
      setTarget("");
      setPassword("");
      setPriority(0);
      fetchPolicies();
    } else {
      alert("Error al crear política.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Políticas de Seguridad Híbrida (Escudo de Privacidad)</h3>
        <p className="mt-2 text-sm text-gray-500">
          Configura las reglas para el motor de Criptografía Jerárquica que se ejecutará en el cliente de escritorio. 
          Las políticas visuales (Computer Vision) tienen prioridad técnica sobre las semánticas (OCR).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-md font-medium text-gray-900 mb-4">Nueva Regla</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de Motor</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white">
                <option value="SEMANTIC">Semántica (Texto / OCR)</option>
                <option value="VISUAL">Visual (Marcas de Agua / Plantillas)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {type === "SEMANTIC" ? "Palabra / Oración Clave" : "Identificador de Plantilla Visual"}
              </label>
              <input type="text" placeholder={type === "SEMANTIC" ? "Ej. Confidencial" : "Ej. Sello_Secreto_V1"} required value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña de Reemplazo</label>
              <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Prioridad</label>
              <input type="number" required value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" />
              <p className="text-xs text-gray-500 mt-1">Mayor número = Mayor jerarquía en empates.</p>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-indigo-700">
              Crear Regla
            </button>
          </form>
        </div>

        <div className="md:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Prioridad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Objetivo (Target)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contraseña</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">Cargando...</td></tr>
              ) : policies.map(pol => (
                <tr key={pol.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pol.type === 'VISUAL' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                      {pol.type}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">Prioridad: {pol.priority}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pol.target}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono bg-gray-100 px-2 rounded">{pol.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
