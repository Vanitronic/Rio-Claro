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
process.env.WEBSITE_AUTH_ENABLED = "false";

const database = await import("../scripts/database.js");
const { expireIdleEmployeeSessions } = await import(
  "../scripts/employeeSessionStore.js"
);
const { app } = await import("../server.js");
let server;
let baseUrl;

function sessionHeaders(sessionId, method = "GET") {
  const headers = {};
  if (sessionId) {
    headers["X-Employee-Session"] = sessionId;
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.Origin = `https://${new URL(baseUrl).host}`;
  }
  return headers;
}

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

test("App Service permite acceso anónimo y mantiene los cambios privados y temporales", async () => {
  const anonymousEmployeePage = await fetch(`${baseUrl}/empleado.html`, {
    redirect: "manual",
  });
  const anonymousApi = await fetch(`${baseUrl}/api/employee/dashboard`);
  assert.equal(anonymousEmployeePage.status, 200);
  assert.match(await anonymousEmployeePage.text(), /Panel de operaciones/);
  assert.equal(anonymousApi.status, 200);
  assert.ok(anonymousApi.headers.get("X-Employee-Session"));

  const anonymousClaim = await fetch(`${baseUrl}/api/claims`, {
    method: "POST",
    headers: {
      ...sessionHeaders(null, "POST"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: "León",
      product: "Producto anónimo",
      reason: "No debe guardarse.",
    }),
  });
  const anonymousSession = anonymousClaim.headers.get("X-Employee-Session");
  assert.ok(anonymousSession);
  const publicChat = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      ...sessionHeaders(anonymousSession, "POST"),
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(anonymousClaim.status, 201);
  assert.equal(
    anonymousClaim.headers.get("X-Employee-Session"),
    anonymousSession,
  );
  assert.equal(publicChat.status, 422);
  assert.equal(
    publicChat.headers.get("X-Employee-Session"),
    anonymousSession,
  );

  const demoStatus = await fetch(`${baseUrl}/api/employee/demo-status`, {
    headers: sessionHeaders(anonymousSession),
  });
  assert.deepEqual(await demoStatus.json(), { enabled: true });

  const initialCatalog = await fetch(`${baseUrl}/api/employee/products`, {
    headers: sessionHeaders(anonymousSession),
  });
  assert.equal((await initialCatalog.json()).length, 2);

  const productApi = await fetch(`${baseUrl}/api/employee/products`, {
    method: "POST",
    headers: {
      ...sessionHeaders(anonymousSession, "POST"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Producto temporal" }),
  });
  assert.equal(productApi.status, 201);
  const product = await productApi.json();

  const inventoryApi = await fetch(
    `${baseUrl}/api/employee/products/${product.id}/inventory`,
    {
      method: "POST",
      headers: {
        ...sessionHeaders(anonymousSession, "POST"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ branch: "León", stock: 12 }),
    },
  );
  assert.equal(inventoryApi.status, 200);

  const aliasApi = await fetch(`${baseUrl}/api/employee/aliases`, {
    method: "POST",
    headers: {
      ...sessionHeaders(anonymousSession, "POST"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId: product.id,
      alias: "Alias temporal",
      branch: "León",
    }),
  });
  assert.equal(aliasApi.status, 201);

  const sameSessionCatalog = await fetch(`${baseUrl}/api/employee/products`, {
    headers: sessionHeaders(anonymousSession),
  });
  const sameSessionProducts = await sameSessionCatalog.json();
  assert.equal(sameSessionProducts.length, 3);
  assert.equal(
    sameSessionProducts.find((entry) => entry.id === product.id).stock["León"],
    12,
  );
  assert.deepEqual(
    sameSessionProducts.find((entry) => entry.id === product.id).aliases,
    ["Alias temporal"],
  );

  const invoicesApi = await fetch(`${baseUrl}/api/employee/invoices`, {
    headers: sessionHeaders(anonymousSession),
  });
  assert.equal(invoicesApi.status, 200);
  assert.deepEqual(await invoicesApi.json(), []);
  const invalidInvoiceApi = await fetch(
    `${baseUrl}/api/employee/invoices/analyze`,
    {
      method: "POST",
      headers: {
        ...sessionHeaders(anonymousSession, "POST"),
        "Content-Type": "text/plain",
      },
      body: "No es una factura admitida.",
    },
  );
  assert.equal(invalidInvoiceApi.status, 415);

  const otherTabCatalog = await fetch(`${baseUrl}/api/employee/products`);
  assert.equal((await otherTabCatalog.json()).length, 2);
  const otherTabSession = otherTabCatalog.headers.get("X-Employee-Session");
  assert.ok(otherTabSession);
  assert.notEqual(otherTabSession, anonymousSession);

  const claimsA = await fetch(`${baseUrl}/api/employee/claims`, {
    headers: sessionHeaders(anonymousSession),
  });
  assert.equal((await claimsA.json()).length, 1);
  const claimsB = await fetch(`${baseUrl}/api/employee/claims`, {
    headers: sessionHeaders(otherTabSession),
  });
  assert.deepEqual(await claimsB.json(), []);

  const crossOriginWrite = await fetch(`${baseUrl}/api/employee/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ name: "No permitido" }),
  });
  assert.equal(crossOriginWrite.status, 403);

  const originalSessionId = anonymousSession;
  expireIdleEmployeeSessions(Date.now() + 31 * 60 * 1000);
  const afterExpiry = await fetch(`${baseUrl}/api/employee/products`, {
    headers: sessionHeaders(originalSessionId),
  });
  assert.equal((await afterExpiry.json()).length, 2);
  assert.notEqual(
    afterExpiry.headers.get("X-Employee-Session"),
    originalSessionId,
  );

  assert.equal(
    (await database.get("SELECT COUNT(*) AS count FROM productos_maestros")).count,
    2,
  );
  assert.equal(
    (await database.get("SELECT COUNT(*) AS count FROM reclamos")).count,
    0,
  );

  const ordersApi = await fetch(`${baseUrl}/api/employee/orders`, {
    headers: sessionHeaders(originalSessionId),
  });
  assert.equal(ordersApi.status, 200);
  const sessionIdAfterExpiry = ordersApi.headers.get("X-Employee-Session");
  const orderUpdateApi = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
    {
      method: "PATCH",
      headers: {
        ...sessionHeaders(sessionIdAfterExpiry, "PATCH"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "EN_PREPARACION" }),
    },
  );
  assert.equal(orderUpdateApi.status, 200);
  assert.equal(
    (
      await database.get(
        "SELECT estado FROM pedidos_demo WHERE id_pedido = 'PED-DEMO-001'",
      )
    ).estado,
    "PEDIDO_REGISTRADO",
  );

  const ordersB = await fetch(`${baseUrl}/api/employee/orders`, {
    headers: sessionHeaders(otherTabSession),
  });
  assert.equal((await ordersB.json())[0].status, "PEDIDO_REGISTRADO");

  const speechConfig = await fetch(`${baseUrl}/api/speech/config`);
  const speechToken = await fetch(`${baseUrl}/api/speech/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  assert.deepEqual(await speechConfig.json(), { enabled: false });
  assert.equal(speechToken.status, 404);
});
