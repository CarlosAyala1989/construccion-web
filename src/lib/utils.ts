/**
 * Utility functions for the Gobernanza Documental platform.
 * Used across the application for date formatting, string manipulation, and data helpers.
 */

/**
 * Format a date string or Date object to a locale-aware string.
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
 * Format a date for display in short form (e.g., "11 may 2026, 14:23").
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
 * Format a date as YYYY-MM-DD for input fields.
 */
export function formatDateInput(date: string | Date): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

/**
 * Truncate a string to a given length, appending "..." if truncated.
 */
export function truncate(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Safely parse JSON without throwing.
 */
export function safeJsonParse<T = any>(jsonString: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

/**
 * Generate a display-friendly status label in Spanish.
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
 * Convert bytes to a human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Build URL query params from an object, excluding empty values.
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
