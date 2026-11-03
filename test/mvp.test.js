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
process.env.AZURE_SPEECH_ENABLED = "true";
process.env.AZURE_SPEECH_ENDPOINT =
  "https://speech-test.cognitiveservices.azure.com/";
process.env.ENABLE_EMPLOYEE_DEMO = "true";
process.env.NODE_ENV = "test";
process.env.MAX_UPLOAD_BYTES = "1024";

const database = await import("../scripts/database.js");
const demoService = await import("../scripts/demoService.js");
const { createAssistantResponse } = await import("../scripts/functionCalling.js");
const inventoryTool = await import("../scripts/inventarioTool.js");
const { assistantTools } = await import("../scripts/toolsDefinitions.js");
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

test("crea productos con nombre único normalizado y actualiza inventario por sucursal", async () => {
  const created = await fetch(`${baseUrl}/api/employee/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Jabón Líquido 2L",
      category: "Limpieza",
      price: 42.5,
    }),
  });
  assert.equal(created.status, 201);
  const product = await created.json();

  const duplicate = await fetch(`${baseUrl}/api/employee/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "  JABON   LIQUIDO 2L " }),
  });
  assert.equal(duplicate.status, 409);

  const inventory = await fetch(
    `${baseUrl}/api/employee/products/${product.id}/inventory`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: "León", stock: 5 }),
    },
  );
  assert.equal(inventory.status, 200);

  const update = await fetch(
    `${baseUrl}/api/employee/products/${product.id}/inventory`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: "León", stock: 9 }),
    },
  );
  assert.equal(update.status, 200);
  const catalog = await demoService.getProductCatalog();
  assert.equal(
    catalog.find((entry) => entry.id === product.id).stock["León"],
    9,
  );
});

test("los pedidos ficticios solo aceptan transiciones permitidas", async () => {
  const ordersResponse = await fetch(`${baseUrl}/api/employee/orders`);
  assert.equal(ordersResponse.status, 200);
  const orders = await ordersResponse.json();
  assert.equal(orders.length, 6);
  assert.deepEqual(Object.keys(orders[0]).sort(), [
    "orderId",
    "status",
    "updatedAt",
  ]);
  assert.equal(orders[0].orderId, "PED-DEMO-001");
  assert.equal(
    demoService.demoOrderStatusLabels[orders[0].status],
    "Pedido registrado por Río Claro",
  );
  assert.equal(
    typeof (await demoService.getDemoOrderStatus(orders[0].orderId)).updatedAt,
    "string",
  );

  const invalidTransition = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENVIADO" }),
    },
  );
  assert.equal(invalidTransition.status, 409);

  const validTransition = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "EN_PREPARACION" }),
    },
  );
  assert.equal(validTransition.status, 200);
  assert.equal(
    (await demoService.getDemoOrderStatus("PED-DEMO-001")).status,
    "EN_PREPARACION",
  );

  for (const status of ["ENVIADO", "EN_REPARTO", "ENTREGA_CONFIRMADA"]) {
    const transition = await fetch(
      `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    assert.equal(transition.status, 200);
  }
  const completedOrderChange = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-001/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INCIDENCIA" }),
    },
  );
  assert.equal(completedOrderChange.status, 409);

  const incidentTransition = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-002/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INCIDENCIA" }),
    },
  );
  assert.equal(incidentTransition.status, 200);
  const incidentRecovery = await fetch(
    `${baseUrl}/api/employee/orders/PED-DEMO-002/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENVIADO" }),
    },
  );
  assert.equal(incidentRecovery.status, 409);

  const personalIdentifier = await demoService.getDemoOrderStatus("PED-REAL-001");
  assert.equal(personalIdentifier, null);
});

test("Function Calling usa function_call_output con call_id y limita rondas", async () => {
  assert.equal(assistantTools.length, 1);
  assert.deepEqual(
    {
      type: assistantTools[0].type,
      name: assistantTools[0].name,
      required: assistantTools[0].parameters.required,
      additionalProperties: assistantTools[0].parameters.additionalProperties,
    },
    {
      type: "function",
      name: "consultarEstadoPedido",
      required: ["orderId"],
      additionalProperties: false,
    },
  );

  const requests = [];
  const mockResponses = [
    {
      output: [
        {
          type: "function_call",
          name: "consultarEstadoPedido",
          arguments: '{"orderId":"PED-DEMO-002"}',
          call_id: "call-demo-1",
        },
      ],
    },
    { output: [{ type: "message" }], output_text: "Está en preparación." },
  ];
  const openai = {
    responses: {
      create: async (...args) => {
        requests.push(args);
        return mockResponses.shift();
      },
    },
  };
  const agentRef = { body: { agent_reference: { name: "test-agent" } } };
  const result = await createAssistantResponse({
    openai,
    conversationId: "conversation-demo",
    message: "¿Dónde está PED-DEMO-002?",
    agentRef,
    executeTool: async (name, args) => ({
      tool: name,
      orderId: args.orderId,
      status: "EN_PREPARACION",
    }),
  });

  assert.equal(result.output_text, "Está en preparación.");
  assert.deepEqual(requests[1][0], {
    conversation: "conversation-demo",
    input: [
      {
        type: "function_call_output",
        call_id: "call-demo-1",
        output: JSON.stringify({
          tool: "consultarEstadoPedido",
          orderId: "PED-DEMO-002",
          status: "EN_PREPARACION",
        }),
      },
    ],
  });
  assert.equal(requests[1][1], agentRef);

  const cappedRequests = [];
  const repeatedCall = {
    output: [
      {
        type: "function_call",
        name: "consultarEstadoPedido",
        arguments: '{"orderId":"PED-DEMO-001"}',
        call_id: "call-repeat",
      },
    ],
  };
  await assert.rejects(
    createAssistantResponse({
      openai: {
        responses: {
          create: async (...args) => {
            cappedRequests.push(args);
            return repeatedCall;
          },
        },
      },
      conversationId: "conversation-demo",
      message: "consulta",
      agentRef,
      executeTool: async () => ({ status: "PEDIDO_REGISTRADO" }),
    }),
    /límite de llamadas/,
  );
  assert.equal(cappedRequests.length, 4);
});

test("argumentos mal formados no se ejecutan y producen salida segura de herramienta", async () => {
  const requests = [];
  const outputs = [
    {
      output: [
        {
          type: "function_call",
          name: "consultarEstadoPedido",
          arguments: "{mal formado",
          call_id: "call-invalid",
        },
      ],
    },
    { output: [{ type: "message" }], output_text: "No se pudo consultar." },
  ];
  const result = await createAssistantResponse({
    openai: {
      responses: {
        create: async (...args) => {
          requests.push(args);
          return outputs.shift();
        },
      },
    },
    conversationId: "conversation-demo",
    message: "consulta",
    agentRef: {},
    executeTool: async () => {
      assert.fail("Una llamada con argumentos inválidos no debe ejecutarse.");
    },
  });

  assert.equal(result.output_text, "No se pudo consultar.");
  assert.deepEqual(
    JSON.parse(requests[1][0].input[0].output),
    { error: "No fue posible procesar la consulta ficticia." },
  );
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

test("Azure Speech solo publica su configuración local y bloquea otros orígenes", async () => {
  const config = await fetch(`${baseUrl}/api/speech/config`);
  const sdkBundle = await fetch(`${baseUrl}/vendor/speech-sdk.js`, {
    method: "HEAD",
  });
  const foreignOriginToken = await fetch(`${baseUrl}/api/speech/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: "{}",
  });
  assert.deepEqual(await config.json(), {
    enabled: true,
    endpoint: "https://speech-test.cognitiveservices.azure.com/",
  });
  assert.equal(config.headers.get("cache-control"), "no-store");
  assert.equal(sdkBundle.status, 200);
  assert.match(sdkBundle.headers.get("content-type"), /javascript/);
  assert.equal(foreignOriginToken.status, 403);
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
