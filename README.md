# MVP de Azure AI para Distribuidora Río Claro

Proyecto de aprendizaje y demostración para estudiar Azure AI y practicar conceptos relacionados con AI-901. Verifica siempre la guía oficial vigente del examen: sus objetivos pueden cambiar y este proyecto no sustituye el estudio del temario.

## Alcance del MVP

La aplicación resuelve cuatro problemas con una separación intencional entre IA y reglas de negocio:

1. **Nombres de productos distintos:** catálogo maestro, alias normalizados y consulta de inventario por sucursal.
2. **Facturas potencialmente duplicadas:** comparación por proveedor y folio normalizados, además de hash del archivo. Cada factura necesita revisión humana. Solo se puede crear un pago simulado después de aprobarla; no se conecta con bancos ni transfiere dinero.
3. **Atención tardía:** asistente de Microsoft Foundry para conversación general y políticas aprobadas, más un formulario de reclamos que genera folio.
4. **Información dispersa:** vista de empleados de demostración que reúne inventario, alias, reclamos y facturas de prueba.

### Componentes

- **Node.js 24, Express 5 y JavaScript vanilla:** Express sirve `public/` y mantiene las integraciones con Azure en el backend.
- **Microsoft Foundry:** responde en español a saludos, preguntas sobre sus funciones y preguntas generales sobre políticas de servicio. No debe navegar por internet ni sustituir a un empleado en decisiones.
- **Azure AI Document Intelligence:** usa el modelo prebuilt de facturas para extraer proveedor, folio, fecha, subtotal, impuestos y total. El empleado debe confirmar los campos.
- **SQLite local:** la base predeterminada es `data/rio-claro-demo.sqlite`. Se crea automáticamente y se excluye de Git. La base preexistente `rio_claro.sqlite` no se usa ni se modifica.
- **Pruebas automatizadas:** usan su propia base temporal y no necesitan conectar con Azure.

La captura de facturas acepta únicamente PDF y JPEG/JPG, valida MIME y firma del archivo, limita el tamaño y envía el contenido directamente a Document Intelligence desde el backend. El archivo original no se guarda. Aceptar solo esos formatos no elimina malware ni contenido adversario; procesa únicamente documentos autorizados y revisa los resultados.

## Lo que todavía no es producción

- La base es local y no se comparte entre instancias de App Service. No es almacenamiento duradero para una operación real ni una base común para sucursales.
- La vista de empleados muestra datos ficticios en App Service para presentar el prototipo. Las APIs de inventario, alias, reclamos y facturas están habilitadas **solo para una demostración local explícita**. No incluyen autenticación ni control real de roles y el servidor las bloquea en App Service.
- No se ha implementado Azure AI Search/RAG, Speech, Microsoft Entra ID, persistencia administrada, pago real ni importación automática de los CSV. No presentes esas funciones como operativas.
- El sistema no debe procesar facturas reales ni datos personales hasta definir autenticación, permisos, persistencia, retención y seguridad operativa.
- El objetivo de USD 50 es una meta, no una garantía. Document Intelligence, Foundry, App Service y otros recursos pueden generar cargos según la región, el SKU y el uso. Revisa precios y presupuesto en tu suscripción y elimina o detén recursos de prueba cuando termines.

## Configuración local

Requisitos: Node.js 24 LTS, npm, una suscripción con un proyecto de Foundry y autenticación local con `DefaultAzureCredential` (por ejemplo, sesión iniciada con Azure CLI). No compartas el contenido de `.env`.

Configura localmente estas variables, sin subirlas al repositorio:

| Variable | Propósito |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Endpoint del proyecto de Foundry. |
| `FOUNDRY_AGENT_NAME` | Nombre del agente de atención. |
| `FOUNDRY_MODEL_DEPLOYMENT` | Deployment usado por `npm run create-agent`. |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Endpoint de Document Intelligence; requerido para analizar facturas. |
| `PORT` | Puerto HTTP; localmente usa `3000` por defecto y App Service proporciona el suyo. |
| `SQLITE_DB_PATH` | Ruta opcional para aislar la base local. Por defecto usa `data/rio-claro-demo.sqlite`. |
| `MAX_UPLOAD_BYTES` | Límite opcional de carga, entre 1 KiB y 10 MiB; por defecto 5 MiB. |

Instala dependencias e inicializa la base en PowerShell:

```powershell
npm install
npm run db:init
```

Para activar la vista local de empleados y el registro de reclamos, inicia el servidor en la misma terminal:

```powershell
$env:ENABLE_EMPLOYEE_DEMO = 'true'
npm run dev
```

Abre `http://localhost:3000` para el chat y `http://localhost:3000/empleado.html` para el panel. En App Service se muestra solo la versión estática con datos claramente ficticios; no permite consultar ni cambiar datos porque las APIs de empleados quedan bloqueadas.

Comprueba el estado en otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Debe responder con `status: ok`. Para crear o actualizar el agente de Foundry:

```powershell
npm run create-agent
```

Al terminar la demostración, desactiva la opción en la terminal:

```powershell
Remove-Item Env:ENABLE_EMPLOYEE_DEMO
```

## Flujo de facturas y duplicados

1. Selecciona un PDF o JPG/JPEG de hasta 5 MiB en el panel local.
2. Express valida el tipo y la firma del contenido; el navegador no envía la factura directamente a Azure.
3. Document Intelligence extrae los campos y el backend calcula una confianza mínima.
4. SQLite guarda un borrador de demostración. Si falta información o la confianza es baja, el estado requiere revisión.
5. Una coincidencia de proveedor/folio normalizados o del hash del archivo se rechaza como duplicada.
6. El empleado aprueba o rechaza el borrador. Solo las aprobadas admiten un registro de **pago simulado**, con una restricción de un pago por factura.

Los fallos de extracción no generan una factura aprobada. Ninguna acción del modelo autoriza pagos.

## Pruebas

Las pruebas usan SQLite temporal, datos ficticios y no llaman a Azure:

```powershell
npm test
```

Validan esquema y alias, duplicados de factura, aprobación antes de pago, límite idempotente del pago, salud, validación de chat, reclamos locales y validación de carga. Para verificar integración real con Foundry y Document Intelligence se requieren recursos, identidad/permisos y configuración local válidos, lo que puede generar cargos.

## Relación con el estudio de Azure AI

- **IA generativa y agentes:** revisar cómo el agente de Foundry recibe instrucciones, conversa con contexto y maneja límites de alcance.
- **Extracción de documentos:** comparar los campos identificados por Document Intelligence con la factura de prueba y estudiar la confianza.
- **IA responsable:** no inventar campos, diferir casos de baja confianza, proteger datos y conservar revisión humana.
- **Aplicación responsable:** mantener decisiones financieras deterministas, validar entradas y proteger secretos con identidad administrada en Azure.

Este capstone es una práctica técnica; no afirma cobertura oficial completa del examen ni certificación de seguridad.
