/**
 * Funciones auxiliares de la plataforma Gobernanza Documental.
 * Se usan para dar formato a fechas, manipular cadenas y preparar datos.
 */

/**
 * Da formato localizado a una fecha recibida como cadena o como objeto Date.
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  return new Date(date).toLocaleString("es-MX", options || defaultOptions);
}

/**
 * Da formato abreviado a una fecha para mostrarla (por ejemplo, «11 may 2026, 14:23»).
 */
export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleString("es-MX", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Da formato a una fecha como AAAA-MM-DD para campos de entrada.
 */
export function formatDateInput(date: string | Date): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

/**
 * Recorta una cadena a la longitud indicada y agrega «...» si fue truncada.
 */
export function truncate(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Analiza JSON de forma segura sin propagar errores.
 */
export function safeJsonParse<T = any>(jsonString: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

/**
 * Genera una etiqueta de estado legible en español.
 */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    SUCCESS: "Éxito",
    FAILURE: "Fallo",
    PENDING: "Pendiente",
    ACTIVE: "Activo",
    INACTIVE: "Inactivo",
  };
  return labels[status] || status;
}

/**
 * Convierte bytes a un tamaño de archivo legible.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Pone en mayúscula la primera letra de una cadena.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Crea parámetros de consulta para una URL a partir de un objeto y excluye valores vacíos.
 */
export function buildQueryParams(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  return searchParams.toString();
}
