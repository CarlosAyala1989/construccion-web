import type { Prisma } from "@prisma/client";

export const AUDIT_ACTION_USER_DEACTIVATED = "USER_DEACTIVATED";
export const AUDIT_ACTION_USER_REACTIVATED = "USER_REACTIVATED";
export const AUDIT_STATUS_SUCCESS = "SUCCESS";

export const ACCOUNT_STATUS_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type AccountStatusUser = Prisma.UserGetPayload<{
  select: typeof ACCOUNT_STATUS_USER_SELECT;
}>;

export type AccountStatusPayload = {
  isActive: boolean;
};

type ParseAccountStatusResult =
  | { ok: true; value: AccountStatusPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAccountStatusPayload(input: unknown): ParseAccountStatusResult {
  if (!isRecord(input)) {
    return { ok: false, error: "El cuerpo de la solicitud no es válido." };
  }

  if (typeof input.isActive !== "boolean") {
    return { ok: false, error: "isActive debe ser un valor booleano." };
  }

  return { ok: true, value: { isActive: input.isActive } };
}

export function getAccountStatusAuditAction(isActive: boolean) {
  return isActive ? AUDIT_ACTION_USER_REACTIVATED : AUDIT_ACTION_USER_DEACTIVATED;
}

export function getAccountStatusMessage(user: AccountStatusUser, changed: boolean) {
  const state = user.isActive ? "reactivada" : "desactivada";
  return changed
    ? `La cuenta de ${user.name} fue ${state} correctamente.`
    : `La cuenta de ${user.name} ya se encontraba ${state}.`;
}

export function getAccountStatusAuditDetails(user: AccountStatusUser) {
  const state = user.isActive ? "reactivado" : "dado de baja (Soft Delete)";
  return `Usuario ${user.name} (${user.email}) [ID: ${user.id}] ${state}. Identidad preservada para trazabilidad histórica.`;
}
