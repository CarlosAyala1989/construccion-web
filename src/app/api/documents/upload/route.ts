import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getActiveRequestUser, getAuthorizedWorkspace, getUploadCredentialForUser } from "@/lib/document-access";
import { getWorkspaceProvider, sanitizePdfFileName, writeLocalPdf } from "@/lib/document-storage";
import { DRIVE_FOLDER_MIME_TYPE, getDriveAccessToken, getDriveFileMetadata, getGoogleDriveErrorStatus, isDriveItemWithinFolder, uploadDrivePdf } from "@/lib/google-drive";
import { compressPdfForStorage, encryptPdfForStorage } from "@/lib/pdf-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getActiveRequestUser(session.user.id);
  if (!user?.isActive || user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const workspaceId = String(formData.get("workspaceId") || "");
    const requestedFolderId = String(formData.get("folderId") || "");
    const credentialKey = formData.get("credentialKey") ? String(formData.get("credentialKey")) : null;
    const file = formData.get("file");

    if (!workspaceId || !(file instanceof File)) {
      return NextResponse.json({ error: "workspaceId y archivo PDF son requeridos" }, { status: 400 });
    }

    const workspace = await getAuthorizedWorkspace(user, workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "No tienes acceso a este espacio" }, { status: 403 });
    }

    const fileName = sanitizePdfFileName(file.name || "documento.pdf");
    const originalBuffer = Buffer.from(await file.arrayBuffer());

    if (originalBuffer.subarray(0, 4).toString("utf8") !== "%PDF") {
      return NextResponse.json({ error: "Solo se aceptan archivos PDF válidos." }, { status: 400 });
    }

    const credential = await getUploadCredentialForUser(user, workspace, credentialKey);
    if (!credential?.password) {
      return NextResponse.json({ error: "No tienes permiso para usar esa contraseña de documento." }, { status: 403 });
    }

    const config = await prisma.config.findFirst({
      select: {
        compressionEnabled: true,
        compressionThresholdMb: true,
      },
    });
    const compressionThresholdBytes = (config?.compressionThresholdMb || 10) * 1024 * 1024;
    const preparedPdf = config?.compressionEnabled && originalBuffer.byteLength > compressionThresholdBytes
      ? await compressPdfForStorage(originalBuffer)
      : { buffer: originalBuffer, compressed: false };
    const encryptedPdf = await encryptPdfForStorage(preparedPdf.buffer, credential.password);
    const provider = getWorkspaceProvider(workspace);
    let storedFile: { id: string; name: string; sha256?: string };

    if (provider === "GOOGLE_DRIVE") {
      const accessToken = await getDriveAccessToken(workspace.cloudRefreshToken || "");
      const rootFolderId = workspace.cloudFolderId || "";
      const folderId = requestedFolderId || rootFolderId;
      const allowed = await isDriveItemWithinFolder(folderId, rootFolderId, accessToken);
      const folderMetadata = folderId === rootFolderId
        ? null
        : await getDriveFileMetadata(folderId, accessToken);
      if (!allowed || (folderMetadata && folderMetadata.mimeType !== DRIVE_FOLDER_MIME_TYPE)) {
        return NextResponse.json({ error: "Carpeta fuera del espacio autorizado" }, { status: 403 });
      }
      storedFile = await uploadDrivePdf(folderId, fileName, encryptedPdf, accessToken);
    } else if (provider === "LOCAL") {
      storedFile = await writeLocalPdf(workspace, fileName, encryptedPdf, requestedFolderId);
    } else {
      return NextResponse.json(
        { error: "Este espacio no tiene un repositorio web compatible configurado." },
        { status: 400 }
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "DOCUMENT_UPLOADED_WEB",
        details: JSON.stringify({
          fileName: storedFile.name,
          originalName: file.name,
          provider,
          encryptedWith: credential.label,
          sourceType: credential.sourceType,
          policyId: credential.policyId,
          fileSizeMb: Number((encryptedPdf.byteLength / (1024 * 1024)).toFixed(2)),
          compressed: preparedPdf.compressed,
          sha256: storedFile.sha256,
        }),
        status: "SUCCESS",
        workspaceId: workspace.id,
      },
    });

    return NextResponse.json({ success: true, file: { ...storedFile, provider } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al subir documento" },
      { status: getGoogleDriveErrorStatus(error) }
    );
  }
}
