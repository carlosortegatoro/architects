# Backlog de ideas

Ideas discutidas pero no implementadas (o pendientes de decidir). No es un roadmap comprometido — es para no perder el hilo entre sesiones.

Ordenadas de más fácil a más compleja de desarrollar.

## Auto-align de cajas al seleccionar

Al seleccionar varias cajas (ya soportado vía Shift+drag, ver `Canvas.tsx`), ofrecer alinearlas (por bordes o centros, horizontal/vertical) con un clic — patrón común en Figma/Miro. Necesitaría:
- Leer la selección activa de React Flow (`getNodes().filter(n => n.selected)`).
- Botones de alineación (izquierda/centro/derecha, arriba/medio/abajo) que recalculen `position` de los nodos seleccionados y llamen a `onNodesChange` o a un nuevo action del store.
- UI: podría vivir en una barra flotante contextual que aparece solo cuando hay ≥2 nodos seleccionados.

La más sencilla: cambio contenido en el frontend, sin tocar el modelo de datos persistido ni el backend.

## Formas alternativas para "systems" (logo-only / texto-only)

Ahora mismo `SystemBoxNode` tiene una forma fija hardcoded: logo opcional + texto. Permitir elegir la forma por caja (p.ej. "solo texto", "solo logo", "logo + texto" actual) para poder representar sistemas más compactos. Necesitaría:
- Nuevo campo persistido en los datos del nodo (`SystemNodeData`), tipo `displayMode: 'full' | 'logoOnly' | 'textOnly'`.
- Ajustar `SystemBoxNode.tsx` para renderizar condicionalmente logo/texto según el modo, y redimensionar la caja en consecuencia.
- UI para elegir el modo (probablemente en el panel de propiedades/sidebar del nodo).
- Backward-compat: campo opcional con fallback a `'full'` si no está en el JSON (mismo patrón que `showEdgeLabels`).

Complejidad media-baja: un campo nuevo con su fallback de compatibilidad + ajustes de render, todo en frontend.

## ✅ Escenarios: grupos de casos de uso para presentación — implementado

`Scenario { id, name, useCaseIds }` en `DiagramFile.scenarios`, con acciones `addScenario`/`updateScenario`/`removeScenario`/`applyScenario` en `diagramStore.ts`. `applyScenario` calcula `hiddenUseCaseIds` como el complementario de `useCaseIds`, reutilizando el filtrado existente en `Canvas.tsx` sin tocarlo. Gestión de escenarios junto a los casos de uso; cambio rápido de un clic en `PresentationLegend` durante la presentación.

## ✅ Resaltado de sistemas/conexiones y puntero visible en presentación — implementado

`highlightedNodeIds` efímero en el store (no persistido), con click normal (resalta solo ese elemento) y Ctrl/Cmd+Click (multi-selección) habilitados en modo presentación vía `onNodeClick`/`onEdgeClick` en `Canvas.tsx`. `SystemBoxNode`/`UseCaseEdge` aplican clases `--highlighted`/`--dimmed`. Spotlight cursor (`SpotlightCursor.tsx`) como capa `position: fixed` que sigue el mouse, con toggle en `PresentationControls`.

## ✅ MCP server para crear arquitecturas "textualmente" — implementado (remoto, multi-usuario)

Servidor MCP montado dentro del propio Express (`server/mcp/`, no un servicio/dyno separado), con transporte HTTP (`StreamableHTTPServerTransport` en modo stateless) en vez del `stdio` original — necesario porque `stdio` requiere un proceso local hablando por stdin/stdout con un cliente MCP también local, incompatible con un hosting HTTP-only como Heroku. Mismos 7 tools que antes (`list_diagrams`, `create_diagram`, `get_diagram`, `rename_diagram`, `create_system`, `create_connection`, `set_use_case`), ahora en `server/mcp/server.ts`, operando contra la API REST existente vía read-modify-write igual que antes.

Cada usuario de la app tiene su **propio token MCP**, ya no un único token de servicio compartido:
- El token es un JWT stateless normal (`signToken`/`verifyToken`, mismo mecanismo que ya usa el resto de la app), emitido por `POST /api/auth/mcp-token` (`server/routes/auth.ts`), sin revocación individual.
- Cada request al endpoint `/mcp` pasa por `requireBearerAuth` + un verifier propio (`server/lib/mcpAuth.ts`) que, además de validar la firma del JWT, comprueba en Postgres que el usuario del token sigue existiendo (protege contra tokens de cuentas ya borradas, sin columnas nuevas en `users`).
- Internamente, cada tool opera "como" el usuario del token: `server/mcp/server.ts` firma un JWT efímero de 5 minutos con el `userId`/`email` del Bearer token y lo manda como `Cookie: token=...` en llamadas internas a la API REST (`server/mcp/apiClient.ts`) — reutiliza `requireAuth`/`req.user!.id` tal cual, sin tocar `server/routes/diagrams.ts`.

**Ya resuelto por Carlos como desarrollador/operador** (una sola vez, por terminal, nunca visible para un usuario final de la app):
1. `npm install` en la raíz del repo — trajo `@modelcontextprotocol/sdk@1.30.0`. Confirmado instalado y compilando (`tsc -p server/tsconfig.json --noEmit` limpio).
2. `allowedHosts` fijado con el dominio real de Heroku (`cot-architectures-f99ad2300e12.herokuapp.com`) en `server/mcp/app.ts`, activo solo cuando `NODE_ENV === 'production'` (en desarrollo sigue el default `127.0.0.1`, que ya protege correctamente en local). Sin esto, la protección anti DNS-rebinding de `createMcpExpressApp()` solo acepta `localhost`/`127.0.0.1` como `Host` y habría rechazado con 403 toda request MCP real en producción, aunque el Bearer token fuera válido.

**Limpieza de seguridad tras la migración (completada):**
- Eliminado el paquete standalone `mcp-server/` (versión anterior, con token único y `stdio`) — nunca estuvo trackeado en git (confirmado vía `git status`), sin ningún token real committeado (su `.env.example` solo tenía placeholders).
- Eliminado `server/scripts/issue-service-token.ts` (emitía un JWT de 10 años para un único usuario/servicio, mecanismo que un token robado no podía revocarse) y su entrada `"issue-service-token"` en `package.json` — sustituido por el flujo de tokens por usuario vía `POST /api/auth/mcp-token`.

**Lo que hace un usuario final de la app** (solo clics en el navegador, cero terminal/config):
1. Abre el menú de cuenta (icono de usuario en la barra superior) y pulsa "Generate MCP token".
2. Copia el token que aparece en el diálogo (no se vuelve a mostrar).
3. Lo pega como `Authorization: Bearer <token>` en la configuración de su propio cliente MCP (Claude Desktop, Cursor, etc.), apuntando a `https://<dominio-de-la-app>/mcp`.

## Exportar/importar desde Lucidchart

Estudiar si es viable interoperar con Lucidchart: exportar un diagrama de esta app a un formato que Lucidchart pueda abrir, y/o importar un diagrama de Lucidchart hacia el modelo de datos propio (`DiagramFile`). Necesitaría primero investigar, antes de diseñar nada:
- Qué formato de intercambio ofrece Lucidchart realmente — su API pública (documentos vía [Lucidchart Developer API](https://developer.lucid.co/)) frente a exportar/importar `.lucid`/CSV/Visio (`.vsdx`), que es un formato propietario no siempre bien documentado.
- Si el mapeo de conceptos es razonable: cajas de sistema → shapes, conexiones con casos de uso (color + animación + posible multi-etiqueta por edge) → líneas de Lucidchart, que no tiene el concepto de "caso de uso" ni de agrupación de conexiones por color — probablemente se perdería información en la ida y vuelta (lossy), no es un mapeo 1:1.
- Si merece más la pena partir de un formato intermedio ya estándar (p.ej. Visio `.vsdx`, que Lucidchart sí importa/exporta) en vez de atacar su API o formato nativo directamente.
- Autenticación si se usa la API oficial (OAuth por cuenta de Lucidchart del usuario).

Complejidad media-alta: antes de cualquier código hay que validar si el mapeo de modelo de datos es viable sin pérdida excesiva de información — puede acabar siendo solo exportación unidireccional (esta app → Lucidchart) si la importación resulta poco fiable.

## Edición colaborativa (multi-usuario simultáneo)

Hoy el modelo es un `owner_id` por diagrama, sin concepto de colaboradores ni de edición concurrente — autoguardado vía `PUT` completo del `content` (last-write-wins). Para permitir que varios usuarios editen el mismo esquema haría falta:

1. **Modelo de permisos**: tabla nueva (p.ej. `diagram_collaborators`: `diagram_id`, `user_id`, `role`) en vez del `owner_id` único actual — decidir roles (solo "editor" vs. también "viewer").
2. **Sincronización en tiempo real**: el autoguardado actual (debounce + `PUT` de todo el `content`) no sirve para dos usuarios a la vez — el segundo `PUT` pisaría los cambios del primero. Necesitaría WebSockets (o polling corto) + algún mecanismo de merge (operational transform / CRDT, o al menos un locking optimista con versión incremental para detectar conflictos).
3. **Presencia**: cursores/selecciones de otros usuarios visibles en el `Canvas`, similar a Figma/Google Docs.
4. Impacto grande en arquitectura — no es una extensión incremental del store actual, es un rediseño de la capa de persistencia y del backend en tiempo real.

La más compleja: rediseña el modelo de permisos, la capa de persistencia y añade infraestructura en tiempo real que hoy no existe.
