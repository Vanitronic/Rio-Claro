import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "rio-claro-mvp-"));
const databasePath = join(temporaryDirectory, "test.sqlite");
process.env.SQLITE_DB_PATH = databasePath;
process.env.FOUNDRY_PROJECT_ENDPOINT = "https://example.test";
process.env.FOUNDRY_AGENT_NAME = "test-agent";
process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "";
process.env.ENABLE_EMPLOYEE_DEMO = "true";
process.env.NODE_ENV = "test";
process.env.MAX_UPLOAD_BYTES = "1024";

const database = await import("../scripts/database.js");
const demoService = await import("../scripts/demoService.js");
const inventoryTool = await import("../scripts/inventarioTool.js");
const { app } = await import("../server.js");

let server;
let baseUrl;

before(async () => {
  await database.initializeDatabase();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await new Promise((resolve, reject) => {
    database.db.close((error) => (error ? reject(error) : resolve()));
  });
  await unlink(databasePath);
  await rmdir(temporaryDirectory);
});

test("inicializa el esquema, usa alias y no duplica semillas", async () => {
  await database.initializeDatabase();
  const products = await inventoryTool.consultarInventarioDB(
    "blanqueador 1000ml",
    "León",
  );

  assert.equal(products.length, 1);
  assert.equal(products[0].producto, "Cloro 1 Litro");
  assert.equal(products[0].existencias, 45);
  assert.equal((await demoService.getDashboard()).products, 2);
});

test("una factura normalizada no se inserta dos veces", async () => {
  const first = await demoService.saveInvoiceDraft(
    {
      supplier: "Proveedor S.A.",
      invoiceId: "F-100 2",
      total: 1450,
      confidence: 0.96,
    },
    "file-hash-1",
  );
  const duplicate = await demoService.saveInvoiceDraft(
    {
      supplier: "proveedor s a",
      invoiceId: "F1002",
      total: 1450,
      confidence: 0.96,
    },
    "file-hash-2",
  );

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.invoice.id, first.invoice.id);
  assert.equal((await demoService.findInvoiceByHash("file-hash-1")).id, first.invoice.id);
});

test("el registro de pagos de demo exige aprobación y es idempotente", async () => {
  const invoice = await demoService.saveInvoiceDraft(
    {
      supplier: "Proveedor del Norte",
      invoiceId: "FAC-72",
      total: 1200,
      confidence: 0.99,
    },
    "payment-test-hash",
  );

  assert.deepEqual(
    await demoService.createSimulatedPayment(invoice.invoice.id, "REF-72"),
    { result: "not_approved" },
  );
  await demoService.setInvoiceReviewStatus(invoice.invoice.id, "APROBADA");

  const payment = await demoService.createSimulatedPayment(
    invoice.invoice.id,
    "REF-72",
  );
  const duplicatePayment = await demoService.createSimulatedPayment(
    invoice.invoice.id,
    "REF-72-OTRA",
  );
  assert.equal(payment.result, "created");
  assert.equal(duplicatePayment.result, "duplicate");
});

test("health, validación de mensaje y reclamos de demostración", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await health.json(), { status: "ok" });

  const invalidMessage = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "" }),
  });
  assert.equal(invalidMessage.status, 422);

  const claimResponse = await fetch(`${baseUrl}/api/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branch: "León",
      product: "Cloro 1L",
      reason: "El envase llegó dañado.",
    }),
  });
  assert.equal(claimResponse.status, 201);
  assert.match((await claimResponse.json()).folio, /^RC-\d{6}$/);
});

test("la carga valida MIME y firma y no envía datos a DI si falta configuración", async () => {
  const invalidFormat = await fetch(
    `${baseUrl}/api/employee/invoices/analyze`,
    {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: Buffer.from("not-a-jpeg"),
    },
  );
  assert.equal(invalidFormat.status, 415);

  const validHeader = await fetch(
    `${baseUrl}/api/employee/invoices/analyze`,
    {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from("%PDF-1.7\nsynthetic test document"),
    },
  );
  assert.equal(validHeader.status, 503);

  const oversized = await fetch(
    `${baseUrl}/api/employee/invoices/analyze`,
    {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.alloc(1025, 65),
    },
  );
  assert.equal(oversized.status, 413);
});
