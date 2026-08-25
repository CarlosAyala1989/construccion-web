import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession, unauthorizedAdminResponse } from "@/lib/admin-session";
import {
  ACCESS_ROLE_DESKTOP_SCANNER,
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_GLOBAL,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
  replaceUserPasswordGrants,
} from "@/lib/document-access";
import {
  AccountStatusError,
  changeUserAccountStatus,
  parseAccountStatusPayload,
} from "@/lib/user-status";

type UserUpdateRequest = {
  isActive?: boolean;
  name?: string;
  email?: string;
  role?: string;
  accessRole?: string;
  workspaceIds?: string[];
  documentAccessMode?: string;
  passwordGrantKeys?: string[];
};

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return unauthorizedAdminResponse();

  const { id: userId } = await props.params;

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON de la solicitud no es válido." }, { status: 400 });
  }

  if (typeof requestBody !== "object" || requestBody === null || Array.isArray(requestBody)) {
    return NextResponse.json({ error: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const data = requestBody as UserUpdateRequest;

  try {
    if (Object.prototype.hasOwnProperty.call(data, "isActive")) {
      const parsedStatus = parseAccountStatusPayload(data);
      if (!parsedStatus.ok) {
        return NextResponse.json({ error: parsedStatus.error }, { status: 400 });
      }

      const statusResult = await changeUserAccountStatus({
        actorUserId: session.user.id,
        actorUserName: session.user.name,
        targetUserId: userId,
        requestedIsActive: parsedStatus.value.isActive,
      });

      return NextResponse.json(statusResult);
    }

    const {
      name,
      email,
      role,
      accessRole,
      workspaceIds,
      documentAccessMode,
      passwordGrantKeys,
    } = data;

    const userUpdateData: Prisma.UserUpdateInput = {};
    if (name !== undefined) userUpdateData.name = name;
    if (email !== undefined) userUpdateData.email = email;
    if (role !== undefined) userUpdateData.role = role;
    if (accessRole !== undefined) {
      userUpdateData.accessRole =
        accessRole === ACCESS_ROLE_WEB_VIEWER ? ACCESS_ROLE_WEB_VIEWER : ACCESS_ROLE_DESKTOP_SCANNER;
    }
    if (documentAccessMode !== undefined) {
      userUpdateData.documentAccessMode =
        documentAccessMode === DOCUMENT_ACCESS_GLOBAL ? DOCUMENT_ACCESS_GLOBAL : DOCUMENT_ACCESS_PASSWORD_SCOPED;
    }
    if (workspaceIds !== undefined) {
      userUpdateData.workspaces = {
        set: workspaceIds.map(workspaceId => ({ id: workspaceId })),
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: userUpdateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        accessRole: true,
        documentAccessMode: true,
        twoFactorEnabled: true,
        twoFactorConfirmedAt: true,
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    const shouldUpdatePasswordGrants =
      accessRole !== undefined ||
      documentAccessMode !== undefined ||
      passwordGrantKeys !== undefined ||
      workspaceIds !== undefined;

    if (shouldUpdatePasswordGrants) {
      const nextWorkspaceIds = workspaceIds ?? updatedUser.workspaces.map(workspace => workspace.id);
      const nextAccessRole = updatedUser.accessRole;
      const nextAccessMode = updatedUser.documentAccessMode;

      if (nextAccessRole !== ACCESS_ROLE_WEB_VIEWER || nextAccessMode === DOCUMENT_ACCESS_GLOBAL) {
        await replaceUserPasswordGrants(userId, nextWorkspaceIds, []);
      } else if (passwordGrantKeys !== undefined) {
        await replaceUserPasswordGrants(userId, nextWorkspaceIds, passwordGrantKeys);
      } else if (workspaceIds !== undefined) {
        const existingGrantKeys = updatedUser.documentPasswordGrants
          .filter(grant => nextWorkspaceIds.includes(grant.workspaceId))
          .map(grant => grant.credentialKey);
        await replaceUserPasswordGrants(userId, nextWorkspaceIds, existingGrantKeys);
      }
    }

    const userWithGrants = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        accessRole: true,
        documentAccessMode: true,
        twoFactorEnabled: true,
        twoFactorConfirmedAt: true,
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    return NextResponse.json(userWithGrants || updatedUser);
  } catch (error) {
    if (error instanceof AccountStatusError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }

    console.error("Error al actualizar el usuario", {
      actorUserId: session.user.id,
      targetUserId: userId,
      error,
    });

    return NextResponse.json({ error: "Error al actualizar el usuario" }, { status: 500 });
  }
}
