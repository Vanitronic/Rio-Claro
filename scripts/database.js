import sqlite3 from "sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const dbPath = process.env.SQLITE_DB_PATH?.trim()
  ? resolve(process.env.SQLITE_DB_PATH.trim())
  : join(import.meta.dirname, "..", "data", "rio-claro-demo.sqlite");

mkdirSync(dirname(dbPath), { recursive: true });
export const db = new sqlite3.Database(dbPath);

db.configure("busyTimeout", 5000);

export function run(sql, params = []) {
  return new Promise((resolvePromise, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolvePromise, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolvePromise, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise(rows);
    });
  });
}

export function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function addColumnIfMissing(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function initializeDatabase() {
  await run("PRAGMA foreign_keys = ON");

  await run(`CREATE TABLE IF NOT EXISTS productos_maestros (
    id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_estandar TEXT NOT NULL,
    categoria TEXT,
    precio_base REAL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventario_sucursales (
    id_inventario INTEGER PRIMARY KEY AUTOINCREMENT,
    id_producto INTEGER,
    sucursal TEXT NOT NULL,
    stock_actual INTEGER,
    FOREIGN KEY (id_producto) REFERENCES productos_maestros(id_producto)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS facturas_procesadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio_factura TEXT,
    proveedor_nombre TEXT,
    total REAL,
    estado TEXT,
    origen TEXT
  )`);

  await addColumnIfMissing("facturas_procesadas", "fecha_factura", "TEXT");
  await addColumnIfMissing("facturas_procesadas", "subtotal", "REAL");
  await addColumnIfMissing("facturas_procesadas", "iva", "REAL");
  await addColumnIfMissing("facturas_procesadas", "confianza", "REAL");
  await addColumnIfMissing("facturas_procesadas", "proveedor_normalizado", "TEXT");
  await addColumnIfMissing("facturas_procesadas", "folio_normalizado", "TEXT");
  await addColumnIfMissing("facturas_procesadas", "hash_archivo", "TEXT");
  await addColumnIfMissing("facturas_procesadas", "creada_en", "TEXT");

  await run(`CREATE TABLE IF NOT EXISTS alias_productos (
    id_alias INTEGER PRIMARY KEY AUTOINCREMENT,
    id_producto INTEGER NOT NULL,
    alias TEXT NOT NULL,
    alias_normalizado TEXT NOT NULL UNIQUE,
    sucursal TEXT,
    FOREIGN KEY (id_producto) REFERENCES productos_maestros(id_producto)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS reclamos (
    id_reclamo INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal TEXT NOT NULL,
    producto TEXT NOT NULL,
    motivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    creado_en TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pagos_demo (
    id_pago INTEGER PRIMARY KEY AUTOINCREMENT,
    id_factura INTEGER NOT NULL UNIQUE,
    referencia TEXT NOT NULL UNIQUE,
    monto REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'SIMULADO',
    creado_en TEXT NOT NULL,
    FOREIGN KEY (id_factura) REFERENCES facturas_procesadas(id)
  )`);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_factura_proveedor_folio
    ON facturas_procesadas(proveedor_normalizado, folio_normalizado)
    WHERE proveedor_normalizado IS NOT NULL AND folio_normalizado IS NOT NULL`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_factura_hash_archivo
    ON facturas_procesadas(hash_archivo) WHERE hash_archivo IS NOT NULL`);

  await run(`INSERT OR IGNORE INTO productos_maestros
    (id_producto, nombre_estandar, categoria, precio_base)
    VALUES (1, 'Cloro 1 Litro', 'Limpieza e Higiene', 18.50),
           (2, 'Pinol Limpiador 800ml', 'Limpieza e Higiene', 25.00)`);

  const stockExamples = [
    [1, "León", 45],
    [1, "Guadalajara", 12],
    [2, "León", 30],
    [2, "Querétaro", 8],
  ];

  for (const [productId, branch, stock] of stockExamples) {
    const existing = await get(
      "SELECT id_inventario FROM inventario_sucursales WHERE id_producto = ? AND sucursal = ?",
      [productId, branch],
    );
    if (!existing) {
      await run(
        "INSERT INTO inventario_sucursales (id_producto, sucursal, stock_actual) VALUES (?, ?, ?)",
        [productId, branch, stock],
      );
    }
  }

  const aliases = [
    [1, "CLORO LITRO", null],
    [1, "Cloro 1L", null],
    [1, "Blanqueador 1000ml", null],
    [2, "PINOL 800", null],
    [2, "Limpiador Pino 800ml", null],
  ];

  for (const [productId, alias, branch] of aliases) {
    await run(
      `INSERT OR IGNORE INTO alias_productos
        (id_producto, alias, alias_normalizado, sucursal)
       VALUES (?, ?, ?, ?)`,
      [productId, alias, normalizeText(alias), branch],
    );
  }
}
