import { get, all, normalizeText, run } from "./database.js";

export const branches = [
  "Guadalajara",
  "Zapopan",
  "León",
  "Querétaro",
  "Aguascalientes",
];

export const demoOrderStatuses = [
  "PEDIDO_REGISTRADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_REPARTO",
  "ENTREGA_CONFIRMADA",
  "INCIDENCIA",
];

export const demoOrderStatusLabels = {
  PEDIDO_REGISTRADO: "Pedido registrado por Río Claro",
  EN_PREPARACION: "En preparación en la sucursal",
  ENVIADO: "Salió de la sucursal",
  EN_REPARTO: "En reparto hacia el domicilio",
  ENTREGA_CONFIRMADA: "Entrega confirmada al cliente",
  INCIDENCIA: "Incidencia; requiere seguimiento",
};

export const allowedOrderTransitions = {
  PEDIDO_REGISTRADO: ["EN_PREPARACION", "INCIDENCIA"],
  EN_PREPARACION: ["ENVIADO", "INCIDENCIA"],
  ENVIADO: ["EN_REPARTO", "INCIDENCIA"],
  EN_REPARTO: ["ENTREGA_CONFIRMADA", "INCIDENCIA"],
  ENTREGA_CONFIRMADA: [],
  INCIDENCIA: [],
};

function isDemoOrderId(orderId) {
  return typeof orderId === "string" && /^PED-DEMO-\d{3}$/.test(orderId);
}

export async function getDemoOrders() {
  return all(
    `SELECT id_pedido AS orderId, estado AS status, actualizado_en AS updatedAt
     FROM pedidos_demo ORDER BY id_pedido`,
  );
}

export async function getDemoOrderStatus(orderId) {
  if (!isDemoOrderId(orderId)) {
    return null;
  }
  const order = await get(
    `SELECT id_pedido AS orderId, estado AS status,
            actualizado_en AS updatedAt
     FROM pedidos_demo WHERE id_pedido = ?`,
    [orderId],
  );
  return order ?? null;
}

export async function setDemoOrderStatus(orderId, status) {
  if (!isDemoOrderId(orderId) || !demoOrderStatuses.includes(status)) {
    return { result: "invalid" };
  }
  const current = await get(
    "SELECT estado FROM pedidos_demo WHERE id_pedido = ?",
    [orderId],
  );
  if (!current) {
    return { result: "not_found" };
  }
  if (!allowedOrderTransitions[current.estado]?.includes(status)) {
    return { result: "invalid_transition", status: current.estado };
  }

  const updatedAt = new Date().toISOString();
  const update = await run(
    `UPDATE pedidos_demo SET estado = ?, actualizado_en = ?
     WHERE id_pedido = ? AND estado = ?`,
    [status, updatedAt, orderId, current.estado],
  );
  if (!update.changes) {
    return { result: "invalid_transition", status: current.estado };
  }
  return { result: "updated", orderId, status, updatedAt };
}

export async function getDashboard() {
  const [products, claims, invoices, payments] = await Promise.all([
    get("SELECT COUNT(*) AS count FROM productos_maestros"),
    get("SELECT COUNT(*) AS count FROM reclamos WHERE estado = 'PENDIENTE'"),
    get(
      `SELECT COUNT(*) AS count FROM facturas_procesadas
       WHERE estado IN ('PENDIENTE_REVISION', 'REQUIERE_REVISION')`,
    ),
    get("SELECT COUNT(*) AS count FROM pagos_demo"),
  ]);

  return {
    products: products.count,
    pendingClaims: claims.count,
    invoicesToReview: invoices.count,
    simulatedPayments: payments.count,
  };
}

export async function getProductCatalog() {
  const rows = await all(`
    SELECT
      product.id_producto,
      product.nombre_estandar,
      product.categoria,
      product.precio_base,
      alias.alias,
      inventory.sucursal,
      inventory.stock_actual
    FROM productos_maestros AS product
    LEFT JOIN alias_productos AS alias
      ON alias.id_producto = product.id_producto
    LEFT JOIN inventario_sucursales AS inventory
      ON inventory.id_producto = product.id_producto
    ORDER BY product.nombre_estandar, inventory.sucursal, alias.alias
  `);

  const products = new Map();
  for (const row of rows) {
    if (!products.has(row.id_producto)) {
      products.set(row.id_producto, {
        id: row.id_producto,
        name: row.nombre_estandar,
        category: row.categoria,
        price: row.precio_base,
        aliases: [],
        stock: {},
      });
    }

    const product = products.get(row.id_producto);
    if (row.alias && !product.aliases.includes(row.alias)) {
      product.aliases.push(row.alias);
    }
    if (row.sucursal !== null) {
      product.stock[row.sucursal] = row.stock_actual;
    }
  }

  return [...products.values()];
}

export async function createProduct({ name, category = null, price = null }) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    const error = new Error("El nombre del producto no es válido.");
    error.code = "INVALID_PRODUCT";
    throw error;
  }

  try {
    const inserted = await run(
      `INSERT INTO productos_maestros
        (nombre_estandar, nombre_normalizado, categoria, precio_base)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), normalizedName, category?.trim() || null, price],
    );
    return {
      id: inserted.lastID,
      name: name.trim(),
      category: category?.trim() || null,
      price,
    };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      const conflict = new Error("Ya existe un producto con ese nombre normalizado.");
      conflict.code = "PRODUCT_CONFLICT";
      throw conflict;
    }
    throw error;
  }
}

export async function setProductInventory(productId, branch, stock) {
  const product = await get(
    "SELECT id_producto FROM productos_maestros WHERE id_producto = ?",
    [productId],
  );
  if (!product) {
    return { result: "not_found" };
  }

  await run(
    `INSERT INTO inventario_sucursales
      (id_producto, sucursal, stock_actual)
     VALUES (?, ?, ?)
     ON CONFLICT(id_producto, sucursal)
     DO UPDATE SET stock_actual = excluded.stock_actual`,
    [productId, branch, stock],
  );
  return { result: "updated" };
}

export async function addProductAlias(productId, alias, branch = null) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) {
    const error = new Error("El alias no es válido.");
    error.code = "INVALID_ALIAS";
    throw error;
  }

  try {
    await run(
      `INSERT INTO alias_productos (id_producto, alias, alias_normalizado, sucursal)
       VALUES (?, ?, ?, ?)`,
      [productId, alias.trim(), normalizedAlias, branch],
    );
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      const conflict = new Error("El alias ya está registrado o el producto no existe.");
      conflict.code = "ALIAS_CONFLICT";
      throw conflict;
    }
    throw error;
  }
}

export async function createClaim({ branch, product, reason }) {
  const createdAt = new Date().toISOString();
  const inserted = await run(
    `INSERT INTO reclamos (sucursal, producto, motivo, estado, creado_en)
     VALUES (?, ?, ?, 'PENDIENTE', ?)`,
    [branch, product.trim(), reason.trim(), createdAt],
  );
  return {
    folio: `RC-${String(inserted.lastID).padStart(6, "0")}`,
    status: "PENDIENTE",
    createdAt,
  };
}

export async function getClaims() {
  const rows = await all(
    `SELECT id_reclamo, sucursal, producto, motivo, estado, creado_en
     FROM reclamos ORDER BY id_reclamo DESC LIMIT 100`,
  );
  return rows.map((row) => ({
    folio: `RC-${String(row.id_reclamo).padStart(6, "0")}`,
    branch: row.sucursal,
    product: row.producto,
    reason: row.motivo,
    status: row.estado,
    createdAt: row.creado_en,
  }));
}

export async function saveInvoiceDraft(invoice, fileHash) {
  const normalizedSupplier = normalizeText(invoice.supplier);
  const normalizedInvoiceId = normalizeText(invoice.invoiceId).replace(/\s/g, "");
  const duplicateConditions = [];
  const duplicateParams = [];

  if (fileHash) {
    duplicateConditions.push("hash_archivo = ?");
    duplicateParams.push(fileHash);
  }
  if (normalizedSupplier && normalizedInvoiceId) {
    duplicateConditions.push(
      "(proveedor_normalizado = ? AND folio_normalizado = ?)",
    );
    duplicateParams.push(normalizedSupplier, normalizedInvoiceId);
  }

  if (duplicateConditions.length) {
    const duplicate = await get(
      `SELECT id, proveedor_nombre, folio_factura, total, estado
       FROM facturas_procesadas
       WHERE ${duplicateConditions.join(" OR ")}
       LIMIT 1`,
      duplicateParams,
    );
    if (duplicate) {
      return {
        duplicate: true,
        invoice: {
          id: duplicate.id,
          supplier: duplicate.proveedor_nombre,
          invoiceId: duplicate.folio_factura,
          total: duplicate.total,
          status: duplicate.estado,
        },
      };
    }
  }

  const reviewRequired =
    !normalizedSupplier ||
    !normalizedInvoiceId ||
    !Number.isFinite(invoice.total) ||
    invoice.total <= 0 ||
    invoice.confidence < 0.85;
  const status = reviewRequired
    ? "REQUIERE_REVISION"
    : "PENDIENTE_REVISION";
  const createdAt = new Date().toISOString();

  try {
    const result = await run(
      `INSERT INTO facturas_procesadas (
        folio_factura, proveedor_nombre, total, estado, origen, fecha_factura,
        subtotal, iva, confianza, proveedor_normalizado, folio_normalizado,
        hash_archivo, creada_en
      ) VALUES (?, ?, ?, ?, 'Document Intelligence', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.invoiceId || null,
        invoice.supplier || null,
        invoice.total ?? null,
        status,
        invoice.date || null,
        invoice.subtotal ?? null,
        invoice.tax ?? null,
        invoice.confidence,
        normalizedSupplier || null,
        normalizedInvoiceId || null,
        fileHash || null,
        createdAt,
      ],
    );

    return {
      duplicate: false,
      invoice: {
        id: result.lastID,
        supplier: invoice.supplier,
        invoiceId: invoice.invoiceId,
        date: invoice.date,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        confidence: invoice.confidence,
        status,
        createdAt,
      },
    };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      const duplicate = await get(
        `SELECT id, proveedor_nombre, folio_factura, total, estado
         FROM facturas_procesadas
         WHERE hash_archivo = ?
            OR (proveedor_normalizado = ? AND folio_normalizado = ?)
         LIMIT 1`,
        [fileHash, normalizedSupplier, normalizedInvoiceId],
      );
      if (duplicate) {
        return {
          duplicate: true,
          invoice: {
            id: duplicate.id,
            supplier: duplicate.proveedor_nombre,
            invoiceId: duplicate.folio_factura,
            total: duplicate.total,
            status: duplicate.estado,
          },
        };
      }
    }
    throw error;
  }
}

export async function getInvoices() {
  const rows = await all(
    `SELECT id, folio_factura, proveedor_nombre, total, estado, origen,
            fecha_factura, subtotal, iva, confianza, creada_en
     FROM facturas_procesadas ORDER BY id DESC LIMIT 100`,
  );
  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.folio_factura,
    supplier: row.proveedor_nombre,
    total: row.total,
    status: row.estado,
    source: row.origen,
    date: row.fecha_factura,
    subtotal: row.subtotal,
    tax: row.iva,
    confidence: row.confianza,
    createdAt: row.creada_en,
  }));
}

export async function findInvoiceByHash(fileHash) {
  const duplicate = await get(
    `SELECT id, proveedor_nombre, folio_factura, total, estado
     FROM facturas_procesadas WHERE hash_archivo = ?`,
    [fileHash],
  );
  return duplicate
    ? {
        id: duplicate.id,
        supplier: duplicate.proveedor_nombre,
        invoiceId: duplicate.folio_factura,
        total: duplicate.total,
        status: duplicate.estado,
      }
    : null;
}

export async function setInvoiceReviewStatus(invoiceId, status) {
  const updated = await run(
    `UPDATE facturas_procesadas SET estado = ?
     WHERE id = ? AND estado IN ('PENDIENTE_REVISION', 'REQUIERE_REVISION')`,
    [status, invoiceId],
  );
  if (!updated.changes) {
    const existing = await get(
      "SELECT id, estado FROM facturas_procesadas WHERE id = ?",
      [invoiceId],
    );
    if (!existing) {
      return { result: "not_found" };
    }
    return { result: "not_reviewable", status: existing.estado };
  }
  return { result: "updated", status };
}

export async function createSimulatedPayment(invoiceId, reference) {
  const normalizedReference = reference.trim().toUpperCase();
  if (!normalizedReference) {
    const error = new Error("La referencia no es válida.");
    error.code = "INVALID_REFERENCE";
    throw error;
  }

  const invoice = await get(
    "SELECT total, estado FROM facturas_procesadas WHERE id = ?",
    [invoiceId],
  );
  if (!invoice) {
    return { result: "not_found" };
  }
  if (invoice.estado !== "APROBADA") {
    return { result: "not_approved" };
  }

  try {
    const inserted = await run(
      `INSERT INTO pagos_demo (id_factura, referencia, monto, estado, creado_en)
       VALUES (?, ?, ?, 'SIMULADO', ?)`,
      [invoiceId, normalizedReference, invoice.total, new Date().toISOString()],
    );
    return { result: "created", id: inserted.lastID };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      return { result: "duplicate" };
    }
    throw error;
  }
}
