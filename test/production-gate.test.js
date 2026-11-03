import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "rio-claro-prod-gate-"));
const databasePath = join(temporaryDirectory, "test.sqlite");
process.env.SQLITE_DB_PATH = databasePath;
process.env.FOUNDRY_PROJECT_ENDPOINT = "https://example.test";
process.env.FOUNDRY_AGENT_NAME = "test-agent";
process.env.ENABLE_EMPLOYEE_DEMO = "true";
process.env.AZURE_SPEECH_ENABLED = "true";
process.env.AZURE_SPEECH_ENDPOINT = "";
process.env.NODE_ENV = "production";
process.env.WEBSITE_SITE_NAME = "test-app-service";

const database = await import("../scripts/database.js");
const { app } = await import("../server.js");
let server;
let baseUrl;

before(async () => {
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

test("producción sirve la vista estática pero bloquea las APIs de demostración", async () => {
  const employeePage = await fetch(`${baseUrl}/empleado.html`);
  const demoStatus = await fetch(`${baseUrl}/api/employee/demo-status`);
  const employeeApi = await fetch(`${baseUrl}/api/employee/dashboard`);
  const claimsApi = await fetch(`${baseUrl}/api/claims`, { method: "POST" });
  const ordersApi = await fetch(`${baseUrl}/api/employee/orders`);
  const orderUpdateApi = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "EN_PREPARACION" }),
    },
  );
  const productApi = await fetch(`${baseUrl}/api/employee/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Producto ficticio" }),
  });
  const speechConfig = await fetch(`${baseUrl}/api/speech/config`);
  const speechToken = await fetch(`${baseUrl}/api/speech/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  assert.equal(employeePage.status, 200);
  assert.match(await employeePage.text(), /Panel de operaciones/);
  assert.deepEqual(await demoStatus.json(), { enabled: false });
  assert.equal(employeeApi.status, 404);
  assert.equal(claimsApi.status, 404);
  assert.equal(ordersApi.status, 404);
  assert.equal(orderUpdateApi.status, 404);
  assert.equal(productApi.status, 404);
  assert.deepEqual(await speechConfig.json(), { enabled: false });
  assert.equal(speechToken.status, 404);
});
