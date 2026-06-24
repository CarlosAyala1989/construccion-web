import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { createAuthenticatorSetup, createTotpSecret, verifyTotpCode } from "@/lib/totp";

export const runtime = "nodejs";

async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return null;
  }

  return session;
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { id } = await props.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const secret = user.twoFactorEnabled && user.twoFactorSecret ? user.twoFactorSecret : createTotpSecret();
    const setup = await createAuthenticatorSetup(user.email, secret);

    if (!user.twoFactorEnabled) {
      await prisma.user.update({
        where: { id },
        data: {
          twoFactorSecret: secret,
          twoFactorEnabled: false,
          twoFactorConfirmedAt: null,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "AUTHENTICATOR_SETUP_STARTED",
        details: `Configuración de Authenticator iniciada para ${user.name} (${user.email})`,
        status: "SUCCESS",
      },
    });

    return NextResponse.json({
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
      qrCodeDataUrl: setup.qrCodeDataUrl,
    });
  } catch {
    return NextResponse.json({ error: "Error al generar Authenticator" }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { id } = await props.params;
    const { code } = await request.json();
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const isValidCode = await verifyTotpCode(user.twoFactorSecret, code);

    if (!isValidCode) {
      return NextResponse.json({ error: "Código Authenticator inválido o vencido." }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: true,
        twoFactorConfirmedAt: new Date(),
      },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorConfirmedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "AUTHENTICATOR_ENABLED",
        details: `Authenticator activado para ${user.name} (${user.email})`,
        status: "SUCCESS",
      },
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ error: "Error al confirmar Authenticator" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { id } = await props.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorConfirmedAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "AUTHENTICATOR_DISABLED",
        details: `Authenticator desactivado para ${user.name} (${user.email})`,
        status: "SUCCESS",
      },
    });

    return NextResponse.json({ twoFactorEnabled: false, twoFactorConfirmedAt: null });
  } catch {
    return NextResponse.json({ error: "Error al desactivar Authenticator" }, { status: 500 });
  }
}
