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

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return unauthorizedAdminResponse();

  try {
    const { id: userId } = await props.params;
    const requestBody = await request.json();

    if (requestBody?.isActive !== undefined) {
      return NextResponse.json(
        { error: "El estado de la cuenta debe modificarse mediante el endpoint de estado." },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      role,
      accessRole,
      workspaceIds,
      documentAccessMode,
      passwordGrantKeys,
    } = requestBody;

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
        set: workspaceIds.map((workspaceId: string) => ({ id: workspaceId })),
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
    console.error("Error al actualizar el usuario", {
      actorUserId: session.user.id,
      error,
    });
    return NextResponse.json({ error: "Error al actualizar el usuario" }, { status: 500 });
  }
}
