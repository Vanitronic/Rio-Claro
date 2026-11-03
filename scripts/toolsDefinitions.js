export const assistantTools = [
  {
    type: "function",
    function: {
      name: "consultarInventarioDB",
      description: "Consulta el inventario y existencias de productos en la base de datos de Río Claro.",
      parameters: {
        type: "object",
        properties: {
          nombreProducto: {
            type: "string",
            description: "Nombre o palabra clave del producto a buscar (ej. cloro, desinfectante)."
          },
          sucursal: {
            type: "string",
            description: "Nombre de la sucursal opcional (ej. León, GDL)."
          }
        },
        required: ["nombreProducto"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "registrarReporteDevolucion",
      description: "Registra formalmente una solicitud de devolución de un cliente en el sistema.",
      parameters: {
        type: "object",
        properties: {
          clienteId: {
            type: "integer",
            description: "ID numérico del cliente si se conoce."
          },
          sucursal: {
            type: "string",
            description: "Sucursal donde se adquirió el producto."
          },
          productoInvolucrado: {
            type: "string",
            description: "Nombre del producto que se desea devolver."
          },
          motivo: {
            type: "string",
            description: "Motivo detallado de la devolución."
          }
        },
        required: ["productoInvolucrado", "motivo"]
      }
    }
  }
];