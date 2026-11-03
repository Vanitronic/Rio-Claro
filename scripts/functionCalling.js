const MAX_TOOL_ROUNDS = 3;

function parseArguments(argumentsJson) {
  const parsed = JSON.parse(argumentsJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Los argumentos de la herramienta no son válidos.");
  }
  return parsed;
}

export async function createAssistantResponse({
  openai,
  conversationId,
  message,
  agentRef,
  executeTool,
}) {
  let response = await openai.responses.create(
    { conversation: conversationId, input: message },
    agentRef,
  );
  let toolRounds = 0;

  while (Array.isArray(response.output)) {
    const calls = response.output.filter(
      (item) => item?.type === "function_call",
    );
    if (calls.length === 0) {
      return response;
    }
    if (toolRounds >= MAX_TOOL_ROUNDS) {
      throw new Error("Se alcanzó el límite de llamadas a herramientas.");
    }

    const outputs = await Promise.all(
      calls.map(async (call) => {
        if (typeof call.call_id !== "string" || !call.call_id) {
          throw new Error("La llamada de herramienta no tiene call_id.");
        }

        let output;
        try {
          const args = parseArguments(call.arguments);
          output = await executeTool(call.name, args);
        } catch {
          output = { error: "No fue posible procesar la consulta ficticia." };
        }

        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        };
      }),
    );

    response = await openai.responses.create(
      { conversation: conversationId, input: outputs },
      agentRef,
    );
    toolRounds += 1;
  }

  return response;
}
