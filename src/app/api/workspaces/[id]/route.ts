import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ACCESS_ROLE_WEB_VIEWER, DOCUMENT_ACCESS_PASSWORD_SCOPED, defaultCredentialKey } from "@/lib/document-access";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const params = await props.params;
    const { id } = params;
    const data = await request.json();
    const { userIds } = data; // Array of user IDs to assign

    // En Prisma, para actualizar una relación muchos a muchos, usamos "set" 
    // para reemplazar la lista completa de usuarios asignados.
    const updatedWorkspace = await prisma.workspace.update({
      where: { id },
      data: {
        users: {
          set: userIds.map((userId: string) => ({ id: userId }))
        }
      },
      include: {
        users: true
      }
    });

    await prisma.documentPasswordGrant.deleteMany({
      where: {
        workspaceId: id,
        userId: { notIn: userIds },
      },
    });

    const scopedUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        accessRole: ACCESS_ROLE_WEB_VIEWER,
        documentAccessMode: DOCUMENT_ACCESS_PASSWORD_SCOPED,
      },
      include: {
        documentPasswordGrants: {
          where: { workspaceId: id },
        },
      },
    });

    await Promise.all(
      scopedUsers
        .filter(user => user.documentPasswordGrants.length === 0)
        .map(user =>
          prisma.documentPasswordGrant.create({
            data: {
              userId: user.id,
              workspaceId: id,
              credentialKey: defaultCredentialKey(id),
              sourceType: "DEFAULT",
              label: `Predeterminada de ${updatedWorkspace.name}`,
            },
          })
        )
    );

    // Audit log for permission change
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "WORKSPACE_USERS_UPDATED",
        details: `Usuarios asignados a espacio ${updatedWorkspace.name}: ${userIds.length} usuario(s)`,
        status: "SUCCESS",
        workspaceId: id,
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch {
    return NextResponse.json({ error: "Error al asignar usuarios al espacio de trabajo" }, { status: 500 });
  }
}
