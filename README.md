# MVP de Azure AI para Distribuidora Río Claro

Proyecto de aprendizaje y demostración para estudiar Azure AI y practicar conceptos relacionados con AI-901. Verifica siempre la guía oficial vigente del examen: sus objetivos pueden cambiar y este proyecto no sustituye el estudio del temario.

## Alcance del MVP

La aplicación resuelve cuatro problemas con una separación intencional entre IA y reglas de negocio:

1. **Nombres de productos distintos:** catálogo maestro, alias normalizados y consulta de inventario por sucursal.
2. **Facturas potencialmente duplicadas:** comparación por proveedor y folio normalizados, además de hash del archivo. Cada factura necesita revisión humana. Solo se puede crear un pago simulado después de aprobarla; no se conecta con bancos ni transfiere dinero.
3. **Atención tardía:** asistente de Microsoft Foundry para conversación general y políticas aprobadas, más un formulario de reclamos que genera folio.
4. **Información dispersa:** vista de empleados de demostración que reúne inventario, alias, reclamos y facturas de prueba.

La vista local de empleados también permite crear productos, asignar existencias por sucursal y avanzar pedidos ficticios por estados controlados. El chat consulta el estado de pedidos solo por identificadores `PED-DEMO-NNN`.

### Componentes

- **Node.js 24, Express 5 y JavaScript vanilla:** Express sirve `public/` y mantiene las integraciones con Azure en el backend.
- **Microsoft Foundry:** responde en español a saludos, preguntas sobre sus funciones y preguntas generales sobre políticas de servicio. No debe navegar por internet ni sustituir a un empleado en decisiones.
- **Azure AI Document Intelligence:** usa el modelo prebuilt de facturas para extraer proveedor, folio, fecha, subtotal, impuestos y total. El empleado debe confirmar los campos.
- **SQLite de referencia:** la base predeterminada es `data/rio-claro-demo.sqlite`. Se crea automáticamente y se excluye de Git. La base preexistente `rio_claro.sqlite` no se usa ni se modifica. En App Service se lee para cargar el catálogo, inventario, alias y pedidos ficticios; las acciones de empleados no escriben cambios operativos en SQLite.
- **Seguimiento de pedidos:** usa un conjunto fijo de pedidos ficticios sin identidad ni datos personales. La herramienta del agente es de solo lectura. En App Service, las transiciones manuales se guardan solo en la sesión temporal del empleado.
- **Voz opcional:** `public/speechAdapter.js` integra dictado y lectura en voz alta con Azure Speech cuando se habilita localmente; si no está configurado, usa las funciones disponibles del navegador. La casilla de consentimiento se reinicia al recargar y la transcripción se puede revisar y editar antes de enviarla.
- **Pruebas automatizadas:** usan su propia base temporal y no necesitan conectar con Azure.

La migración SQLite agrega la normalización única del nombre de producto, la unicidad de inventario por producto/sucursal y las tablas/semillas de pedidos de demostración, sin borrar datos existentes. Si la base ya contiene productos con el mismo nombre normalizado o inventario duplicado por producto/sucursal, revisa esos duplicados antes de inicializar para poder crear los índices únicos.

La captura de facturas acepta únicamente PDF y JPEG/JPG, valida MIME y firma del archivo, limita el tamaño y envía el contenido directamente a Document Intelligence desde el backend. El archivo original no se guarda. Aceptar solo esos formatos no elimina malware ni contenido adversario; procesa únicamente documentos autorizados y revisa los resultados.

## Acceso de empleados en App Service

- El chat, el formulario de reclamos, el panel `/empleado.html` y sus APIs operativas están disponibles sin iniciar sesión. No es necesario configurar un proveedor de identidad para usar las vistas. Si Easy Auth está habilitado en App Service, permite acceso anónimo global para que no redirija las solicitudes al inicio de sesión.
- Cada pestaña del navegador recibe un identificador opaco guardado en `sessionStorage` y compartido entre el chat y el panel en esa pestaña. El backend usa ese identificador para mantener en memoria los cambios temporales: productos nuevos, existencias, alias, reclamos, estados de pedidos, borradores de facturas y pagos simulados. SQLite se consulta solo para el catálogo y los pedidos de referencia; estos cambios operativos no se guardan allí ni se comparten con otras pestañas.
- El acceso es público: cualquier persona que tenga el enlace puede consultar las vistas y crear o modificar datos de demostración en su propia sesión temporal. El identificador de sesión funciona como un token de acceso a esa sesión; no lo compartas. Sin iniciar sesión, la aplicación no puede verificar la identidad del empleado ni garantizar aislamiento entre personas que compartan el mismo navegador o el identificador de sesión.
- Una sesión temporal vence tras 30 minutos sin actividad, al reiniciar el proceso o cuando la instancia que la contiene deja de estar disponible. Abrir otra pestaña inicia otra sesión. Para una experiencia coherente, usa una sola instancia de App Service y mantén ARR Affinity habilitado; el estado no está replicado entre instancias y no es una solución de persistencia o de alta disponibilidad.
- Las solicitudes de escritura de las vistas comprueban que su origen sea la misma aplicación y validan los datos en el servidor. Estas medidas no sustituyen la autenticación; no uses la aplicación pública ni sus datos ficticios para operaciones reales o información sensible.
- Azure Speech continúa bloqueado en App Service. Tampoco se ha implementado Azure AI Search/RAG, almacenamiento administrado, pagos reales ni importación automática de los CSV. No presentes esas funciones como operativas.
- El sistema usa datos ficticios. No procesar facturas reales ni datos personales hasta definir roles, persistencia, retención y seguridad operativa de producción.
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
| `AZURE_SPEECH_ENABLED` | Usa el valor `true` para habilitar Azure Speech solo en local. |
| `AZURE_SPEECH_ENDPOINT` | Endpoint HTTPS de dominio personalizado del recurso Speech, por ejemplo `https://<recurso>.cognitiveservices.azure.com/`. |
| `PORT` | Puerto HTTP; localmente usa `3000` por defecto y App Service proporciona el suyo. |
| `SQLITE_DB_PATH` | Ruta opcional para aislar la base local. Por defecto usa `data/rio-claro-demo.sqlite`. |
| `MAX_UPLOAD_BYTES` | Límite opcional de carga, entre 1 KiB y 10 MiB; por defecto 5 MiB. |

Instala dependencias e inicializa la base en PowerShell:

```powershell
npm install
npm run db:init
```

Para habilitar Azure Speech localmente, configura `AZURE_SPEECH_ENABLED=true` y `AZURE_SPEECH_ENDPOINT` con el dominio personalizado HTTPS del recurso Speech. En Azure Portal, asigna a la identidad usada por `DefaultAzureCredential` el rol **Cognitive Services Speech User** en el recurso. Inicia sesión localmente con Azure CLI (`az login`). No se requiere una clave de Speech: el backend obtiene un token de Microsoft Entra y el navegador lo mantiene solo en memoria. Azure requiere un dominio personalizado para la autenticación de Microsoft Entra; su creación en el recurso no se puede revertir. El SDK se sirve desde la dependencia instalada en el proyecto, sin CDN; su aviso de licencia está disponible en `/vendor/speech-sdk-license.txt`.

La ruta que entrega tokens solo funciona cuando `AZURE_SPEECH_ENABLED=true`, la aplicación se ejecuta localmente fuera de App Service y la solicitud usa `localhost` o una dirección loopback. La autenticación de usuarios del panel no habilita Azure Speech en App Service; la ruta de tokens permanece bloqueada allí.

Para activar la vista local de empleados y el registro de reclamos, inicia el servidor en la misma terminal:

```powershell
$env:ENABLE_EMPLOYEE_DEMO = 'true'
npm run dev
```

Abre `http://localhost:3000` para el chat y `http://localhost:3000/empleado.html` para el panel. La demostración local mantiene las operaciones en SQLite; el comportamiento público con sesiones efímeras descrito arriba aplica a App Service.

En el chat, la opción de voz está desactivada inicialmente. Para probarla, habilítala explícitamente, concede permiso al micrófono al iniciar un dictado y revisa el texto antes de enviarlo. Con Azure Speech, el audio va directamente desde el navegador al servicio y la aplicación no lo almacena. Cuando Azure Speech no esté habilitado, se usarán las funciones de voz disponibles en el navegador; el tratamiento del audio dependerá del proveedor del navegador. La voz no es necesaria para usar el chat.

Comprueba el estado en otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Debe responder con `status: ok`. Para registrar una versión del agente con la herramienta nueva de estado ficticio:

```powershell
npm run create-agent
```

El backend usa Function Calling de Responses API: lee elementos `function_call`, consulta únicamente el estado por identificador ficticio y devuelve `function_call_output` con `call_id` en la misma conversación. El ciclo limita las rondas de herramientas y no expone operaciones de escritura al agente.

Al terminar la demostración, desactiva la opción en la terminal:

```powershell
Remove-Item Env:ENABLE_EMPLOYEE_DEMO
```

## Pedidos ficticios

El panel lista pedidos sembrados como `PED-DEMO-001` a `PED-DEMO-006`. Sus estados permitidos son `PEDIDO_REGISTRADO`, `EN_PREPARACION`, `ENVIADO`, `EN_REPARTO`, `ENTREGA_CONFIRMADA` e `INCIDENCIA`. El flujo avanza en ese orden; desde cada estado previo a la confirmación también se permite registrar `INCIDENCIA`. La confirmación e incidencia son terminales. En local, las APIs de lista y transición requieren que la demostración esté habilitada; en App Service, las transiciones solo afectan la sesión autenticada actual.

El asistente de Foundry solo recibe la herramienta de consulta por identificador ficticio; no puede actualizar pedidos, inventario ni facturas. Si el usuario no aporta un identificador de demostración válido, el asistente no debe solicitar datos personales.

## Flujo de facturas y duplicados

1. Selecciona un PDF o JPG/JPEG de hasta 5 MiB en el panel local.
2. Express valida el tipo y la firma del contenido; el navegador no envía la factura directamente a Azure.
3. Document Intelligence extrae los campos y el backend calcula una confianza mínima.
4. En local, SQLite guarda un borrador de demostración. En App Service, el borrador existe solo en la sesión temporal del empleado. Si falta información o la confianza es baja, el estado requiere revisión.
5. Una coincidencia de proveedor/folio normalizados o del hash del archivo se rechaza como duplicada.
6. El empleado aprueba o rechaza el borrador. Solo las aprobadas admiten un registro de **pago simulado**, con una restricción de un pago por factura.

Los fallos de extracción no generan una factura aprobada. Ninguna acción del modelo autoriza pagos.

## Pruebas

Las pruebas usan SQLite temporal, datos ficticios y no llaman a Azure:

```powershell
npm test
```

Validan migración y alias, alta y duplicados normalizados de productos, inventario por sucursal, transiciones de pedidos, Function Calling con respuestas simuladas, autenticación Entra requerida para las APIs operativas de App Service, aislamiento y expiración de sesiones, ausencia de escrituras operativas en SQLite, configuración segura de Azure Speech, duplicados de factura, aprobación antes de pago, límite idempotente del pago, salud, validación de chat, reclamos locales y validación de carga. Las pruebas no llaman a Azure. Para verificar las integraciones reales con Foundry, Document Intelligence y Speech se requieren recursos, identidad/permisos y configuración local válidos, lo que puede generar cargos.

## Relación con el estudio de Azure AI

- **IA generativa y agentes:** revisar cómo el agente de Foundry recibe instrucciones, conversa con contexto y maneja límites de alcance.
- **Extracción de documentos:** comparar los campos identificados por Document Intelligence con la factura de prueba y estudiar la confianza.
- **IA responsable:** no inventar campos, diferir casos de baja confianza, proteger datos y conservar revisión humana.
- **Aplicación responsable:** mantener decisiones financieras deterministas, validar entradas y proteger secretos con identidad administrada en Azure.

Este capstone es una práctica técnica; no afirma cobertura oficial completa del examen ni certificación de seguridad.
