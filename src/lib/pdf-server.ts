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

export function getPdfProcessingErrorStatus(error: unknown, fallbackStatus = 500) {
  return error instanceof PdfProcessingError ? error.status : fallbackStatus;
}

export async function decryptPdfForViewing(pdfBuffer: Buffer, candidates: CandidatePassword[]): Promise<PdfRewriteResult> {
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

export async function renderPdfImagesForViewing(pdfBuffer: Buffer, candidates: CandidatePassword[]): Promise<PdfImageRenderResult> {
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
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/prepress",
        "-dEncryptionR=3",
        "-dKeyLength=128",
        "-dPermissions=-4",
        `-sOwnerPassword=${password}`,
        `-sUserPassword=${password}`,
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );

    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function tryRewritePdf(inputPath: string, tempDir: string, password: string | null) {
  const outputPath = path.join(tempDir, `${randomUUID()}.pdf`);
  const args = [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    `-sOutputFile=${outputPath}`,
  ];

  if (password) args.push(`-sPDFPassword=${password}`);
  args.push(inputPath);

  try {
    await execFileAsync(GHOSTSCRIPT_BIN, args, { timeout: 120000, maxBuffer: 1024 * 1024 });
    return await readFile(outputPath);
  } catch {
    return null;
  }
}

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

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
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
      "No se pudo renderizar el PDF en el servidor. Revisa que el archivo no esté corrupto o use un cifrado no compatible.",
      422,
      "pdf_render_failed",
      error
    );
  }
}

function isPdfPasswordError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "PasswordException" &&
    "code" in error &&
    (error.code === 1 || error.code === 2)
  );
}
