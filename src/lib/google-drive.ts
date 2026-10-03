import { prisma } from "@/lib/prisma";
import { createHash, randomUUID, timingSafeEqual } from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const DRIVE_SHA256_PROPERTY = "sha256";

export type DrivePdfFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
};

export type DriveFolderItem = DrivePdfFile;

type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

type GoogleErrorPayload = {
  error?: string;
  error_description?: string;
  message?: string;
};

export class GoogleDriveError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GoogleDriveError";
    this.status = status;
    this.code = code;
  }
}

export function getGoogleDriveErrorStatus(error: unknown, fallbackStatus = 500) {
  return error instanceof GoogleDriveError ? error.status : fallbackStatus;
}

export async function getDriveAccessToken(refreshToken: string) {
  const credentials = await getGoogleCredentials();

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new GoogleDriveError("Credenciales OAuth de Google Drive no configuradas.", 500, "missing_google_credentials");
  }

  if (!refreshToken.trim()) {
    throw new GoogleDriveError(
      "Este espacio no tiene un refresh token de Google Drive guardado. Reconecta la carpeta de Google Drive.",
      400,
      "missing_refresh_token"
    );
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
    const payload = await readGoogleError(response);
    console.error("[google-drive] token refresh failed", {
      status: response.status,
      code: payload.error,
      description: payload.error_description || payload.message,
    });

    throw buildGoogleTokenError(payload, response.status);
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
      const payload = await readGoogleError(response);
      throw new GoogleDriveError(
        payload.error_description || payload.message || "No se pudieron listar los documentos de Google Drive.",
        response.status === 401 || response.status === 403 ? response.status : 502,
        payload.error
      );
    }

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files;
}

export async function listDriveFolder(folderId: string, accessToken: string) {
  const items: DriveFolderItem[] = [];
  let pageToken = "";

  do {
    const query = `'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='${DRIVE_FOLDER_MIME_TYPE}')`;
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
      orderBy: "name_natural",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${GOOGLE_FILES_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const payload = await readGoogleError(response);
      throw new GoogleDriveError(
        payload.error_description || payload.message || "No se pudo listar la carpeta de Google Drive.",
        response.status === 401 || response.status === 403 ? response.status : 502,
        payload.error
      );
    }

    const data = await response.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return items.sort((left, right) => {
    const leftFolder = left.mimeType === DRIVE_FOLDER_MIME_TYPE;
    const rightFolder = right.mimeType === DRIVE_FOLDER_MIME_TYPE;
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name, "es");
  });
}

export async function getDriveFileMetadata(fileId: string, accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,parents,modifiedTime,appProperties",
    supportsAllDrives: "true",
  });

  const response = await fetch(`${GOOGLE_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await readGoogleError(response);
    throw new GoogleDriveError(
      payload.error_description || payload.message || "No se pudo leer la metadata del documento en Drive.",
      response.status === 401 || response.status === 403 || response.status === 404 ? response.status : 502,
      payload.error
    );
  }

  return response.json() as Promise<DrivePdfFile & { parents?: string[] }>;
}

export async function isDriveItemWithinFolder(itemId: string, rootFolderId: string, accessToken: string) {
  if (itemId === rootFolderId) return true;

  const pending = [itemId];
  const visited = new Set<string>();

  while (pending.length > 0 && visited.size < 100) {
    const currentId = pending.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const metadata = await getDriveFileMetadata(currentId, accessToken);
    for (const parentId of metadata.parents || []) {
      if (parentId === rootFolderId) return true;
      if (!visited.has(parentId)) pending.push(parentId);
    }
  }

  return false;
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
    const payload = await readGoogleError(response);
    throw new GoogleDriveError(
      payload.error_description || payload.message || "No se pudo descargar el PDF desde Google Drive.",
      response.status === 401 || response.status === 403 || response.status === 404 ? response.status : 502,
      payload.error
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function uploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, accessToken: string) {
  const sha256 = calculateSha256(pdfBuffer);
  const availableFileName = await preventDriveNameCollision(folderId, fileName, accessToken);
  const storedFile = pdfBuffer.byteLength < 5 * 1024 * 1024
    ? await simpleUploadDrivePdf(folderId, availableFileName, pdfBuffer, sha256, accessToken)
    : await resumableUploadDrivePdf(folderId, availableFileName, pdfBuffer, sha256, accessToken);

  return { ...storedFile, sha256 };
}

// RF-14
async function preventDriveNameCollision(folderId: string, fileName: string, accessToken: string) {
  const files = await listDrivePdfs(folderId, accessToken);
  const existingNames = new Set(files.map(file => file.name));
  if (!existingNames.has(fileName)) return fileName;

  const extensionIndex = fileName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex) : "";
  let version = 2;
  let candidate = `${baseName}_v${version}${extension}`;

  while (existingNames.has(candidate)) {
    version += 1;
    candidate = `${baseName}_v${version}${extension}`;
  }

  return candidate;
}

export function calculateSha256(fileBuffer: Buffer) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}

export function verifyDriveFileSha256(fileBuffer: Buffer, expectedSha256?: string) {
  if (!expectedSha256) {
    throw new GoogleDriveError(
      "No se puede verificar la integridad del archivo porque no tiene una huella SHA-256 registrada.",
      409,
      "sha256_missing"
    );
  }

  const normalizedExpected = expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) {
    throw new GoogleDriveError(
      "La huella SHA-256 registrada no es válida. El archivo no puede abrirse de forma segura.",
      409,
      "sha256_invalid"
    );
  }

  const actualSha256 = calculateSha256(fileBuffer);
  const matches = timingSafeEqual(
    Buffer.from(actualSha256, "hex"),
    Buffer.from(normalizedExpected, "hex")
  );

  if (!matches) {
    throw new GoogleDriveError(
      "El archivo fue modificado y no es el mismo que se envió originalmente. La verificación SHA-256 falló.",
      409,
      "sha256_mismatch"
    );
  }

  return actualSha256;
}

async function simpleUploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, sha256: string, accessToken: string) {
  const boundary = `gobernanza_${randomUUID()}`;
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf",
    appProperties: { [DRIVE_SHA256_PROPERTY]: sha256 },
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
    const payload = await readGoogleError(response);
    throw new GoogleDriveError(
      payload.error_description || payload.message || "No se pudo subir el PDF a Google Drive.",
      response.status === 401 || response.status === 403 ? response.status : 502,
      payload.error
    );
  }

  return response.json() as Promise<{ id: string; name: string }>;
}

async function resumableUploadDrivePdf(folderId: string, fileName: string, pdfBuffer: Buffer, sha256: string, accessToken: string) {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf",
    appProperties: { [DRIVE_SHA256_PROPERTY]: sha256 },
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
    const payload = await readGoogleError(initResponse);
    throw new GoogleDriveError(
      payload.error_description || payload.message || "No se pudo iniciar la subida resumable a Google Drive.",
      initResponse.status === 401 || initResponse.status === 403 ? initResponse.status : 502,
      payload.error
    );
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
    const payload = await readGoogleError(uploadResponse);
    throw new GoogleDriveError(
      payload.error_description || payload.message || "No se pudo completar la subida del PDF a Google Drive.",
      uploadResponse.status === 401 || uploadResponse.status === 403 ? uploadResponse.status : 502,
      payload.error
    );
  }

  return uploadResponse.json() as Promise<{ id: string; name: string }>;
}

export async function getGoogleCredentials(): Promise<GoogleCredentials> {
  const envCredentials = {
    clientId: (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };

  const config = await prisma.config.findFirst({
    select: { cloudCredentials: true },
  });

  if (!config?.cloudCredentials) return envCredentials;

  try {
    const parsed = JSON.parse(config.cloudCredentials);
    const storedCredentials = {
      clientId: String(parsed.clientId || "").trim(),
      clientSecret: String(parsed.clientSecret || "").trim(),
    };

    if (storedCredentials.clientId && storedCredentials.clientSecret) {
      return storedCredentials;
    }

    return envCredentials;
  } catch {
    return envCredentials;
  }
}

export async function readGoogleError(response: Response): Promise<GoogleErrorPayload> {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed?.error && typeof parsed.error === "object") {
      return {
        error: parsed.error.status || parsed.error.code,
        message: parsed.error.message,
      };
    }

    return {
      error: parsed.error,
      error_description: parsed.error_description,
      message: parsed.message,
    };
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function buildGoogleTokenError(payload: GoogleErrorPayload, status: number) {
  const code = payload.error || "google_token_error";
  const description = payload.error_description || payload.message || "";

  if (code === "invalid_grant") {
    return new GoogleDriveError(
      "La conexión de Google Drive expiró o fue revocada. Reconecta la carpeta de Google Drive.",
      401,
      code
    );
  }

  if (code === "invalid_client" || code === "unauthorized_client") {
    return new GoogleDriveError(
      "Las credenciales OAuth de Google Drive no coinciden con el token guardado. Verifica el Client ID y Client Secret y reconecta la carpeta.",
      502,
      code
    );
  }

  return new GoogleDriveError(
    description || "No se pudo renovar el token de Google Drive.",
    status === 400 || status === 401 || status === 403 ? status : 502,
    code
  );
}
