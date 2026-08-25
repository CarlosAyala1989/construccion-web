import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "ADMIN" ? session : null;
}

export function unauthorizedAdminResponse() {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
