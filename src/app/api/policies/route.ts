import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const policies = await prisma.securityPolicy.findMany({
    orderBy: { priority: "desc" }
  });

  return NextResponse.json(policies);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const { type, target, password, priority } = data;

    const newPolicy = await prisma.securityPolicy.create({
      data: {
        type, // "SEMANTIC" | "VISUAL"
        target,
        password,
        priority: priority || 0,
      }
    });

    return NextResponse.json(newPolicy, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear política de seguridad" }, { status: 500 });
  }
}
