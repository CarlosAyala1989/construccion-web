import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession, unauthorizedAdminResponse } from "@/lib/admin-session";
import {
  ACCOUNT_STATUS_USER_SELECT,
  AUDIT_STATUS_SUCCESS,
  getAccountStatusAuditAction,
  getAccountStatusAuditDetails,
  getAccountStatusMessage,
  parseAccountStatusPayload,
} from "@/lib/user-status";

/**
 * Cambia únicamente el estado lógico de una cuenta operativa.
 * El registro de usuario se conserva y la transición se audita en la misma transacción.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return unauthorizedAdminResponse();

  const { id: userId } = await props.params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: "El identificador del usuario es obligatorio." }, { status: 400 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON de la solicitud no es válido." }, { status: 400 });
  }

  const parsedPayload = parseAccountStatusPayload(requestBody);
  if (!parsedPayload.ok) {
    return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
  }

  const { isActive: requestedIsActive } = parsedPayload.value;

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: ACCOUNT_STATUS_USER_SELECT,
    });

    if (!targetUser) {
      return NextResponse.json({ error: "El usuario no existe." }, { status: 404 });
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json(
        { error: "Las cuentas administradoras no pueden cambiar de estado desde este flujo." },
        { status: 400 }
      );
    }

    if (targetUser.isActive === requestedIsActive) {
      return NextResponse.json({
        user: targetUser,
        changed: false,
        message: getAccountStatusMessage(targetUser, false),
      });
    }

    const updatedUser = await prisma.$transaction(async transaction => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { isActive: requestedIsActive },
        select: ACCOUNT_STATUS_USER_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          userId: session.user.id,
          userName: session.user.name || "Admin",
          action: getAccountStatusAuditAction(user.isActive),
          details: getAccountStatusAuditDetails(user),
          status: AUDIT_STATUS_SUCCESS,
        },
      });

      return user;
    });

    return NextResponse.json({
      user: updatedUser,
      changed: true,
      message: getAccountStatusMessage(updatedUser, true),
    });
  } catch (error) {
    console.error("[RF-02] Error al cambiar el estado lógico de la cuenta", {
      actorUserId: session.user.id,
      targetUserId: userId,
      requestedIsActive,
      error,
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "El usuario no existe." }, { status: 404 });
    }

    return NextResponse.json({ error: "No se pudo actualizar el estado del usuario." }, { status: 500 });
  }
}
