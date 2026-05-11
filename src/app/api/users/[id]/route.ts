import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const params = await props.params;
    const { id } = params;
    const data = await request.json();
    const { isActive, name, email, role, workspaceIds } = data;

    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
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
        workspaces: true,
      }
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

    return NextResponse.json(updatedUser);
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar estado del usuario" }, { status: 500 });
  }
}

