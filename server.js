import express from "express";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { join } from "node:path";

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.trim();
const agentName = process.env.FOUNDRY_AGENT_NAME?.trim();

if (!projectEndpoint || !agentName) {
  throw new Error(
    "FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME must be configured.",
  );
}

const projectClient = new AIProjectClient(
  projectEndpoint,
  new DefaultAzureCredential(),
);
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

app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
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

    const result = await openai.responses.create(
      { conversation: conversationId, input: message },
      agentRef,
    );

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

app.use((error, _request, response, _next) => {
  if (error.type === "entity.parse.failed") {
    return response
      .status(400)
      .json({ error: "El JSON de la solicitud no es válido." });
  }

  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "La solicitud es demasiado grande." });
  }

  console.error(
    "Unhandled server error:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return response.status(500).json({ error: "Ocurrió un error interno." });
});

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Chatbot server listening on port ${port}.`);
});
