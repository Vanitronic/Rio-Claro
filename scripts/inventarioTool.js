import { all, normalizeText } from "./database.js";

export async function consultarInventarioDB(nombreProducto, sucursal) {
  const search = normalizeText(nombreProducto);
  const normalizedBranch = sucursal ? normalizeText(sucursal) : "";

  if (!search) {
    return [];
  }

  const rows = await all(`
    SELECT
      product.id_producto,
      product.nombre_estandar,
      inventory.sucursal,
      inventory.stock_actual,
      alias.alias_normalizado
    FROM productos_maestros AS product
    LEFT JOIN inventario_sucursales AS inventory
      ON inventory.id_producto = product.id_producto
    LEFT JOIN alias_productos AS alias
      ON alias.id_producto = product.id_producto
  `);

  const matches = new Map();
  for (const row of rows) {
    const name = normalizeText(row.nombre_estandar);
    const alias = row.alias_normalizado ?? "";
    const branchMatches =
      !normalizedBranch ||
      normalizeText(row.sucursal ?? "") === normalizedBranch;

    if (
      branchMatches &&
      (name.includes(search) || alias.includes(search))
    ) {
      const key = `${row.id_producto}:${row.sucursal ?? ""}`;
      matches.set(key, {
        id_producto: row.id_producto,
        producto: row.nombre_estandar,
        sucursal: row.sucursal,
        existencias: row.stock_actual,
      });
    }
  }

  return [...matches.values()];
}
