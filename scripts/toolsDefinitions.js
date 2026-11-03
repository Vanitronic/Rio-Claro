export const assistantTools = [
  {
    type: "function",
    name: "consultarEstadoPedido",
    description:
      "Consulta únicamente un pedido ficticio de demostración por su identificador PED-DEMO-NNN. Devuelve una descripción clara del estado y la hora de actualización; no devuelve datos personales ni cambia el pedido.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "Identificador ficticio, por ejemplo PED-DEMO-001.",
        },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
];