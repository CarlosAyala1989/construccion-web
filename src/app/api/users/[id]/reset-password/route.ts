import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// PATCH /api/users/[id]/reset-password — Fuerza el cambio de contraseña.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const params = await props.params;
    const { id } = params;
    const data = await request.json();
    const { newPassword } = data;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Registra el restablecimiento de contraseña en la bitácora.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "PASSWORD_RESET",
        details: `Contraseña reseteada para usuario ID: ${id}`,
        status: "SUCCESS",
      }
    });

    return NextResponse.json({ success: true, message: "Contraseña actualizada exitosamente." });
  } catch (error) {
    return NextResponse.json({ error: "Error al resetear contraseña" }, { status: 500 });
  }
}
