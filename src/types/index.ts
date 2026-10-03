/**
 * Interfaces globales de TypeScript para la plataforma Gobernanza Documental.
 * Estos tipos corresponden al esquema de Prisma y se usan en componentes y rutas de API.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  accessRole: "WEB_VIEWER" | "DESKTOP_SCANNER";
  documentAccessMode: "GLOBAL" | "PASSWORD_SCOPED";
  twoFactorEnabled: boolean;
  twoFactorConfirmedAt?: string | null;
  workspaces: Workspace[];
  documentPasswordGrants?: DocumentPasswordGrant[];
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  cloudPath: string;
  defaultPassword: string;
  users?: User[];
  policies?: SecurityPolicy[];
  documentPasswordGrants?: DocumentPasswordGrant[];
  createdAt: string;
  updatedAt: string;
}

export interface SecurityPolicy {
  id: string;
  type: "SEMANTIC" | "VISUAL";
  target: string;
  password: string;
  priority: number;
  workspaceId?: string | null;
  workspace?: Workspace | null;
  documentPasswordGrants?: DocumentPasswordGrant[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPasswordGrant {
  id: string;
  userId: string;
  workspaceId: string;
  securityPolicyId?: string | null;
  credentialKey: string;
  sourceType: "DEFAULT" | "POLICY";
  label: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  details: string;
  status: "SUCCESS" | "FAILURE";
  workspaceId: string | null;
  workspace?: { name: string } | null;
  createdAt: string;
}

export interface Config {
  id: string;
  compressionEnabled: boolean;
  compressionThresholdMb: number;
  deleteLocalAfterUpload: boolean;
  cloudProvider: "GOOGLE_DRIVE" | "DROPBOX" | "MANUAL";
  cloudCredentials?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface NomenclatureField {
  id: string;
  fieldName: string;
  fieldOrder: number;
  isRequired: boolean;
  separator: string;
  createdAt: string;
  updatedAt: string;
}

/** Contenedor de una respuesta paginada. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Respuesta de configuración para la sincronización de escritorio. */
export interface SyncConfigResponse {
  workspaces: Workspace[];
  policies: SecurityPolicy[];
  config: Config;
  nomenclatures: NomenclatureField[];
  syncedAt: string;
}

/** Informe de carga desde el escritorio. */
export interface UploadReport {
  userId: string;
  userName: string;
  workspaceId: string;
  fileName: string;
  originalName: string;
  cloudDestination: string;
  encryptionApplied: boolean;
  encryptionType: "SEMANTIC" | "VISUAL" | "DEFAULT";
  policyId?: string;
  fileSizeMb: number;
  compressed: boolean;
}

/** Estadísticas del panel principal. */
export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalWorkspaces: number;
  totalPolicies: number;
  totalLogs: number;
  successLogs: number;
  failureLogs: number;
  recentLogs: AuditLog[];
}
