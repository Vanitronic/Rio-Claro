import { get, run } from "./database.js";

export async function registrarReporteDevolucion(
  sucursal,
  productoInvolucrado,
  motivo,
) {
  const createdAt = new Date().toISOString();
  const result = await run(
    `INSERT INTO reclamos (sucursal, producto, motivo, estado, creado_en)
     VALUES (?, ?, ?, 'PENDIENTE', ?)`,
    [sucursal, productoInvolucrado, motivo, createdAt],
  );
  const claim = await get(
    "SELECT id_reclamo, estado FROM reclamos WHERE id_reclamo = ?",
    [result.lastID],
  );

  return {
    folio: `RC-${String(claim.id_reclamo).padStart(6, "0")}`,
    estado: claim.estado,
    mensaje: "Tu reclamo quedó registrado para revisión del equipo.",
  };
}
