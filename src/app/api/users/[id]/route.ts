import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  ACCESS_ROLE_DESKTOP_SCANNER,
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_GLOBAL,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
  replaceUserPasswordGrants,
} from "@/lib/document-access";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const params = await props.params;
    const { id } = params;
    const data = await request.json();
    const { isActive, name, email, role, accessRole, workspaceIds, documentAccessMode, passwordGrantKeys } = data;

    const updateData: Prisma.UserUpdateInput = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (accessRole !== undefined) {
      updateData.accessRole = accessRole === ACCESS_ROLE_WEB_VIEWER ? ACCESS_ROLE_WEB_VIEWER : ACCESS_ROLE_DESKTOP_SCANNER;
    }
    if (documentAccessMode !== undefined) {
      updateData.documentAccessMode =
        documentAccessMode === DOCUMENT_ACCESS_GLOBAL ? DOCUMENT_ACCESS_GLOBAL : DOCUMENT_ACCESS_PASSWORD_SCOPED;
    }
    if (workspaceIds !== undefined) {
      updateData.workspaces = {
        set: workspaceIds.map((wsId: string) => ({ id: wsId }))
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        accessRole: true,
        documentAccessMode: true,
        workspaces: true,
        documentPasswordGrants: true,
      }
    });

    if (accessRole !== undefined || documentAccessMode !== undefined || passwordGrantKeys !== undefined || workspaceIds !== undefined) {
      const nextWorkspaceIds = workspaceIds ?? updatedUser.workspaces.map(workspace => workspace.id);
      const nextAccessRole = updatedUser.accessRole;
      const nextAccessMode = updatedUser.documentAccessMode;

      if (nextAccessRole !== ACCESS_ROLE_WEB_VIEWER || nextAccessMode === DOCUMENT_ACCESS_GLOBAL) {
        await replaceUserPasswordGrants(id, nextWorkspaceIds, []);
      } else if (passwordGrantKeys !== undefined) {
        await replaceUserPasswordGrants(id, nextWorkspaceIds, passwordGrantKeys);
      } else if (workspaceIds !== undefined) {
        const existingGrantKeys = updatedUser.documentPasswordGrants
          .filter(grant => nextWorkspaceIds.includes(grant.workspaceId))
          .map(grant => grant.credentialKey);
        await replaceUserPasswordGrants(id, nextWorkspaceIds, existingGrantKeys);
      }
    }

    const userWithGrants = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        accessRole: true,
        documentAccessMode: true,
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    // Audit log for status change (Soft Delete / Reactivation)
    if (isActive !== undefined) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          userName: session.user.name || "Admin",
          action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
          details: `Usuario ${updatedUser.name} (${updatedUser.email}) ${isActive ? "reactivado" : "dado de baja (Soft Delete)"}`,
          status: "SUCCESS",
        }
      });
    }

    return NextResponse.json(userWithGrants || updatedUser);
  } catch {
    return NextResponse.json({ error: "Error al actualizar estado del usuario" }, { status: 500 });
  }
}
