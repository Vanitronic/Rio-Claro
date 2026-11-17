import { createHash, randomUUID } from "node:crypto";
import { normalizeText } from "./database.js";
import {
  allowedOrderTransitions,
  demoOrderStatuses,
  getDemoOrderStatus,
  getDemoOrders,
  getProductCatalog,
} from "./demoService.js";
import { extraerFactura } from "./documentIntelligence.js";

const sessionLifetimeMs = 30 * 60 * 1000;
const maximumSessions = 2000;
const temporaryProductIdStart = 2_000_000_000;
const temporaryInvoiceIdStart = 2_000_000_000;

const sessions = new Map();

function isSessionId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function createSessionState() {
  return {
    lastSeen: Date.now(),
    products: [],
    inventory: new Map(),
    aliases: [],
    claims: [],
    orderStatuses: new Map(),
    invoices: [],
    payments: [],
  };
}

export function expireIdleEmployeeSessions(now = Date.now()) {
  for (const [key, state] of sessions) {
    if (now - state.lastSeen >= sessionLifetimeMs) {
      sessions.delete(key);
    }
  }
}

export function getOrCreateEmployeeSession(userId, candidateId) {
  expireIdleEmployeeSessions();

  if (isSessionId(candidateId)) {
    const key = `${userId}:${candidateId}`;
    const existing = sessions.get(key);
    if (existing) {
      existing.lastSeen = Date.now();
      return { id: candidateId, state: existing };
    }
  }

  if (sessions.size >= maximumSessions) {
    const error = new Error("Se alcanzó el límite de sesiones temporales.");
    error.code = "SESSION_CAPACITY";
    throw error;
  }

  const id = randomUUID();
  const state = createSessionState();
  sessions.set(`${userId}:${id}`, state);
  return { id, state };
}

export async function getSessionProductCatalog(session) {
  const products = await getProductCatalog();
  products.push(...session.products.map((product) => ({
    ...product,
    aliases: [...product.aliases],
    stock: { ...product.stock },
  })));

  for (const product of products) {
    for (const [key, stock] of session.inventory) {
      const [productId, branch] = key.split(":");
      if (Number(productId) === product.id) {
        product.stock[branch] = stock;
      }
    }

    for (const alias of session.aliases) {
      if (
        alias.productId === product.id &&
        !product.aliases.includes(alias.alias)
      ) {
        product.aliases.push(alias.alias);
      }
    }
  }

  return products;
}

export async function createSessionProduct(session, { name, category, price }) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    const error = new Error("El nombre del producto no es válido.");
    error.code = "INVALID_PRODUCT";
    throw error;
  }
  const catalog = await getSessionProductCatalog(session);
  if (catalog.some((product) => normalizeText(product.name) === normalizedName)) {
    const error = new Error("Ya existe un producto con ese nombre normalizado.");
    error.code = "PRODUCT_CONFLICT";
    throw error;
  }

  const product = {
    id: temporaryProductIdStart + session.products.length,
    name: name.trim(),
    category: category?.trim() || null,
    price,
    aliases: [],
    stock: {},
  };
  session.products.push(product);
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
  };
}

export async function setSessionProductInventory(
  session,
  productId,
  branch,
  stock,
) {
  const products = await getSessionProductCatalog(session);
  if (!products.some((product) => product.id === productId)) {
    return { result: "not_found" };
  }

  session.inventory.set(`${productId}:${branch}`, stock);
  return { result: "updated" };
}

export async function addSessionProductAlias(
  session,
  productId,
  alias,
  branch = null,
) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) {
    const error = new Error("El alias no es válido.");
    error.code = "INVALID_ALIAS";
    throw error;
  }
  const products = await getSessionProductCatalog(session);
  const aliasExists = products.some((product) =>
    product.aliases.some(
      (existingAlias) => normalizeText(existingAlias) === normalizedAlias,
    ),
  );

  if (!products.some((product) => product.id === productId) || aliasExists) {
    const error = new Error("El alias ya está registrado o el producto no existe.");
    error.code = "ALIAS_CONFLICT";
    throw error;
  }

  session.aliases.push({
    productId,
    alias: alias.trim(),
    branch,
  });
}

export async function getSessionDashboard(session) {
  const products = await getSessionProductCatalog(session);
  return {
    products: products.length,
    pendingClaims: session.claims.filter(
      (claim) => claim.status === "PENDIENTE",
    ).length,
    invoicesToReview: session.invoices.filter((invoice) =>
      ["PENDIENTE_REVISION", "REQUIERE_REVISION"].includes(invoice.status),
    ).length,
    simulatedPayments: session.payments.length,
  };
}

export async function getSessionOrders(session) {
  const orders = await getDemoOrders();
  return orders.map((order) => ({
    ...order,
    ...(session.orderStatuses.get(order.orderId) ?? {}),
  }));
}

export async function getSessionOrderStatus(session, orderId) {
  if (typeof orderId !== "string" || !/^PED-DEMO-\d{3}$/.test(orderId)) {
    return null;
  }
  const order = await getDemoOrderStatus(orderId);
  if (!order) {
    return null;
  }
  return {
    ...order,
    ...(session.orderStatuses.get(orderId) ?? {}),
  };
}

export async function setSessionOrderStatus(session, orderId, status) {
  if (
    typeof orderId !== "string" ||
    !/^PED-DEMO-\d{3}$/.test(orderId) ||
    !demoOrderStatuses.includes(status)
  ) {
    return { result: "invalid" };
  }

  const current = await getSessionOrderStatus(session, orderId);
  if (!current) {
    return { result: "not_found" };
  }
  if (!allowedOrderTransitions[current.status]?.includes(status)) {
    return { result: "invalid_transition", status: current.status };
  }

  const updatedAt = new Date().toISOString();
  session.orderStatuses.set(orderId, { status, updatedAt });
  return { result: "updated", orderId, status, updatedAt };
}

export function createSessionClaim(session, { branch, product, reason }) {
  const createdAt = new Date().toISOString();
  const claim = {
    folio: `RC-T${String(session.claims.length + 1).padStart(6, "0")}`,
    branch,
    product: product.trim(),
    reason: reason.trim(),
    status: "PENDIENTE",
    createdAt,
  };
  session.claims.unshift(claim);
  return {
    folio: claim.folio,
    estado: claim.status,
    mensaje: "Tu reclamo quedó registrado para revisión del equipo.",
  };
}

export function getSessionClaims(session) {
  return session.claims.map((claim) => ({ ...claim }));
}

function invoiceResponse(invoice) {
  return {
    id: invoice.id,
    supplier: invoice.supplier,
    invoiceId: invoice.invoiceId,
    date: invoice.date,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    confidence: invoice.confidence,
    status: invoice.status,
    createdAt: invoice.createdAt,
  };
}

export async function analyzeSessionInvoice(session, bytes) {
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const existing = session.invoices.find(
    (invoice) => invoice.fileHash === fileHash,
  );
  if (existing) {
    return { duplicate: true, invoice: invoiceResponse(existing) };
  }

  const extracted = await extraerFactura(bytes);
  const normalizedSupplier = normalizeText(extracted.supplier);
  const normalizedInvoiceId = normalizeText(extracted.invoiceId).replace(
    /\s/g,
    "",
  );
  const duplicate = session.invoices.find(
    (invoice) =>
      normalizedSupplier &&
      normalizedInvoiceId &&
      invoice.normalizedSupplier === normalizedSupplier &&
      invoice.normalizedInvoiceId === normalizedInvoiceId,
  );
  if (duplicate) {
    return { duplicate: true, invoice: invoiceResponse(duplicate) };
  }

  const reviewRequired =
    !normalizedSupplier ||
    !normalizedInvoiceId ||
    !Number.isFinite(extracted.total) ||
    extracted.total <= 0 ||
    extracted.confidence < 0.85;
  const invoice = {
    id: temporaryInvoiceIdStart + session.invoices.length,
    ...extracted,
    status: reviewRequired ? "REQUIERE_REVISION" : "PENDIENTE_REVISION",
    createdAt: new Date().toISOString(),
    fileHash,
    normalizedSupplier,
    normalizedInvoiceId,
  };
  session.invoices.unshift(invoice);
  return { duplicate: false, invoice: invoiceResponse(invoice) };
}

export function getSessionInvoices(session) {
  return session.invoices.map((invoice) => ({
    ...invoiceResponse(invoice),
    source: "Document Intelligence",
  }));
}

export function setSessionInvoiceReviewStatus(session, invoiceId, status) {
  const invoice = session.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) {
    return { result: "not_found" };
  }
  if (!["PENDIENTE_REVISION", "REQUIERE_REVISION"].includes(invoice.status)) {
    return { result: "not_reviewable", status: invoice.status };
  }
  invoice.status = status;
  return { result: "updated", status };
}

export function createSessionSimulatedPayment(session, invoiceId, reference) {
  const normalizedReference = reference.trim().toUpperCase();
  if (!normalizedReference) {
    const error = new Error("La referencia no es válida.");
    error.code = "INVALID_REFERENCE";
    throw error;
  }

  const invoice = session.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) {
    return { result: "not_found" };
  }
  if (invoice.status !== "APROBADA") {
    return { result: "not_approved" };
  }
  if (
    session.payments.some(
      (payment) =>
        payment.invoiceId === invoiceId ||
        payment.reference === normalizedReference,
    )
  ) {
    return { result: "duplicate" };
  }

  const payment = {
    id: session.payments.length + 1,
    invoiceId,
    reference: normalizedReference,
  };
  session.payments.push(payment);
  return { result: "created", id: payment.id };
}

const cleanupTimer = setInterval(
  () => expireIdleEmployeeSessions(),
  5 * 60 * 1000,
);
cleanupTimer.unref();
