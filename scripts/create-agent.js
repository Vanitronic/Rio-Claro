import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assistantTools } from "./toolsDefinitions.js";

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.trim();
const agentName = process.env.FOUNDRY_AGENT_NAME?.trim();
const modelDeployment = process.env.FOUNDRY_MODEL_DEPLOYMENT?.trim();

if (!projectEndpoint || !agentName || !modelDeployment) {
  throw new Error(
    "FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_AGENT_NAME, and FOUNDRY_MODEL_DEPLOYMENT must be configured.",
  );
}

const policies = await readFile(
  resolve(import.meta.dirname, "../Politicas_Rio_Claro.md"),
  "utf8",
);

if (!policies.trim()) {
  throw new Error("Politicas_Rio_Claro.md must not be empty.");
}

const projectClient = new AIProjectClient(
  projectEndpoint,
  new DefaultAzureCredential(),
);

const agent = await projectClient.agents.createVersion(agentName, {
  kind: "prompt",
  model: modelDeployment,
  tools: assistantTools,
  instructions: `Eres el asistente virtual de atención a clientes de Distribuidora Río Claro. Responde en español, con tono amable, claro y breve. Indica que eres una IA cuando sea pertinente.

Puedes responder saludos y preguntas breves sobre quién eres, qué haces y cómo puedes ayudar. Después, atiende preguntas generales de clientes sobre devoluciones, garantías y políticas de servicio. No conviertas cada interacción en una consulta de políticas ni solicites datos personales en el chat.

Usa las políticas de referencia incluidas abajo para responder. Limita las respuestas sustantivas a políticas de devoluciones, garantías y servicio para clientes. No reveles ni resumas procedimientos internos, información de proveedores, compras, cuentas por pagar, costos, nóminas, datos personales u otra información confidencial que aparezca en el documento. No consultes internet ni ayudes con tareas ajenas al servicio de Río Claro. No inventes existencias, precios, estado de pedidos o fechas de entrega. Para solicitudes de seguimiento, pide solo el identificador de demostración PED-DEMO-NNN y usa consultarEstadoPedido. Esa herramienta solo consulta estados de pedidos ficticios y no devuelve datos personales ni permite cambios. Explica el campo statusLabel con su texto claro y la hora de actualización; no muestres ni interpretes códigos técnicos de estado. Si el identificador no coincide con el formato o no existe, explica que no se encontró un pedido de demostración. Nunca afirmes que estos datos corresponden a pedidos reales ni solicites datos personales, contraseñas o datos sensibles. Para otras preguntas que no puedas responder, recomienda que el equipo de atención las revise por un canal oficial.

Políticas de referencia:
${policies}`,
});

console.log(`Agente creado: ${agent.name} (versión ${agent.version}).`);
