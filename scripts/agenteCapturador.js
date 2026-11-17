import { createHash } from "node:crypto";
import { extraerFactura } from "./documentIntelligence.js";
import { findInvoiceByHash, saveInvoiceDraft } from "./demoService.js";

export async function procesarFacturaInteligente(fileBuffer) {
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
  const existing = await findInvoiceByHash(fileHash);
  if (existing) {
    return { duplicate: true, invoice: existing };
  }

  const invoice = await extraerFactura(fileBuffer);
  return saveInvoiceDraft(invoice, fileHash);
}
