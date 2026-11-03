const warning = document.querySelector("#demo-warning");
const productList = document.querySelector("#product-list");
const invoiceList = document.querySelector("#invoice-list");
const claimList = document.querySelector("#claim-list");
const aliasForm = document.querySelector("#alias-form");
const invoiceForm = document.querySelector("#invoice-form");
const aliasStatus = document.querySelector("#alias-status");
const invoiceStatus = document.querySelector("#invoice-status");
const productSearch = document.querySelector("#product-search");

let products = [];
let maxUploadBytes = 5 * 1024 * 1024;
let apiAvailable = true;

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
  const select = document.querySelector("#alias-product");
  select.replaceChildren();
  for (const product of products) {
    const option = createElement("option", product.name);
    option.value = String(product.id);
    select.append(option);
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
  const [config, dashboard, loadedProducts, claims, invoices] = await Promise.all([
    requestJson("/api/employee/config"),
    requestJson("/api/employee/dashboard"),
    requestJson("/api/employee/products"),
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
  renderClaims(claims);
  renderInvoices(invoices);
}

function showStaticPreview() {
  apiAvailable = false;
  for (const control of document.querySelectorAll(
    "#alias-form input, #alias-form select, #alias-form button, #invoice-form input, #invoice-form button",
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
      aliases: ["CLORO LITRO", "Cloro 1L", "Blanqueador 1000ml"],
      stock: { Guadalajara: 12, León: 45 },
    },
    {
      id: 2,
      name: "Pinol Limpiador 800ml",
      category: "Limpieza e Higiene",
      aliases: ["PINOL 800", "Limpiador Pino 800ml"],
      stock: { León: 30, Querétaro: 8 },
    },
  ];
  populateProductSelect();
  renderProducts();
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
