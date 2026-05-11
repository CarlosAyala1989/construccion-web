import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/stats — Dashboard summary statistics
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const [
    totalUsers,
    activeUsers,
    totalWorkspaces,
    totalPolicies,
    totalLogs,
    recentLogs,
    successLogs,
    failureLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.workspace.count(),
    prisma.securityPolicy.count(),
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        workspace: { select: { name: true } }
      }
    }),
    prisma.auditLog.count({ where: { status: "SUCCESS" } }),
    prisma.auditLog.count({ where: { status: "FAILURE" } }),
  ]);

  return NextResponse.json({
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    totalWorkspaces,
    totalPolicies,
    totalLogs,
    successLogs,
    failureLogs,
    recentLogs,
  });
}
