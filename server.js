import express from "express";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrarReporteDevolucion } from "./scripts/devolucionesTool.js";
import { initializeDatabase } from "./scripts/database.js";
import {
  addProductAlias,
  branches,
  createSimulatedPayment,
  createProduct,
  demoOrderStatusLabels,
  demoOrderStatuses,
  getDemoOrderStatus,
  getDemoOrders,
  getClaims,
  getDashboard,
  getInvoices,
  getProductCatalog,
  setProductInventory,
  setDemoOrderStatus,
  setInvoiceReviewStatus,
} from "./scripts/demoService.js";
import { procesarFacturaInteligente } from "./scripts/agenteCapturador.js";
import { createAssistantResponse } from "./scripts/functionCalling.js";
import { createSpeechService } from "./scripts/speechService.js";

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.trim();
const agentName = process.env.FOUNDRY_AGENT_NAME?.trim();

if (!projectEndpoint || !agentName) {
  throw new Error(
    "FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME must be configured.",
  );
}

const credential = new DefaultAzureCredential();
const projectClient = new AIProjectClient(projectEndpoint, credential);
const openai = projectClient.getOpenAIClient();
const agentRef = {
  body: {
    agent_reference: {
      name: agentName,
      type: "agent_reference",
    },
  },
};

const app = express();
const publicDirectory = join(import.meta.dirname, "public");
const speechSdkBundle = join(
  import.meta.dirname,
  "node_modules",
  "microsoft-cognitiveservices-speech-sdk",
  "distrib",
  "browser",
  "microsoft.cognitiveservices.speech.sdk.bundle-min.js",
);
const speechSdkLicense = join(
  import.meta.dirname,
  "node_modules",
  "microsoft-cognitiveservices-speech-sdk",
  "LICENSE",
);
const localDemoEnabled =
  process.env.ENABLE_EMPLOYEE_DEMO === "true" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.WEBSITE_SITE_NAME;
const configuredUploadLimit = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024);
if (
  !Number.isSafeInteger(configuredUploadLimit) ||
  configuredUploadLimit < 1024 ||
  configuredUploadLimit > 10 * 1024 * 1024
) {
  throw new Error("MAX_UPLOAD_BYTES must be between 1024 and 10485760.");
}
const maxUploadBytes = configuredUploadLimit;
const speechService = createSpeechService({
  endpoint: process.env.AZURE_SPEECH_ENDPOINT,
  enabled: process.env.AZURE_SPEECH_ENABLED === "true",
  allowAccess:
    process.env.NODE_ENV !== "production" && !process.env.WEBSITE_SITE_NAME,
  credential,
});

function requireLocalDemo(_request, response, next) {
  if (!localDemoEnabled) {
    return response.status(404).json({
      error: "El módulo de demostración local no está habilitado.",
    });
  }
  return next();
}

function isLoopbackRequest(request) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    request.hostname.toLowerCase(),
  );
}

function validString(value, minLength, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength
  );
}

async function executeAssistantTool(name, args) {
  if (
    name !== "consultarEstadoPedido" ||
    typeof args.orderId !== "string" ||
    !/^PED-DEMO-\d{3}$/.test(args.orderId)
  ) {
    return { found: false, message: "No se encontró ese pedido ficticio." };
  }
  const order = await getDemoOrderStatus(args.orderId);
  return order
    ? {
        found: true,
        orderId: order.orderId,
        status: order.status,
        statusLabel: demoOrderStatusLabels[order.status],
        updatedAt: order.updatedAt,
      }
    : { found: false, message: "No se encontró ese pedido ficticio." };
}

app.use(express.json({ limit: "16kb" }));

app.use(express.static(publicDirectory));

app.get("/vendor/speech-sdk.js", (_request, response, next) => {
  response.sendFile(speechSdkBundle, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.get("/vendor/speech-sdk-license.txt", (_request, response, next) => {
  response.sendFile(speechSdkLicense, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/speech/config", (_request, response) => {
  response.set("Cache-Control", "no-store");
  return response.json(
    isLoopbackRequest(_request)
      ? speechService.getConfig()
      : { enabled: false },
  );
});

app.post("/api/speech/token", async (request, response) => {
  response.set("Cache-Control", "no-store");
  if (!isLoopbackRequest(request) || !speechService.getConfig().enabled) {
    return response.status(404).json({
      error: "Azure Speech no está habilitado para esta instancia.",
    });
  }

  const origin = request.get("origin");
  if (origin && origin !== `${request.protocol}://${request.get("host")}`) {
    return response.status(403).json({
      error: "La solicitud de voz no está permitida.",
    });
  }

  try {
    const accessToken = await speechService.getAccessToken();
    return response.json({
      token: accessToken.token,
      expiresOnTimestamp: accessToken.expiresOnTimestamp,
    });
  } catch (error) {
    console.error(
      "Speech token request failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(503).json({
      error: "No fue posible iniciar Azure Speech.",
    });
  }
});

app.post("/api/chat", async (request, response) => {
  const body =
    request.body &&
    typeof request.body === "object" &&
    !Array.isArray(request.body)
      ? request.body
      : {};
  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (message.length < 1 || message.length > 2000) {
    return response.status(422).json({
      error: "El mensaje debe tener entre 1 y 2000 caracteres.",
    });
  }
  if (
    body.conversation_id !== undefined &&
    body.conversation_id !== null &&
    typeof body.conversation_id !== "string"
  ) {
    return response.status(422).json({
      error: "El identificador de conversación no es válido.",
    });
  }

  try {
    const conversationId =
      typeof body.conversation_id === "string" &&
      body.conversation_id.trim().length > 0
        ? body.conversation_id.trim()
        : (await openai.conversations.create()).id;

    const result = await createAssistantResponse({
      openai,
      conversationId,
      message,
      agentRef,
      executeTool: executeAssistantTool,
    });

    if (!result.output_text) {
      throw new Error("Foundry returned an empty response.");
    }

    return response.json({
      conversation_id: conversationId,
      reply: result.output_text,
    });
  } catch (error) {
    console.error(
      "Foundry chat request failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(502).json({
      error: "No fue posible obtener una respuesta. Intenta de nuevo.",
    });
  }
});

app.use("/api/claims", requireLocalDemo);
app.post("/api/claims", async (request, response) => {
  const { branch, product, reason } = request.body ?? {};
  if (
    !branches.includes(branch) ||
    !validString(product, 1, 160) ||
    !validString(reason, 5, 1000)
  ) {
    return response.status(422).json({
      error: "Revisa la sucursal, el producto y el motivo del reclamo.",
    });
  }

  try {
    const claim = await registrarReporteDevolucion(
      branch,
      product.trim(),
      reason.trim(),
    );
    return response.status(201).json(claim);
  } catch (error) {
    console.error(
      "Claim registration failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible registrar el reclamo.",
    });
  }
});

app.get("/api/employee/demo-status", (_request, response) => {
  response.json({ enabled: localDemoEnabled });
});
app.use("/api/employee", requireLocalDemo);
app.get("/api/employee/config", (_request, response) => {
  response.json({ maxUploadBytes });
});
app.get("/api/employee/dashboard", async (_request, response) => {
  try {
    return response.json(await getDashboard());
  } catch (error) {
    console.error(
      "Employee dashboard failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible cargar el resumen.",
    });
  }
});

app.get("/api/employee/products", async (_request, response) => {
  try {
    return response.json(await getProductCatalog());
  } catch (error) {
    console.error(
      "Product catalog failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible cargar el catálogo.",
    });
  }
});

app.get("/api/employee/orders", async (_request, response) => {
  try {
    return response.json(await getDemoOrders());
  } catch (error) {
    console.error(
      "Demo orders list failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible cargar los pedidos de demostración.",
    });
  }
});

app.patch("/api/employee/orders/:id/status", async (request, response) => {
  const { status } = request.body ?? {};
  if (!demoOrderStatuses.includes(status)) {
    return response.status(422).json({
      error: "El estado del pedido no es válido.",
    });
  }

  try {
    const result = await setDemoOrderStatus(request.params.id, status);
    if (result.result === "invalid") {
      return response.status(422).json({
        error: "El identificador del pedido no es válido.",
      });
    }
    if (result.result === "not_found") {
      return response.status(404).json({
        error: "No se encontró el pedido de demostración.",
      });
    }
    if (result.result === "invalid_transition") {
      return response.status(409).json({
        error: `No se permite cambiar de ${result.status} a ${status}.`,
      });
    }
    return response.json({
      status: result.status,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error(
      "Demo order status update failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible actualizar el pedido de demostración.",
    });
  }
});

app.post("/api/employee/products", async (request, response) => {
  const { name, category, price } = request.body ?? {};
  if (
    !validString(name, 2, 120) ||
    (category !== undefined &&
      category !== null &&
      (typeof category !== "string" || category.trim().length > 100)) ||
    (price !== undefined &&
      price !== null &&
      (typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 100000000))
  ) {
    return response.status(422).json({
      error: "El nombre, categoría o precio del producto no son válidos.",
    });
  }

  try {
    return response.status(201).json(
      await createProduct({
        name: name.trim(),
        category: category ?? null,
        price: price ?? null,
      }),
    );
  } catch (error) {
    if (error?.code === "PRODUCT_CONFLICT") {
      return response.status(409).json({ error: error.message });
    }
    console.error(
      "Product creation failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible crear el producto.",
    });
  }
});

app.post("/api/employee/products/:id/inventory", async (request, response) => {
  const productId = Number(request.params.id);
  const { branch, stock } = request.body ?? {};
  if (
    !Number.isSafeInteger(productId) ||
    productId < 1 ||
    !branches.includes(branch) ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 100000000
  ) {
    return response.status(422).json({
      error: "El producto, sucursal o existencia no son válidos.",
    });
  }

  try {
    const result = await setProductInventory(productId, branch, stock);
    if (result.result === "not_found") {
      return response.status(404).json({ error: "No se encontró el producto." });
    }
    return response.json({ status: "updated" });
  } catch (error) {
    console.error(
      "Product inventory update failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible actualizar las existencias.",
    });
  }
});

app.post("/api/employee/aliases", async (request, response) => {
  const { productId, alias, branch } = request.body ?? {};
  if (
    !Number.isSafeInteger(productId) ||
    productId < 1 ||
    !validString(alias, 2, 120) ||
    (branch !== undefined && branch !== null && !branches.includes(branch))
  ) {
    return response.status(422).json({
      error: "El producto, alias o sucursal no son válidos.",
    });
  }

  try {
    await addProductAlias(productId, alias, branch ?? null);
    return response.status(201).json({ status: "created" });
  } catch (error) {
    if (error?.code === "ALIAS_CONFLICT") {
      return response.status(409).json({ error: error.message });
    }
    console.error(
      "Product alias creation failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible guardar el alias.",
    });
  }
});

app.get("/api/employee/claims", async (_request, response) => {
  try {
    return response.json(await getClaims());
  } catch (error) {
    console.error(
      "Claims list failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible cargar los reclamos.",
    });
  }
});

app.get("/api/employee/invoices", async (_request, response) => {
  try {
    return response.json(await getInvoices());
  } catch (error) {
    console.error(
      "Invoices list failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible cargar las facturas.",
    });
  }
});

app.post(
  "/api/employee/invoices/analyze",
  express.raw({
    type: () => true,
    limit: maxUploadBytes,
  }),
  async (request, response) => {
    const contentType = request
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    const bytes = request.body;

    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      return response.status(422).json({ error: "El archivo está vacío." });
    }
    if (contentType !== "application/pdf" && contentType !== "image/jpeg") {
      return response.status(415).json({
        error: "Solo se aceptan documentos PDF o imágenes JPEG.",
      });
    }

    const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    const isJpeg =
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    if (
      (contentType === "application/pdf" && !isPdf) ||
      (contentType === "image/jpeg" && !isJpeg)
    ) {
      return response.status(415).json({
        error: "El contenido no coincide con el formato declarado.",
      });
    }

    try {
      const result = await procesarFacturaInteligente(bytes);
      if (result.duplicate) {
        return response.status(409).json({
          error: "La factura ya existe; no se creó otro registro.",
          duplicate: result.invoice,
        });
      }
      return response.status(201).json(result.invoice);
    } catch (error) {
      if (error?.code === "DOCUMENT_INTELLIGENCE_NOT_CONFIGURED") {
        return response.status(503).json({
          error: "La extracción de facturas no está configurada.",
        });
      }
      if (error?.code === "INVOICE_NOT_READABLE") {
        return response.status(422).json({
          error: "No se pudieron leer campos de la factura.",
        });
      }
      console.error(
        "Invoice analysis failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      return response.status(502).json({
        error: "No fue posible analizar la factura.",
      });
    }
  },
);

app.patch("/api/employee/invoices/:id/review", async (request, response) => {
  const invoiceId = Number(request.params.id);
  const { status } = request.body ?? {};
  if (
    !Number.isSafeInteger(invoiceId) ||
    invoiceId < 1 ||
    !["APROBADA", "RECHAZADA"].includes(status)
  ) {
    return response.status(422).json({
      error: "La factura o el estado de revisión no son válidos.",
    });
  }

  try {
    const result = await setInvoiceReviewStatus(invoiceId, status);
    if (result.result === "not_found") {
      return response.status(404).json({ error: "No se encontró la factura." });
    }
    if (result.result === "not_reviewable") {
      return response.status(409).json({
        error: "La factura ya no está pendiente de revisión.",
      });
    }
    return response.json({ status: result.status });
  } catch (error) {
    console.error(
      "Invoice review failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible actualizar la revisión.",
    });
  }
});

app.post("/api/employee/invoices/:id/payments", async (request, response) => {
  const invoiceId = Number(request.params.id);
  const { reference } = request.body ?? {};
  if (
    !Number.isSafeInteger(invoiceId) ||
    invoiceId < 1 ||
    !validString(reference, 3, 80)
  ) {
    return response.status(422).json({
      error: "La factura o la referencia no son válidas.",
    });
  }

  try {
    const result = await createSimulatedPayment(invoiceId, reference);
    if (result.result === "not_found") {
      return response.status(404).json({ error: "No se encontró la factura." });
    }
    if (result.result === "not_approved") {
      return response.status(409).json({
        error: "Solo se puede simular un pago después de aprobar la factura.",
      });
    }
    if (result.result === "duplicate") {
      return response.status(409).json({
        error: "La factura o referencia ya tiene un pago simulado.",
      });
    }
    return response.status(201).json({
      status: "SIMULADO",
      id: result.id,
      message: "No se envió dinero ni se conectó con un banco.",
    });
  } catch (error) {
    if (error?.code === "INVALID_REFERENCE") {
      return response.status(422).json({ error: error.message });
    }
    console.error(
      "Simulated payment failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return response.status(500).json({
      error: "No fue posible registrar la simulación.",
    });
  }
});

app.use((error, _request, response, _next) => {
  if (error.type === "entity.parse.failed") {
    return response
      .status(400)
      .json({ error: "El JSON de la solicitud no es válido." });
  }
  if (error.type === "entity.too.large") {
    return response.status(413).json({
      error: `El archivo supera el límite de ${maxUploadBytes} bytes.`,
    });
  }

  console.error(
    "Unhandled server error:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return response.status(500).json({ error: "Ocurrió un error interno." });
});

export { app };

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await initializeDatabase();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, "0.0.0.0", () => {
      console.log(`Chatbot server listening on port ${port}.`);
    });
  } catch (error) {
    console.error(
      "Server startup failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    process.exitCode = 1;
  }
}
