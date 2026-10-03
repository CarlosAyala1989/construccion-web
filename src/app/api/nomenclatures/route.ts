import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/nomenclatures — Enumera todos los campos de nomenclatura.
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const fields = await prisma.nomenclatureField.findMany({
    orderBy: { fieldOrder: "asc" }
  });

  return NextResponse.json(fields);
}

// POST /api/nomenclatures — Crea un campo de nomenclatura.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const { fieldName, fieldOrder, isRequired, separator } = data;

    const newField = await prisma.nomenclatureField.create({
      data: {
        fieldName,
        fieldOrder: fieldOrder ?? 0,
        isRequired: isRequired ?? true,
        separator: separator ?? "_",
      }
    });

    return NextResponse.json(newField, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear campo de nomenclatura" }, { status: 500 });
  }
}

// DELETE /api/nomenclatures — Elimina un campo de nomenclatura por ID (mediante parámetro de consulta).
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Se requiere el ID del campo" }, { status: 400 });
    }

    await prisma.nomenclatureField.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Error al eliminar campo de nomenclatura" }, { status: 500 });
  }
}
