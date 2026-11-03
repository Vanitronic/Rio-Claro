import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
const client = endpoint
  ? new DocumentAnalysisClient(endpoint, new DefaultAzureCredential())
  : null;

function getField(fields, ...names) {
  for (const name of names) {
    if (fields?.[name]) {
      return fields[name];
    }
  }
  return undefined;
}

function getText(field) {
  const value = field?.value;
  if (typeof value === "string") {
    return value.trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof field?.content === "string") {
    return field.content.trim();
  }
  return "";
}

function getNumber(field) {
  const value = field?.value;
  const amount =
    value && typeof value === "object" ? value.amount : value;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

export async function extraerFactura(buffer) {
  if (!client) {
    const error = new Error("Document Intelligence no está configurado.");
    error.code = "DOCUMENT_INTELLIGENCE_NOT_CONFIGURED";
    throw error;
  }

  const poller = await client.beginAnalyzeDocument(
    "prebuilt-invoice",
    buffer,
  );
  const result = await poller.pollUntilDone();
  const fields = result.documents?.[0]?.fields;
  if (!fields) {
    const error = new Error("No se encontraron campos en la factura.");
    error.code = "INVOICE_NOT_READABLE";
    throw error;
  }

  const supplierField = getField(fields, "VendorName", "vendorName");
  const invoiceIdField = getField(fields, "InvoiceId", "invoiceId");
  const dateField = getField(fields, "InvoiceDate", "invoiceDate");
  const subtotalField = getField(fields, "SubTotal", "subTotal");
  const taxField = getField(fields, "TotalTax", "totalTax");
  const totalField = getField(fields, "InvoiceTotal", "invoiceTotal");
  const confidences = [
    supplierField?.confidence,
    invoiceIdField?.confidence,
    totalField?.confidence,
  ];

  return {
    supplier: getText(supplierField),
    invoiceId: getText(invoiceIdField),
    date: getText(dateField),
    subtotal: getNumber(subtotalField),
    tax: getNumber(taxField),
    total: getNumber(totalField),
    confidence:
      confidences.every(
        (confidence) =>
          typeof confidence === "number" && Number.isFinite(confidence),
      )
        ? Math.min(...confidences)
        : 0,
  };
}
