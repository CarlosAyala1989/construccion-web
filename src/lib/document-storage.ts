import type { Workspace } from "@prisma/client";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export type DocumentProvider = "GOOGLE_DRIVE" | "LOCAL" | "UNSUPPORTED";

export type DocumentListItem = {
  id: string;
  name: string;
  provider: DocumentProvider;
  size?: string;
  modifiedTime?: string;
};

export function getWorkspaceProvider(workspace: Pick<Workspace, "cloudPath" | "cloudFolderId" | "cloudRefreshToken">): DocumentProvider {
  if (workspace.cloudPath.startsWith("Google Drive:") || workspace.cloudPath.startsWith("Drive:")) {
    return workspace.cloudFolderId && workspace.cloudRefreshToken ? "GOOGLE_DRIVE" : "UNSUPPORTED";
  }

  if (workspace.cloudPath.startsWith("LOCAL:")) {
    return "LOCAL";
  }

  return "UNSUPPORTED";
}

export async function listLocalPdfs(workspace: Pick<Workspace, "cloudPath" | "name">): Promise<DocumentListItem[]> {
  const directory = getLocalDocumentDirectory(workspace);
  await mkdir(directory, { recursive: true });

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map(async entry => {
        const filePath = path.join(directory, entry.name);
        const info = await stat(filePath);

        return {
          id: encodeLocalFileId(entry.name),
          name: entry.name,
          provider: "LOCAL" as const,
          size: String(info.size),
          modifiedTime: info.mtime.toISOString(),
        };
      })
  );

  return files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
}

export async function readLocalPdf(workspace: Pick<Workspace, "cloudPath" | "name">, fileId: string) {
  const fileName = decodeLocalFileId(fileId);
  const directory = getLocalDocumentDirectory(workspace);
  const filePath = path.join(directory, fileName);
  const resolvedDirectory = path.resolve(directory);
  const resolvedFilePath = path.resolve(filePath);

  if (!resolvedFilePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
    throw new Error("Ruta de documento inválida.");
  }

  return {
    name: fileName,
    buffer: await readFile(resolvedFilePath),
  };
}

export async function writeLocalPdf(workspace: Pick<Workspace, "cloudPath" | "name">, fileName: string, buffer: Buffer) {
  const directory = getLocalDocumentDirectory(workspace);
  await mkdir(directory, { recursive: true });

  const safeName = sanitizePdfFileName(fileName);
  const targetPath = await preventLocalCollision(directory, safeName);
  await writeFile(targetPath, buffer);

  return {
    id: encodeLocalFileId(path.basename(targetPath)),
    name: path.basename(targetPath),
  };
}

export function sanitizePdfFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || `documento-${Date.now()}`;
  const withExtension = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
  return withExtension;
}

function getLocalDocumentDirectory(workspace: Pick<Workspace, "cloudPath" | "name">) {
  const basePath = workspace.cloudPath.replace(/^LOCAL:\s*/, "").trim();
  const expandedBasePath = basePath.startsWith("~") ? path.join(os.homedir(), basePath.slice(1)) : basePath;
  return path.join(expandedBasePath, workspace.name);
}

function encodeLocalFileId(fileName: string) {
  return Buffer.from(fileName, "utf8").toString("base64url");
}

function decodeLocalFileId(fileId: string) {
  const fileName = Buffer.from(fileId, "base64url").toString("utf8");
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || !fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Identificador de documento inválido.");
  }

  return fileName;
}

async function preventLocalCollision(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let version = 2;

  while (await exists(candidate)) {
    candidate = path.join(directory, `${baseName}_v${version}${extension}`);
    version += 1;
  }

  return candidate;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
