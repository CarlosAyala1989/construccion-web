export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900">Panel de Control Principal</h3>
        <p className="mt-2 text-sm text-gray-500">
          Desde aquí puedes gestionar las políticas globales de seguridad, usuarios y revisar la auditoría forense.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Usuarios</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">1</p>
          <p className="mt-1 text-sm text-gray-500">Activos en el sistema</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Espacios de Trabajo</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">0</p>
          <p className="mt-1 text-sm text-gray-500">Configurados</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h4 className="text-base font-medium text-indigo-600">Reglas de Seguridad</h4>
          <p className="mt-2 text-3xl font-bold text-gray-900">0</p>
          <p className="mt-1 text-sm text-gray-500">Políticas Criptográficas activas</p>
        </div>
      </div>
    </div>
  );
}
