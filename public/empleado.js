const warning = document.querySelector("#demo-warning");
const orderList = document.querySelector("#order-list");
const productList = document.querySelector("#product-list");
const invoiceList = document.querySelector("#invoice-list");
const claimList = document.querySelector("#claim-list");
const productForm = document.querySelector("#product-form");
const inventoryForm = document.querySelector("#inventory-form");
const aliasForm = document.querySelector("#alias-form");
const invoiceForm = document.querySelector("#invoice-form");
const productStatus = document.querySelector("#product-status");
const inventoryStatus = document.querySelector("#inventory-status");
const aliasStatus = document.querySelector("#alias-status");
const invoiceStatus = document.querySelector("#invoice-status");
const productSearch = document.querySelector("#product-search");

let products = [];
let maxUploadBytes = 5 * 1024 * 1024;
let apiAvailable = true;

const orderTransitions = {
  PEDIDO_REGISTRADO: ["EN_PREPARACION", "INCIDENCIA"],
  EN_PREPARACION: ["ENVIADO", "INCIDENCIA"],
  ENVIADO: ["EN_REPARTO", "INCIDENCIA"],
  EN_REPARTO: ["ENTREGA_CONFIRMADA", "INCIDENCIA"],
  ENTREGA_CONFIRMADA: [],
  INCIDENCIA: [],
};

const orderStatusLabels = {
  PEDIDO_REGISTRADO: "Pedido registrado por Río Claro",
  EN_PREPARACION: "En preparación en la sucursal",
  ENVIADO: "Salió de la sucursal",
  EN_REPARTO: "En reparto hacia el domicilio",
  ENTREGA_CONFIRMADA: "Entrega confirmada al cliente",
  INCIDENCIA: "Incidencia; requiere seguimiento",
};

function createElement(tagName, text, className) {
  const element = document.createElement(tagName);
  if (text !== undefined) {
    element.textContent = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "No fue posible completar la solicitud.");
  }
  return result;
}

function renderOrders(orders) {
  orderList.replaceChildren();
  if (orders.length === 0) {
    orderList.append(createElement("p", "No hay pedidos ficticios."));
    return;
  }

  for (const order of orders) {
    const card = createElement("article", undefined, "record-card");
    card.append(createElement("h3", order.orderId));
    card.append(
      createElement(
        "p",
        `Estado: ${orderStatusLabels[order.status] || "Estado no disponible"}`,
      ),
    );
    card.append(
      createElement(
        "p",
        `Actualizado: ${new Date(order.updatedAt).toLocaleString("es-MX")}`,
      ),
    );

    const availableTransitions = orderTransitions[order.status] || [];
    if (apiAvailable && availableTransitions.length > 0) {
      const actions = createElement("form", undefined, "record-actions");
      const label = createElement(
        "label",
        `Nuevo estado para ${order.orderId}`,
      );
      const select = document.createElement("select");
      const initialOption = createElement("option", "Selecciona un estado");
      initialOption.value = "";
      initialOption.disabled = true;
      initialOption.selected = true;
      select.append(initialOption);
      for (const status of availableTransitions) {
        const option = createElement(
          "option",
          orderStatusLabels[status] || status,
        );
        option.value = status;
        select.append(option);
      }
      label.htmlFor = `order-status-${order.orderId}`;
      select.id = label.htmlFor;
      select.required = true;
      const button = createElement("button", "Actualizar estado");
      button.type = "submit";
      actions.append(label, select, button);
      actions.addEventListener("submit", (event) => {
        event.preventDefault();
        updateOrderStatus(order.orderId, select.value);
      });
      card.append(actions);
    }
    orderList.append(card);
  }
}

function renderProducts() {
  const search = productSearch.value.trim().toLocaleLowerCase("es-MX");
  productList.replaceChildren();

  const matchingProducts = products.filter((product) => {
    const searchable = [
      product.name,
      ...product.aliases,
      ...Object.keys(product.stock),
    ]
      .join(" ")
      .toLocaleLowerCase("es-MX");
    return searchable.includes(search);
  });

  if (matchingProducts.length === 0) {
    productList.append(createElement("p", "No hay productos coincidentes."));
    return;
  }

  for (const product of matchingProducts) {
    const card = createElement("article", undefined, "record-card");
    card.append(createElement("h3", product.name));
    card.append(createElement("p", `Categoría: ${product.category || "Sin categoría"}`));
    const priceText =
      typeof product.price === "number"
        ? new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(product.price)
        : "Sin precio base";
    card.append(createElement("p", `Precio base: ${priceText}`));
    card.append(
      createElement(
        "p",
        `Alias: ${product.aliases.length ? product.aliases.join(", ") : "Sin alias"}`,
      ),
    );
    const stockText = Object.entries(product.stock)
      .map(([branch, count]) => `${branch}: ${count}`)
      .join(" · ");
    card.append(createElement("p", `Existencias: ${stockText || "Sin datos"}`));
    productList.append(card);
  }
}

function populateProductSelect() {
  for (const selectId of ["#alias-product", "#inventory-product"]) {
    const select = document.querySelector(selectId);
    select.replaceChildren();
    for (const product of products) {
      const option = createElement("option", product.name);
      option.value = String(product.id);
      select.append(option);
    }
  }
}

function renderClaims(claims) {
  claimList.replaceChildren();
  if (claims.length === 0) {
    claimList.append(createElement("p", "Aún no hay reclamos registrados."));
    return;
  }

  for (const claim of claims) {
    const card = createElement("article", undefined, "record-card");
    card.append(createElement("h3", `${claim.folio} · ${claim.status}`));
    card.append(createElement("p", `Sucursal: ${claim.branch}`));
    card.append(createElement("p", `Producto: ${claim.product}`));
    card.append(createElement("p", `Motivo: ${claim.reason}`));
    card.append(
      createElement("p", `Recibido: ${new Date(claim.createdAt).toLocaleString("es-MX")}`),
    );
    claimList.append(card);
  }
}

function renderInvoices(invoices) {
  invoiceList.replaceChildren();
  if (invoices.length === 0) {
    invoiceList.append(createElement("p", "Aún no hay facturas capturadas."));
    return;
  }

  for (const invoice of invoices) {
    const card = createElement("article", undefined, "record-card");
    const amount =
      typeof invoice.total === "number"
        ? new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(invoice.total)
        : "No identificado";
    card.append(
      createElement(
        "h3",
        `${invoice.supplier || "Proveedor sin identificar"} · ${invoice.invoiceId || "Sin folio"}`,
      ),
    );
    card.append(createElement("p", `Total: ${amount}`));
    card.append(createElement("p", `Estado: ${invoice.status}`));
    card.append(
      createElement(
        "p",
        `Confianza mínima: ${Math.round((invoice.confidence || 0) * 100)}%`,
      ),
    );

    if (
      apiAvailable &&
      ["PENDIENTE_REVISION", "REQUIERE_REVISION"].includes(invoice.status)
    ) {
      const actions = createElement("div", undefined, "record-actions");
      const approve = createElement("button", "Aprobar");
      const reject = createElement("button", "Rechazar", "secondary");
      approve.type = "button";
      reject.type = "button";
      approve.addEventListener("click", () => updateInvoice(invoice.id, "APROBADA"));
      reject.addEventListener("click", () => updateInvoice(invoice.id, "RECHAZADA"));
      actions.append(approve, reject);
      card.append(actions);
    }

    if (apiAvailable && invoice.status === "APROBADA") {
      const actions = createElement("form", undefined, "record-actions");
      const reference = document.createElement("input");
      reference.name = "reference";
      reference.minLength = 3;
      reference.maxLength = 80;
      reference.placeholder = "Referencia única de prueba";
      reference.required = true;
      const payment = createElement("button", "Simular pago");
      payment.type = "submit";
      actions.append(reference, payment);
      actions.addEventListener("submit", (event) => {
        event.preventDefault();
        simulatePayment(invoice.id, reference.value);
      });
      card.append(actions);
    }
    invoiceList.append(card);
  }
}

async function updateInvoice(id, status) {
  try {
    await requestJson(`/api/employee/invoices/${id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshData();
  } catch (error) {
    warning.textContent =
      error instanceof Error ? error.message : "No fue posible revisar la factura.";
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    await requestJson(`/api/employee/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    warning.textContent = `Estado de ${orderId} actualizado.`;
    await refreshData();
  } catch (error) {
    warning.textContent =
      error instanceof Error
        ? error.message
        : "No fue posible actualizar el pedido ficticio.";
  }
}

async function simulatePayment(id, reference) {
  try {
    const result = await requestJson(`/api/employee/invoices/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    warning.textContent = result.message;
    await refreshData();
  } catch (error) {
    warning.textContent =
      error instanceof Error ? error.message : "No fue posible simular el pago.";
  }
}

async function refreshData() {
  const [
    config,
    dashboard,
    loadedProducts,
    orders,
    claims,
    invoices,
  ] = await Promise.all([
    requestJson("/api/employee/config"),
    requestJson("/api/employee/dashboard"),
    requestJson("/api/employee/products"),
    requestJson("/api/employee/orders"),
    requestJson("/api/employee/claims"),
    requestJson("/api/employee/invoices"),
  ]);
  maxUploadBytes = config.maxUploadBytes;
  document.querySelector("#invoice-description").textContent =
    `PDF o JPEG/JPG, máximo ${Math.ceil(maxUploadBytes / (1024 * 1024))} MiB. ` +
    "La extracción requiere Azure AI Document Intelligence.";
  products = loadedProducts;
  document.querySelector("#metric-products").textContent = dashboard.products;
  document.querySelector("#metric-claims").textContent = dashboard.pendingClaims;
  document.querySelector("#metric-invoices").textContent = dashboard.invoicesToReview;
  document.querySelector("#metric-payments").textContent = dashboard.simulatedPayments;
  populateProductSelect();
  renderProducts();
  renderOrders(orders);
  renderClaims(claims);
  renderInvoices(invoices);
}

function showStaticPreview() {
  apiAvailable = false;
  for (const control of document.querySelectorAll(
    "#product-form input, #product-form button, #inventory-form input, #inventory-form select, #inventory-form button, #alias-form input, #alias-form select, #alias-form button, #invoice-form input, #invoice-form button",
  )) {
    control.disabled = true;
  }
  document.querySelector("#metric-products").textContent = "2";
  document.querySelector("#metric-claims").textContent = "1";
  document.querySelector("#metric-invoices").textContent = "1";
  document.querySelector("#metric-payments").textContent = "0";
  products = [
    {
      id: 1,
      name: "Cloro 1 Litro",
      category: "Limpieza e Higiene",
      price: 18.5,
      aliases: ["CLORO LITRO", "Cloro 1L", "Blanqueador 1000ml"],
      stock: { Guadalajara: 12, León: 45 },
    },
    {
      id: 2,
      name: "Pinol Limpiador 800ml",
      category: "Limpieza e Higiene",
      price: 25,
      aliases: ["PINOL 800", "Limpiador Pino 800ml"],
      stock: { León: 30, Querétaro: 8 },
    },
  ];
  populateProductSelect();
  renderProducts();
  renderOrders([
    {
      orderId: "PED-DEMO-001",
      status: "PEDIDO_REGISTRADO",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
    {
      orderId: "PED-DEMO-002",
      status: "EN_PREPARACION",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
    {
      orderId: "PED-DEMO-003",
      status: "ENVIADO",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
    {
      orderId: "PED-DEMO-004",
      status: "EN_REPARTO",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
    {
      orderId: "PED-DEMO-005",
      status: "ENTREGA_CONFIRMADA",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
    {
      orderId: "PED-DEMO-006",
      status: "INCIDENCIA",
      updatedAt: "2026-10-25T18:00:00.000Z",
    },
  ]);
  renderClaims([
    {
      folio: "RC-DEMO-001",
      branch: "León",
      product: "Cloro 1L",
      reason: "Datos de ejemplo, no es un reclamo real.",
      status: "PENDIENTE",
      createdAt: "2026-10-25T18:00:00.000Z",
    },
  ]);
  renderInvoices([
    {
      id: 1,
      supplier: "Proveedor de muestra",
      invoiceId: "FAC-DEMO-001",
      total: 1450,
      status: "REQUIERE_REVISION",
      confidence: 0.72,
    },
  ]);
  warning.textContent =
    "Vista estática con datos ficticios. Sin autenticación, cambios ni acceso a APIs en esta instancia.";
}

productSearch.addEventListener("input", renderProducts);

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = productForm.querySelector("button");
  submitButton.disabled = true;
  productStatus.textContent = "Creando producto…";
  const formData = new FormData(productForm);
  const priceValue = formData.get("price");

  try {
    await requestJson("/api/employee/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        category: formData.get("category") || null,
        price: priceValue === "" ? null : Number(priceValue),
      }),
    });
    productForm.reset();
    productStatus.textContent = "Producto creado.";
    await refreshData();
  } catch (error) {
    productStatus.textContent =
      error instanceof Error ? error.message : "No fue posible crear el producto.";
  } finally {
    submitButton.disabled = false;
  }
});

inventoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = inventoryForm.querySelector("button");
  submitButton.disabled = true;
  inventoryStatus.textContent = "Guardando existencias…";
  const formData = new FormData(inventoryForm);

  try {
    await requestJson(
      `/api/employee/products/${formData.get("productId")}/inventory`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: formData.get("branch"),
          stock: Number(formData.get("stock")),
        }),
      },
    );
    inventoryStatus.textContent = "Existencias guardadas.";
    await refreshData();
  } catch (error) {
    inventoryStatus.textContent =
      error instanceof Error
        ? error.message
        : "No fue posible actualizar las existencias.";
  } finally {
    submitButton.disabled = false;
  }
});

aliasForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  aliasStatus.textContent = "Guardando…";
  const formData = new FormData(aliasForm);
  const productId = Number(formData.get("productId"));
  const branch = formData.get("branch");

  try {
    await requestJson("/api/employee/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        alias: formData.get("alias"),
        ...(branch ? { branch } : {}),
      }),
    });
    aliasForm.reset();
    aliasStatus.textContent = "Alias agregado al catálogo.";
    await refreshData();
  } catch (error) {
    aliasStatus.textContent =
      error instanceof Error ? error.message : "No fue posible guardar el alias.";
  }
});

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.querySelector("#invoice-file").files[0];
  if (!file) {
    return;
  }

  if (file.size > maxUploadBytes) {
    invoiceStatus.textContent = "El archivo supera el límite configurado.";
    return;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const contentType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : "";
  if (!contentType) {
    invoiceStatus.textContent = "Selecciona un archivo PDF o JPEG/JPG.";
    return;
  }

  invoiceStatus.textContent = "Analizando con Azure AI Document Intelligence…";
  const submitButton = invoiceForm.querySelector("button");
  submitButton.disabled = true;

  try {
    const result = await requestJson("/api/employee/invoices/analyze", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });
    invoiceStatus.textContent =
      `Borrador ${result.id} extraído. Revisa los campos antes de aprobar.`;
    invoiceForm.reset();
    await refreshData();
  } catch (error) {
    invoiceStatus.textContent =
      error instanceof Error ? error.message : "No fue posible analizar el archivo.";
  } finally {
    submitButton.disabled = false;
  }
});

requestJson("/api/employee/demo-status")
  .then(({ enabled }) => (enabled ? refreshData() : showStaticPreview()))
  .catch(() => showStaticPreview());
