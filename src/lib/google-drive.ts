import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export type DrivePdfFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

export async function getDriveAccessToken(refreshToken: string) {
  const credentials = await getGoogleCredentials();

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error("Credenciales OAuth de Google Drive no configuradas.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error("No se pudo renovar el token de Google Drive.");
  }

  const data = await response.json();
  return String(data.access_token || "");
}

export async function listDrivePdfs(folderId: string, accessToken: string) {
  const files: DrivePdfFile[] = [];
  let pageToken = "";

  do {
    const query = `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${GOOGLE_FILES_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("No se pudieron listar los documentos de Google Drive.");
    }

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files;
}

export async function getDriveFileMetadata(fileId: string, accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,parents,modifiedTime",
    supportsAllDrives: "true",
  });

  const response = await fetch(`${GOOGLE_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("No se pudo leer la metadata del documento en Drive.");
  }

  return response.json() as Promise<DrivePdfFile & { parents?: string[] }>;
}

export async function downloadDriveFile(fileId: string, accessToken: string) {
  const params = new URLSearchParams({
    alt: "media",
    supportsAllDrives: "true",
  });

  const response = await fetch(`${GOOGLE_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("No se pudo descargar el PDF desde Google Drive.");
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function uploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, accessToken: string) {
  if (pdfBuffer.byteLength < 5 * 1024 * 1024) {
    return simpleUploadDrivePdf(folderId, fileName, pdfBuffer, accessToken);
  }

  return resumableUploadDrivePdf(folderId, fileName, pdfBuffer, accessToken);
}

async function simpleUploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, accessToken: string) {
  const boundary = `gobernanza_${randomUUID()}`;
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf",
  };

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(`${GOOGLE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.byteLength),
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    throw new Error("No se pudo subir el PDF a Google Drive.");
  }

  return response.json() as Promise<{ id: string; name: string }>;
}

async function resumableUploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, accessToken: string) {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf",
  };

  const initResponse = await fetch(`${GOOGLE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(pdfBuffer.byteLength),
    },
    body: JSON.stringify(metadata),
  });

  if (!initResponse.ok) {
    throw new Error("No se pudo iniciar la subida resumable a Google Drive.");
  }

  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Google Drive no devolvió URL de subida.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdfBuffer.byteLength),
    },
    body: new Uint8Array(pdfBuffer),
  });

  if (!uploadResponse.ok) {
    throw new Error("No se pudo completar la subida del PDF a Google Drive.");
  }

  return uploadResponse.json() as Promise<{ id: string; name: string }>;
}

async function getGoogleCredentials(): Promise<GoogleCredentials> {
  const envCredentials = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  };

  const config = await prisma.config.findFirst({
    select: { cloudCredentials: true },
  });

  if (!config?.cloudCredentials) return envCredentials;

  try {
    const parsed = JSON.parse(config.cloudCredentials);
    return {
      clientId: parsed.clientId || envCredentials.clientId,
      clientSecret: parsed.clientSecret || envCredentials.clientSecret,
    };
  } catch {
    return envCredentials;
  }
}
