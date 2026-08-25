import {
  ACCESS_ROLE_DESKTOP_SCANNER,
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_GLOBAL,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
} from "@/lib/document-access";

export const BCRYPT_SALT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 6;
export const DEFAULT_USER_ROLE = "EMPLOYEE";
export const AUDIT_ACTION_USER_CREATED = "USER_CREATED";
export const AUDIT_STATUS_SUCCESS = "SUCCESS";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  accessRole: typeof ACCESS_ROLE_WEB_VIEWER | typeof ACCESS_ROLE_DESKTOP_SCANNER;
  workspaceIds: string[];
  documentAccessMode: typeof DOCUMENT_ACCESS_GLOBAL | typeof DOCUMENT_ACCESS_PASSWORD_SCOPED;
  passwordGrantKeys: string[];
};

type ParseResult =
  | { ok: true; value: CreateUserPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(
  value: unknown,
  fieldName: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: [] };

  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim().length > 0)) {
    return { ok: false, error: `${fieldName} debe ser una lista de identificadores válidos.` };
  }

  return { ok: true, value: [...new Set(value.map(item => item.trim()))] };
}

export function parseCreateUserPayload(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: "El cuerpo de la solicitud no es válido." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "El correo electrónico no es válido." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const accessRole = input.accessRole ?? ACCESS_ROLE_DESKTOP_SCANNER;
  if (accessRole !== ACCESS_ROLE_WEB_VIEWER && accessRole !== ACCESS_ROLE_DESKTOP_SCANNER) {
    return { ok: false, error: "El tipo de cuenta no es válido." };
  }

  const documentAccessMode = input.documentAccessMode ?? DOCUMENT_ACCESS_PASSWORD_SCOPED;
  if (documentAccessMode !== DOCUMENT_ACCESS_GLOBAL && documentAccessMode !== DOCUMENT_ACCESS_PASSWORD_SCOPED) {
    return { ok: false, error: "El modo de acceso documental no es válido." };
  }

  const workspaceIds = parseStringArray(input.workspaceIds, "workspaceIds");
  if (!workspaceIds.ok) return workspaceIds;

  const passwordGrantKeys = parseStringArray(input.passwordGrantKeys, "passwordGrantKeys");
  if (!passwordGrantKeys.ok) return passwordGrantKeys;

  return {
    ok: true,
    value: {
      name,
      email,
      password,
      accessRole,
      workspaceIds: workspaceIds.value,
      documentAccessMode,
      passwordGrantKeys: passwordGrantKeys.value,
    },
  };
}
