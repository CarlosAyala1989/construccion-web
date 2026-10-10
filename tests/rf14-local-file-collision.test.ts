import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  listLocalFolder,
  readLocalPdf,
  sanitizePdfFileName,
  writeLocalPdf,
} from "../src/lib/document-storage";

type LocalWorkspace = {
  cloudPath: string;
  name: string;
};

async function createWorkspaceFixture() {
  const basePath = await mkdtemp(path.join(tmpdir(), "gobernanza-rf14-"));
  const workspace: LocalWorkspace = {
    cloudPath: `LOCAL:${basePath}`,
    name: "Pruebas RF-14",
  };

  return {
    basePath,
    workspace,
    cleanup: () => rm(basePath, { recursive: true, force: true }),
  };
}

test("unitaria limpia caracteres no validos y conserva la extension PDF", () => {
  assert.equal(sanitizePdfFileName("carpeta/acta:2026?.PDF"), "acta_2026_.PDF");
  assert.equal(sanitizePdfFileName("sin-extension"), "sin-extension.pdf");
});

test("integracion escribe, lee y lista un documento local", async () => {
  const fixture = await createWorkspaceFixture();

  try {
    const content = Buffer.from("contenido del PDF");
    const stored = await writeLocalPdf(fixture.workspace, "acta.pdf", content);
    const read = await readLocalPdf(fixture.workspace, stored.id);
    const listing = await listLocalFolder(fixture.workspace);

    assert.equal(read.name, "acta.pdf");
    assert.deepEqual(read.buffer, content);
    assert.deepEqual(listing.files.map(file => file.name), ["acta.pdf"]);
    assert.deepEqual(
      await readFile(path.join(fixture.basePath, fixture.workspace.name, stored.name)),
      content,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("funcional agrega el sufijo v2 y mantiene ambos contenidos", async () => {
  const fixture = await createWorkspaceFixture();

  try {
    const first = await writeLocalPdf(fixture.workspace, "contrato.pdf", Buffer.from("original"));
    const second = await writeLocalPdf(fixture.workspace, "contrato.pdf", Buffer.from("duplicado"));
    const firstContent = await readLocalPdf(fixture.workspace, first.id);
    const secondContent = await readLocalPdf(fixture.workspace, second.id);

    assert.equal(first.name, "contrato.pdf");
    assert.equal(second.name, "contrato_v2.pdf");
    assert.equal(firstContent.buffer.toString("utf8"), "original");
    assert.equal(secondContent.buffer.toString("utf8"), "duplicado");
  } finally {
    await fixture.cleanup();
  }
});

test("rendimiento almacena doscientos cincuenta archivos distintos", async () => {
  const fixture = await createWorkspaceFixture();
  const startedAt = performance.now();

  try {
    const files = await Promise.all(
      Array.from({ length: 250 }, (_, index) =>
        writeLocalPdf(
          fixture.workspace,
          `folio-${index}.pdf`,
          Buffer.from(`contenido-${index}`),
        ),
      ),
    );
    const elapsedMilliseconds = performance.now() - startedAt;

    assert.equal(new Set(files.map(file => file.name)).size, 250);
    assert.ok(elapsedMilliseconds < 10000);
  } finally {
    await fixture.cleanup();
  }
});

test("aceptacion preserva las tres versiones con el mismo nombre", async () => {
  const fixture = await createWorkspaceFixture();

  try {
    const documents: Array<{ id: string; name: string }> = [];
    for (const version of ["version 1", "version 2", "version 3"]) {
      documents.push(
        await writeLocalPdf(fixture.workspace, "resolucion.pdf", Buffer.from(version)),
      );
    }
    const names = documents.map(document => document.name).sort();
    const contents = await Promise.all(
      documents.map(async document => {
        const stored = await readLocalPdf(fixture.workspace, document.id);
        return stored.buffer.toString("utf8");
      }),
    );

    assert.deepEqual(names, ["resolucion.pdf", "resolucion_v2.pdf", "resolucion_v3.pdf"]);
    assert.deepEqual(contents.sort(), ["version 1", "version 2", "version 3"]);
  } finally {
    await fixture.cleanup();
  }
});

test("integracion rechaza una ruta codificada fuera del espacio local", async () => {
  const fixture = await createWorkspaceFixture();

  try {
    await mkdir(path.join(fixture.basePath, fixture.workspace.name), { recursive: true });
    await writeFile(path.join(fixture.basePath, "fuera.pdf"), "archivo fuera del espacio");
    const outsideFileId = Buffer.from("../fuera.pdf", "utf8").toString("base64url");

    await assert.rejects(readLocalPdf(fixture.workspace, outsideFileId));
  } finally {
    await fixture.cleanup();
  }
});
