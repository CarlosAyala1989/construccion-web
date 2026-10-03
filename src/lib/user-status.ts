// RF-02

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const AUDIT_ACTION_USER_DEACTIVATED = "USER_DEACTIVATED";
export const AUDIT_ACTION_USER_REACTIVATED = "USER_REACTIVATED";
export const AUDIT_STATUS_SUCCESS = "SUCCESS";
export const PROTECTED_ADMIN_ROLE = "ADMIN";

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

export type AccountStatusChangeResult = {
  user: AccountStatusUser;
  changed: boolean;
  message: string;
};

type ParseAccountStatusResult =
  | { ok: true; value: AccountStatusPayload }
  | { ok: false; error: string };

type ChangeAccountStatusInput = {
  actorUserId: string;
  actorUserName: string | null | undefined;
  targetUserId: string;
  requestedIsActive: boolean;
};

export class AccountStatusError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
    this.name = "AccountStatusError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAccountStatusPayload(input: unknown): ParseAccountStatusResult {
  if (!isRecord(input)) {
    return { ok: false, error: "El cuerpo de la solicitud no es válido." };
  }

  const unexpectedFields = Object.keys(input).filter(field => field !== "isActive");
  if (unexpectedFields.length > 0) {
    return { ok: false, error: "La actualización de estado solo admite el campo isActive." };
  }

  if (typeof input.isActive !== "boolean") {
    return { ok: false, error: "isActive debe ser un valor booleano." };
  }

  return { ok: true, value: { isActive: input.isActive } };
}

/**
 * Aplica una transición lógica de estado y registra su auditoría en la misma transacción.
 * El registro del modelo User nunca se elimina, para conservar su identidad en la trazabilidad histórica.
 */
export async function changeUserAccountStatus({
  actorUserId,
  actorUserName,
  targetUserId,
  requestedIsActive,
}: ChangeAccountStatusInput): Promise<AccountStatusChangeResult> {
  if (!targetUserId.trim()) {
    throw new AccountStatusError("El identificador del usuario es obligatorio.", 400);
  }

  return prisma.$transaction(async transaction => {
    const targetUser = await transaction.user.findUnique({
      where: { id: targetUserId },
      select: ACCOUNT_STATUS_USER_SELECT,
    });

    if (!targetUser) {
      throw new AccountStatusError("El usuario no existe.", 404);
    }

    if (targetUser.role === PROTECTED_ADMIN_ROLE) {
      throw new AccountStatusError(
        "Las cuentas administradoras no pueden cambiar de estado desde este flujo.",
        400
      );
    }

    if (targetUser.isActive === requestedIsActive) {
      return {
        user: targetUser,
        changed: false,
        message: getAccountStatusMessage(targetUser, false),
      };
    }

    const updatedUser = await transaction.user.update({
      where: { id: targetUserId },
      data: { isActive: requestedIsActive },
      select: ACCOUNT_STATUS_USER_SELECT,
    });

    await transaction.auditLog.create({
      data: {
        userId: actorUserId,
        userName: actorUserName || "Admin",
        action: getAccountStatusAuditAction(updatedUser.isActive),
        details: getAccountStatusAuditDetails(updatedUser),
        status: AUDIT_STATUS_SUCCESS,
      },
    });

    return {
      user: updatedUser,
      changed: true,
      message: getAccountStatusMessage(updatedUser, true),
    };
  });
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
