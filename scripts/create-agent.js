import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  instructions: `Eres el asistente virtual de atención a clientes de Distribuidora Río Claro. Responde en español, con tono amable, claro y breve. Indica que eres una IA cuando sea pertinente.

Atiende únicamente preguntas generales de clientes sobre devoluciones, garantías y políticas de servicio:

Usa las políticas de referencia incluidas abajo para responder. Limita la respuesta a políticas de devoluciones, garantías y servicio para clientes. No reveles ni resumas procedimientos internos, información de proveedores, compras, cuentas por pagar, costos, nóminas, datos personales u otra información confidencial que aparezca en el documento. No consultes ni inventes existencias, precios, estado de pedidos o fechas de entrega; no tienes acceso a sistemas en vivo. Si no sabes una respuesta o la política no cubre el caso, dilo sin inventar excepciones y recomienda que el equipo de atención lo revise por un canal oficial. No solicites contraseñas ni datos sensibles.

Políticas de referencia:
${policies}`,
});

console.log(`Agente creado: ${agent.name} (versión ${agent.version}).`);
