import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { CandidatePassword } from "@/lib/document-access";

const execFileAsync = promisify(execFile);
const GHOSTSCRIPT_BIN = process.env.GHOSTSCRIPT_BIN || "gs";
const PDF_RENDER_SCALE = Number(process.env.PDF_RENDER_SCALE || "1.5");
const PDF_RENDER_MAX_PAGES = Number(process.env.PDF_RENDER_MAX_PAGES || "60");
const GHOSTSCRIPT_TIMEOUT_MS = 120_000;
const GHOSTSCRIPT_MAX_BUFFER_BYTES = 1024 * 1024;
const PDF_ENCRYPTION_REVISION = 3;
const PDF_ENCRYPTION_KEY_LENGTH_BITS = 128;
const PDF_OUTPUT_COMPATIBILITY_LEVEL = "1.4";
const PDF_VIEW_COMPATIBILITY_LEVEL = "1.7";
const PDF_READ_ONLY_PERMISSIONS = -4;
const FIRST_PDF_PAGE_NUMBER = 1;
const INVALID_PDF_PASSWORD_CODE = 1;
const REQUIRED_PDF_PASSWORD_CODE = 2;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const STANDARD_FONT_DATA_URL = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts", path.sep);
const CMAP_URL = path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps", path.sep);

export type PdfRewriteResult = {
  buffer: Buffer;
  matched: CandidatePassword | null;
};

export type PdfImageRenderResult = {
  pages: Array<{
    pageNumber: number;
    buffer: Buffer;
  }>;
  matched: CandidatePassword | null;
};

export class PdfProcessingError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string, cause?: unknown) {
    super(message);
    this.name = "PdfProcessingError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

// RF-18 — Devuelve el código HTTP asociado al error de procesamiento PDF.
export function getPdfProcessingErrorStatus(
  error: unknown,
  fallbackStatus = HTTP_INTERNAL_SERVER_ERROR
) {
  return error instanceof PdfProcessingError ? error.status : fallbackStatus;
}

// RF-18 — Prueba contraseñas autorizadas y garantiza la limpieza de temporales.
export async function decryptPdfForViewing(
  pdfBuffer: Buffer,
  candidates: CandidatePassword[]
): Promise<PdfRewriteResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gobernanza-pdf-"));

  try {
    const inputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    const noPasswordResult = await tryRewritePdf(inputPath, tempDir, null);
    if (noPasswordResult) {
      return { buffer: noPasswordResult, matched: null };
    }

    for (const candidate of candidates) {
      const rewritten = await tryRewritePdf(inputPath, tempDir, candidate.password);
      if (rewritten) {
        return { buffer: rewritten, matched: candidate };
      }
    }

    throw new Error("No tienes una contraseña autorizada para abrir este PDF.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// RF-18 — Renderiza las páginas con una contraseña válida y devuelve sus imágenes.
export async function renderPdfImagesForViewing(
  pdfBuffer: Buffer,
  candidates: CandidatePassword[]
): Promise<PdfImageRenderResult> {
  const noPasswordPages = await tryRenderPdfToImages(pdfBuffer, null);
  if (noPasswordPages) {
    return { pages: noPasswordPages, matched: null };
  }

  for (const candidate of candidates) {
    const pages = await tryRenderPdfToImages(pdfBuffer, candidate.password);
    if (pages) {
      return { pages, matched: candidate };
    }
  }

  throw new PdfProcessingError(
    "No tienes una contraseña autorizada para abrir este PDF.",
    403,
    "pdf_password_not_authorized"
  );
}

// RF-20 — Cifra el PDF temporalmente y devuelve su contenido para almacenamiento.
export async function encryptPdfForStorage(pdfBuffer: Buffer, password: string) {
  if (!password) return pdfBuffer;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gobernanza-pdf-"));

  try {
    const inputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    const outputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    await execFileAsync(
      GHOSTSCRIPT_BIN,
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-dCompatibilityLevel=${PDF_OUTPUT_COMPATIBILITY_LEVEL}`,
        "-dPDFSETTINGS=/prepress",
        `-dEncryptionR=${PDF_ENCRYPTION_REVISION}`,
        `-dKeyLength=${PDF_ENCRYPTION_KEY_LENGTH_BITS}`,
        `-dPermissions=${PDF_READ_ONLY_PERMISSIONS}`,
        `-sOwnerPassword=${password}`,
        `-sUserPassword=${password}`,
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: GHOSTSCRIPT_TIMEOUT_MS, maxBuffer: GHOSTSCRIPT_MAX_BUFFER_BYTES }
    );

    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// RF-15 — Usa el PDF original como alternativa si Ghostscript no logra comprimirlo.
export async function compressPdfForStorage(pdfBuffer: Buffer) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gobernanza-pdf-compress-"));

  try {
    const inputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    const outputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    await execFileAsync(
      GHOSTSCRIPT_BIN,
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-dCompatibilityLevel=${PDF_OUTPUT_COMPATIBILITY_LEVEL}`,
        "-dPDFSETTINGS=/ebook",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: GHOSTSCRIPT_TIMEOUT_MS, maxBuffer: GHOSTSCRIPT_MAX_BUFFER_BYTES }
    );

    const compressed = await readFile(outputPath);
    return compressed.byteLength < pdfBuffer.byteLength
      ? { buffer: compressed, compressed: true }
      : { buffer: pdfBuffer, compressed: false };
  } catch (error) {
    // La compresión es opcional; el cifrado y la carga pueden continuar con el
    // PDF original si Ghostscript no logra reducir este archivo.
    console.warn("No se pudo comprimir el PDF; se conservará el original.", error);
    return { buffer: pdfBuffer, compressed: false };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// RF-18 — Devuelve null cuando Ghostscript no puede abrir el PDF con esa clave.
async function tryRewritePdf(inputPath: string, tempDir: string, password: string | null) {
  const outputPath = path.join(tempDir, `${randomUUID()}.pdf`);
  const args = [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    `-dCompatibilityLevel=${PDF_VIEW_COMPATIBILITY_LEVEL}`,
    `-sOutputFile=${outputPath}`,
  ];

  if (password) args.push(`-sPDFPassword=${password}`);
  args.push(inputPath);

  try {
    await execFileAsync(GHOSTSCRIPT_BIN, args, {
      timeout: GHOSTSCRIPT_TIMEOUT_MS,
      maxBuffer: GHOSTSCRIPT_MAX_BUFFER_BYTES,
    });
    return await readFile(outputPath);
  } catch (error) {
    console.debug("No se pudo reescribir el PDF con una contraseña candidata.", error);
    return null;
  }
}

// RF-18 — Renderiza todas las páginas dentro del límite y convierte errores a un resultado controlado.
async function tryRenderPdfToImages(pdfBuffer: Buffer, password: string | null) {
  try {
    const { createCanvas, DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const runtimeGlobal = globalThis as unknown as Record<string, unknown>;

    runtimeGlobal.DOMMatrix ||= DOMMatrix;
    runtimeGlobal.ImageData ||= ImageData;
    runtimeGlobal.Path2D ||= Path2D;

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      password: password || undefined,
      cMapPacked: true,
      cMapUrl: CMAP_URL,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    });

    const pdf = await loadingTask.promise;

    try {
      if (pdf.numPages > PDF_RENDER_MAX_PAGES) {
        throw new PdfProcessingError(
          `El PDF tiene ${pdf.numPages} páginas. El visor web admite hasta ${PDF_RENDER_MAX_PAGES}.`,
          413,
          "pdf_too_many_pages"
        );
      }

      const pages = [];

      for (
        let pageNumber = FIRST_PDF_PAGE_NUMBER;
        pageNumber <= pdf.numPages;
        pageNumber += 1
      ) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const canvasContext = canvas.getContext("2d");

        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        pages.push({
          pageNumber,
          buffer: Buffer.from(await canvas.encode("png")),
        });
      }

      return pages;
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    if (isPdfPasswordError(error)) return null;
    if (error instanceof PdfProcessingError) throw error;

    throw new PdfProcessingError(
      "No se pudo renderizar el PDF en el servidor. Revisa que el archivo no esté corrupto " +
        "o use un cifrado no compatible.",
      HTTP_UNPROCESSABLE_ENTITY,
      "pdf_render_failed",
      error
    );
  }
}

// RF-18 — Reconoce exclusivamente errores de contraseña del lector PDF.
function isPdfPasswordError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "PasswordException" &&
    "code" in error &&
    (error.code === INVALID_PDF_PASSWORD_CODE || error.code === REQUIRED_PDF_PASSWORD_CODE)
  );
}
