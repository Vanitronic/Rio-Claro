# POLÍTICAS Y LINEAMIENTOS OPERATIVOS INTERNOS
**Distribuidora Río Claro**  
**Documento Oficial de Referencia Única** 
Versión: 1.0  
Fecha de vigencia: Enero 2026  
Última actualización: Octubre 2026  
Propietario del documento: Dirección General

---

## 1. Política de Devoluciones y Garantías para Clientes
- **Plazo límite general:** Los clientes (hoteles, restaurantes, escuelas y tiendas) cuentan con un plazo máximo de **5 días hábiles** a partir de la fecha de entrega para reportar productos defectuosos, incompletos o erróneos (salvo en casos de daño por transporte).
- **Condiciones generales del producto:** Para aplicar un cambio o devolución regular, el producto de limpieza o higiene debe conservar al menos el 80% de su contenido original y su envase sin alteraciones graves.
- **Caso especial: Producto dañado durante el envío:**
  - **Plazo de reporte:** Si el producto sufrió daños durante el transporte, el cliente cuenta con un plazo estricto de **1 día hábil (24 horas)** tras la entrega para realizar el reporte y adjuntar evidencias fotográficas.
  - **Plazo de devolución:** Una vez realizado el reporte en tiempo, el cliente dispone de los mismos **5 días hábiles** para efectuar la devolución física del producto.
  - **Excepción de condiciones:** Para este caso específico, **no aplican** la restricción del 80% de contenido ni la exigencia del envase en buen estado.
  - **Costos de transporte:** Río Claro asume al 100% los gastos de recolección y envío.
- **Costos de envío por devolución:** Los gastos y logística de envío asociados a procesos de devolución regular correrán por cuenta del cliente. La empresa asumirá la recolección y flete sin costo únicamente en casos de **surtido equivocado/error de envío por parte de Río Claro** o **productos dañados en el transporte** (reportados dentro de las 24 horas).
- **Procedimiento:** Toda solicitud de devolución debe registrarse en el sistema unificado indicando el número de factura original. Queda prohibido aceptar devoluciones verbales o por canales no registrados.

---

## 2. Lineamientos de Pedidos y Tiempos de Respuesta (SLA)
- **Atención a clientes:** Cualquier consulta de stock, cotización o estado de pedido realizada por un cliente debe ser atendida y resuelta en un tiempo máximo de **15 minutos**.
- **Entregas locales:** Los pedidos confirmados antes de las 13:00 horas se entregan en un plazo máximo de **24 horas hábiles** en la misma zona metropolitana de la sucursal. Pedidos posteriores a las 13:00 horas se entregan en **48 horas hábiles**.
- **Disponibilidad entre Sucursales:** Si una sucursal (ej. León) no cuenta con existencias de un producto, el vendedor está autorizado a consultar el stock en las demás sucursales (Guadalajara, Zapopan, Querétaro, Aguascalientes) a través del Catálogo Maestro y coordinar un traslado interno o redireccionar el pedido. Ningún cliente debe recibir un "no sé, le devuelvo la llamada" sin un registro previo del caso.

---

## 3. Políticas de Inventario y Reabastecimiento
- **Estatus de Stock y Puntos de Reorden:**
  - **Normal:** El nivel de existencias se encuentra por encima del `stock_minimo`. Operación regular.
  - **Bajo (Alerta de Reorden):** Las existencias son menores o iguales al `stock_minimo`. El sistema genera automáticamente una sugerencia de compra.
  - **Crítico (Prioridad Alta):** Las existencias son menores o iguales al 50% del `stock_minimo`. Requiere orden de compra urgente o traslado prioritario entre sucursales.
- **Regla de integridad de stock:** El campo `stock_maximo` no puede ser inferior al `stock_minimo` bajo ninguna circunstancia. Cualquier registro anómalo debe ser corregido por el Jefe de Bodega antes de generar una orden.
- **Auditoría física de inventario:** Cada sucursal debe realizar un inventario físico mensual. Las discrepancias mayores al 2% deben justificarse ante la Dirección General.

---

## 4. Flujo de Aprobación de Compras y Niveles de Autorización
- **Flujo de Proceso:** 
  1. Generación de solicitud de compra basada en alerta de stock bajo/crítico.
  2. Verificación de cotización con proveedores en estatus **Activo**.
  3. Aprobación según matriz de montos.
  4. Emisión de Orden de Compra (OC) oficial.
- **Matriz de Autorización por Monto (en MXN):**
  - **Hasta $15,000 MXN:** Aprobación directa por Comprador de Sucursal o Jefe de Bodega.
  - **De $15,001 a $50,000 MXN:** Requiere autorización del Gerente de Sucursal.
  - **Mayores a $50,000 MXN:** Requiere aprobación final del Director General.

---

## 5. Gestión de Proveedores y Evaluación de Servicio
- **Estatus de Proveedores:**
  - **Activo:** Proveedor autorizado para emitir órdenes de compra y pagos regulares.
  - **En Evaluación:** Proveedor nuevo o en revisión de calidad. Se permiten compras bajo supervisión y con volumen limitado.
  - **Suspendido:** Proveedor inhabilitado por incumplimiento de entregas, precios o calidad. Se bloquea la creación de órdenes de compra y el sistema emite alerta en Cuentas por Pagar.
- **Evaluación de Desempeño:** Los proveedores se evalúan de 1.0 a 5.0 con base en cumplimiento de tiempos de entrega, calidad de producto y precisión en facturación. Proveedores con calificación menor a 3.0 entran a revisión y menores a 2.5 pasan a estatus **Suspendido**.
- **Falta de datos obligatorios:** No se procesarán órdenes de compra a proveedores que no cuenten con correo electrónico corporativo o constancia de situación fiscal registrada.

---

## 6. Directrices de Cuentas por Pagar y Recepción de Facturas
- **Canal oficial de recepción:** Todas las facturas de proveedores deben ser enviadas exclusivamente al correo corporativo centralizado para su procesamiento automatizado (se prohíbe el envío a correos personales de compradores).
- **Prevención de Pagos Duplicados:** Ninguna factura podrá ser ingresada a pago sin antes validar el número de folio en el sistema para confirmar que no existe un registro previo con el mismo número o proveedor.
- **Mecanismo de Revisión Humana (Human-in-the-Loop):** Las facturas procesadas mediante inteligencia artificial que presenten un puntaje de confianza (*confidence score*) menor al 85% o datos ilegibles en la imagen/PDF, serán retenidas automáticamente y desviadas a la bandeja de revisión manual del responsable de Cuentas por Pagar antes de autorizar cualquier dispersión de fondos.

---

## 7. Manejo de Incidencias y Reclamaciones
- **Tipos de Incidencias:**
  - **Faltante de surtido / Error de empaque:** Reporte en máximo 5 días hábiles. Se genera orden de reposición prioritaria en 24 horas.
  - **Producto dañado en tránsito:** Reporte estricto en 1 día hábil (24 horas). Reemplazo inmediato sin costo para el cliente.
  - **Error en facturación o cobro:** Tramitación a Cuentas por Cobrar/Pagar con resolución en máximo 48 horas hábiles.
- **Escalamiento:** Si una incidencia no se resuelve en 24 horas, escala automáticamente al Gerente de Sucursal; si supera las 48 horas, se notifica a Dirección General.

---

## 8. Horarios de Cobertura y Atención en Sucursales
- **Sucursales (Guadalajara, Zapopan, León, Querétaro, Aguascalientes):**
  - **Lunes a Viernes:** 08:00 hrs a 18:00 hrs (Horario corrido).
  - **Sábados:** 08:30 hrs a 14:00 hrs.
  - **Domingos y Días Festivos Oficiales:** Cerrado.
- **Soporte de Bodega y Embarques:** Recepción de proveedores de 08:00 hrs a 16:00 hrs de lunes a viernes.
- **Asistente Virtual (IA):** Disponible 24/7 para consultas de información general, políticas e inventario unificado.

---

## 9. Seguridad de la Información y Control de Accesos
- **Prohibición de Credenciales Compartidas:** Queda estrictamente prohibido compartir contraseñas o cuentas de acceso. Cada empleado (ventas, bodega, finanzas y soporte) debe autenticarse individualmente mediante su propia identidad corporativa (Microsoft Entra ID).
- **Confidencialidad de Datos Sensibles:** Los reportes financieros globales, sueldos, nóminas y datos personales de clientes y empleados están clasificados como **información confidencial restrictiva**. Ningún empleado sin rol gerencial autorizado podrá acceder a estos datos, y los agentes de IA tienen la instrucción estricta de bloquear cualquier consulta relacionada con salarios o nóminas para clientes y empleados sin rol gerencial.

## 10. Informacion de Contacto
- WhatsApp: +52 33 5555 1234
- Telefono: 01-800 RIO CLARO
- Correo: serviciocliete@rio.claro.mx