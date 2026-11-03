import { initializeDatabase } from "./scripts/database.js";

try {
  await initializeDatabase();
  console.log("Esquema SQLite y datos de demostración listos.");
} catch (error) {
  console.error(
    "No se pudo inicializar SQLite:",
    error instanceof Error ? error.message : "Error desconocido",
  );
  process.exitCode = 1;
}
