import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  DOCUMENT_ACCESS_GLOBAL,
  canUseWebDocuments,
  getActiveRequestUser,
  getAuthorizedWorkspace,
  getCandidatePasswordsForUser,
} from "@/lib/document-access";
import { getWorkspaceProvider, readLocalPdf } from "@/lib/document-storage";
import { DRIVE_SHA256_PROPERTY, downloadDriveFile, getDriveAccessToken, getDriveFileMetadata, getGoogleDriveErrorStatus, isDriveItemWithinFolder, verifyDriveFileSha256 } from "@/lib/google-drive";
import { getPdfProcessingErrorStatus, renderPdfImagesForViewing } from "@/lib/pdf-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getActiveRequestUser(session.user.id);
  if (!user?.isActive || !canUseWebDocuments(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const fileId = request.nextUrl.searchParams.get("fileId");

  if (!workspaceId || !fileId) {
    return NextResponse.json({ error: "workspaceId y fileId son requeridos" }, { status: 400 });
  }

  const workspace = await getAuthorizedWorkspace(user, workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "No tienes acceso a este espacio" }, { status: 403 });
  }

  try {
    const provider = getWorkspaceProvider(workspace);
    let fileName = "documento.pdf";
    let encryptedPdf: Buffer;

    if (provider === "GOOGLE_DRIVE") {
      const accessToken = await getDriveAccessToken(workspace.cloudRefreshToken || "");
      const metadata = await getDriveFileMetadata(fileId, accessToken);
      const allowed = await isDriveItemWithinFolder(
        fileId,
        workspace.cloudFolderId || "",
        accessToken,
      );

      if (metadata.mimeType !== "application/pdf" || !allowed) {
        return NextResponse.json({ error: "Documento fuera del espacio autorizado" }, { status: 403 });
      }

      fileName = metadata.name;
      encryptedPdf = await downloadDriveFile(fileId, accessToken);
      verifyDriveFileSha256(encryptedPdf, metadata.appProperties?.[DRIVE_SHA256_PROPERTY]);
    } else if (provider === "LOCAL") {
      const localFile = await readLocalPdf(workspace, fileId);
      fileName = localFile.name;
      encryptedPdf = localFile.buffer;
    } else {
      return NextResponse.json(
        { error: "Este espacio no tiene un repositorio web compatible configurado." },
        { status: 400 }
      );
    }

    const candidates = await getCandidatePasswordsForUser(user, workspace);
    if (user.role !== "ADMIN" && user.documentAccessMode !== DOCUMENT_ACCESS_GLOBAL && candidates.length === 0) {
      return NextResponse.json({ error: "No tienes contraseñas autorizadas para este espacio." }, { status: 403 });
    }

    const rendered = await renderPdfImagesForViewing(encryptedPdf, candidates);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "DOCUMENT_VIEWED",
        details: JSON.stringify({
          fileName,
          provider,
          passwordSource: rendered.matched?.label || "Sin contraseña",
          pageCount: rendered.pages.length,
        }),
        status: "SUCCESS",
        workspaceId: workspace.id,
      },
    });

    return NextResponse.json(
      {
        fileName,
        pages: rendered.pages.map(page => ({
          pageNumber: page.pageNumber,
          src: `data:image/png;base64,${page.buffer.toString("base64")}`,
        })),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const errorCode = error instanceof Error && "code" in error ? String(error.code) : undefined;

    console.error("[documents/view] failed", {
      workspaceId: workspace.id,
      fileId,
      error: errorMessage,
      code: errorCode,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "DOCUMENT_VIEW_FAILED",
        details: JSON.stringify({
          fileId,
          error: errorMessage,
          code: errorCode,
        }),
        status: "FAILURE",
        workspaceId: workspace.id,
      },
    });

    return NextResponse.json(
      { error: errorMessage || "Error al visualizar documento" },
      { status: getGoogleDriveErrorStatus(error, getPdfProcessingErrorStatus(error)) }
    );
  }
}
