/**
 * Utilidades compartidas de documento almacenamiento para servicios de la aplicación documental.
 */
import type { Workspace } from "@prisma/client";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";

/** Describe los campos y tipos de documento proveedor. */
export type DocumentProvider = "GOOGLE_DRIVE" | "LOCAL" | "UNSUPPORTED";

/** Describe los campos y tipos de documento list elemento. */
export type DocumentListItem = {
  id: string;
  name: string;
  provider: DocumentProvider;
  size?: string;
  modifiedTime?: string;
};

/** Describe los campos y tipos de documento carpeta elemento. */
export type DocumentFolderItem = {
  id: string;
  name: string;
  provider: DocumentProvider;
  modifiedTime?: string;
};

/** Obtiene espacio de trabajo proveedor dentro de documento almacenamiento. */
export function getWorkspaceProvider(workspace: Pick<Workspace, "cloudPath" | "cloudFolderId" | "cloudRefreshToken">): DocumentProvider {
  if (workspace.cloudPath.startsWith("Google Drive:") || workspace.cloudPath.startsWith("Drive:")) {
    return workspace.cloudFolderId && workspace.cloudRefreshToken ? "GOOGLE_DRIVE" : "UNSUPPORTED";
  }

  if (workspace.cloudPath.startsWith("LOCAL:")) {
    return "LOCAL";
  }

  return "UNSUPPORTED";
}

// RF-18
export async function listLocalPdfs(workspace: Pick<Workspace, "cloudPath" | "name">): Promise<DocumentListItem[]> {
  const listing = await listLocalFolder(workspace);
  return listing.files;
}

// RF-18
export async function listLocalFolder(workspace: Pick<Workspace, "cloudPath" | "name">, folderId = "") {
  const rootDirectory = getLocalDocumentDirectory(workspace);
  await mkdir(rootDirectory, { recursive: true });

  const relativeDirectory = folderId ? decodeLocalPathId(folderId) : "";
  const directory = await resolveLocalPath(rootDirectory, relativeDirectory);
  const directoryInfo = await stat(directory);
  if (!directoryInfo.isDirectory()) {
    throw new Error("La carpeta solicitada no es válida.");
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const folders: DocumentFolderItem[] = [];
  const files: DocumentListItem[] = [];

  await Promise.all(entries.map(async entry => {
    const relativePath = path.join(relativeDirectory, entry.name);
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const info = await stat(entryPath);
      folders.push({
        id: encodeLocalPathId(relativePath),
        name: entry.name,
        provider: "LOCAL",
        modifiedTime: info.mtime.toISOString(),
      });
      return;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      const info = await stat(entryPath);
      files.push({
        id: encodeLocalPathId(relativePath),
        name: entry.name,
        provider: "LOCAL",
        size: String(info.size),
        modifiedTime: info.mtime.toISOString(),
      });
    }
  }));

  folders.sort((left, right) => left.name.localeCompare(right.name, "es"));
  files.sort((left, right) => left.name.localeCompare(right.name, "es"));

  return {
    currentFolder: {
      id: folderId,
      name: relativeDirectory ? path.basename(relativeDirectory) : workspace.name,
      isRoot: !relativeDirectory,
    },
    folders,
    files,
  };
}

// RF-18
export async function readLocalPdf(workspace: Pick<Workspace, "cloudPath" | "name">, fileId: string) {
  const relativePath = decodeLocalPathId(fileId);
  if (!relativePath.toLowerCase().endsWith(".pdf")) throw new Error("Documento inválido.");

  const directory = getLocalDocumentDirectory(workspace);
  const filePath = await resolveLocalPath(directory, relativePath);

  return {
    name: path.basename(relativePath),
    buffer: await readFile(filePath),
  };
}

/** Gestiona local PDF dentro de documento almacenamiento. */
export async function writeLocalPdf(workspace: Pick<Workspace, "cloudPath" | "name">, fileName: string, buffer: Buffer, folderId = "") {
  const rootDirectory = getLocalDocumentDirectory(workspace);
  await mkdir(rootDirectory, { recursive: true });
  const relativeDirectory = folderId ? decodeLocalPathId(folderId) : "";
  const directory = await resolveLocalPath(rootDirectory, relativeDirectory);

  const safeName = sanitizePdfFileName(fileName);
  const targetPath = await preventLocalCollision(directory, safeName);
  await writeFile(targetPath, buffer);

  return {
    id: encodeLocalPathId(path.join(relativeDirectory, path.basename(targetPath))),
    name: path.basename(targetPath),
  };
}

/** Gestiona PDF archivo nombre dentro de documento almacenamiento. */
export function sanitizePdfFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || `documento-${Date.now()}`;
  const withExtension = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
  return withExtension;
}

/** Obtiene local documento directory dentro de documento almacenamiento. */
function getLocalDocumentDirectory(workspace: Pick<Workspace, "cloudPath" | "name">) {
  const basePath = workspace.cloudPath.replace(/^LOCAL:\s*/, "").trim();
  const expandedBasePath = basePath.startsWith("~") ? path.join(os.homedir(), basePath.slice(1)) : basePath;
  return path.join(expandedBasePath, workspace.name);
}

/** Gestiona local ruta id dentro de documento almacenamiento. */
function encodeLocalPathId(relativePath: string) {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

/** Gestiona local ruta id dentro de documento almacenamiento. */
function decodeLocalPathId(itemId: string) {
  const relativePath = Buffer.from(itemId, "base64url").toString("utf8");
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("Identificador de ruta inválido.");
  return relativePath;
}

/** Resuelve local ruta dentro de documento almacenamiento. */
async function resolveLocalPath(rootDirectory: string, relativePath: string) {
  const resolvedRoot = await realpath(rootDirectory);
  const candidatePath = path.resolve(resolvedRoot, relativePath);
  const resolvedCandidate = await realpath(candidatePath);

  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Ruta fuera del espacio autorizado.");
  }

  return resolvedCandidate;
}

// RF-14
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

/** Gestiona exists dentro de documento almacenamiento. */
async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
