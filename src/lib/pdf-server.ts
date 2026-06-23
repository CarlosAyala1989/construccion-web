import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { CandidatePassword } from "@/lib/document-access";

const execFileAsync = promisify(execFile);
const GHOSTSCRIPT_BIN = process.env.GHOSTSCRIPT_BIN || "gs";

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gobernanza-pdf-render-"));

  try {
    const inputPath = path.join(tempDir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    const noPasswordPages = await tryRenderPdfToImages(inputPath, tempDir, null);
    if (noPasswordPages) {
      return { pages: noPasswordPages, matched: null };
    }

    for (const candidate of candidates) {
      const pages = await tryRenderPdfToImages(inputPath, tempDir, candidate.password);
      if (pages) {
        return { pages, matched: candidate };
      }
    }

    throw new Error("No tienes una contraseña autorizada para abrir este PDF.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
        "-dCompatibilityLevel=1.7",
        "-dPDFSETTINGS=/prepress",
        "-dEncryptionR=4",
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

async function tryRenderPdfToImages(inputPath: string, tempDir: string, password: string | null) {
  const outputPrefix = `page-${randomUUID()}`;
  const outputPattern = path.join(tempDir, `${outputPrefix}-%03d.png`);
  const args = [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=png16m",
    "-r150",
    "-dTextAlphaBits=4",
    "-dGraphicsAlphaBits=4",
    `-sOutputFile=${outputPattern}`,
  ];

  if (password) args.push(`-sPDFPassword=${password}`);
  args.push(inputPath);

  try {
    await execFileAsync(GHOSTSCRIPT_BIN, args, { timeout: 120000, maxBuffer: 1024 * 1024 });

    const pageFiles = (await readdir(tempDir))
      .filter(fileName => fileName.startsWith(outputPrefix) && fileName.endsWith(".png"))
      .sort();

    if (pageFiles.length === 0) return null;

    return Promise.all(
      pageFiles.map(async (fileName, index) => ({
        pageNumber: index + 1,
        buffer: await readFile(path.join(tempDir, fileName)),
      }))
    );
  } catch {
    return null;
  }
}
