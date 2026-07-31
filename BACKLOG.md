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

## Escenarios: grupos de casos de uso para presentación

Hoy la visibilidad de casos de uso en presentación es un toggle individual (`hiddenUseCaseIds: string[]` en `diagramStore.ts`) — para pasar de un "escenario" a otro hay que desmarcar/marcar casos de uso uno a uno, poco fluido con varios casos de uso. Permitir definir grupos con nombre ("Escenario A", "Escenario B"...) y cambiar entre ellos con un clic durante la presentación. Necesitaría:
- Nueva entidad persistida, p.ej. `Scenario { id, name, useCaseIds: string[] }`, en un array `scenarios: Scenario[]` dentro de `DiagramFile` — campo opcional con fallback a `[]` si no está en el JSON (mismo patrón que `showEdgeLabels`/`displayMode`).
- Acción en el store para aplicar un escenario: calcular `hiddenUseCaseIds` como el complementario de `useCaseIds` del escenario elegido (todos los casos de uso que no estén en el grupo pasan a oculto) y reutilizar el mecanismo de filtrado ya existente en `Canvas.tsx` (`visibleEdges`/`visibleNodes`) sin tocarlo.
- UI de gestión (crear/editar/borrar escenario, marcar qué casos de uso incluye) — probablemente en el mismo sitio donde hoy se gestionan los casos de uso.
- UI de cambio rápido durante presentación: un selector o fila de botones con los nombres de los escenarios, visible en el modo presentación (junto a `PresentationLegend`/`UseCaseLegend`), que aplica el escenario elegido de un clic.

Complejidad media-baja: un modelo nuevo con su fallback de compatibilidad + una acción derivada del estado que ya existe (`hiddenUseCaseIds`), sin tocar el motor de filtrado del canvas ni el backend.

## Undo / Redo

Factible, no implementado. Resumen de lo que haría falta:

1. **Mecanismo de historial**: `zundo` (middleware de Zustand, resuelve snapshots y undo()/redo() out of the box) vs. stack manual de snapshots (mismo shape que `toDiagramFile()`).
2. **Granularidad de los pasos** — la decisión de diseño clave. No delegar en capturar cada `set()`: hay que checkpointear solo en commits discretos (`onNodeDragStop`, no `onNodeDrag`; blur de un input, no cada tecla; añadir/borrar nodo o caso de uso; conectar/reconectar arista). Si no, arrastrar una caja generaría cientos de pasos inútiles.
3. **Interacción con autoguardado**: el `undo()` debe pasar por el mismo `set()` que marca `isDirty: true`, para que el resultado también se autoguarde vía `useAutosave`.
4. **Alcance**: historial solo en memoria por pestaña (se pierde al recargar) y por diagrama (se resetea en `openDiagram`/`closeDiagram`) — no persistir en `localStorage`/BD.
5. **UI**: atajos `Ctrl+Z`/`Ctrl+Shift+Z` (listener `keydown` global) + opcionalmente botones en `MenuBar`.

Complejidad media: no es añadir una librería, es tocar la mayoría de mutadores de `src/store/diagramStore.ts` para decidir dónde va cada checkpoint — pero sigue siendo solo frontend, sin cambios de backend/modelo de datos persistido.

## MCP server para crear arquitecturas "textualmente"

Exponer un servidor MCP sobre esta app para que un LLM (Claude, Cursor, etc.) pueda crear/editar diagramas describiéndolos en texto ("crea una caja para el sistema X conectada a Y con el caso de uso Z"), en vez de solo por UI. Necesitaría:
- Un servidor MCP (Node, probablemente en `server/`) que expusiera tools tipo `create_system`, `create_connection`, `set_use_case`, `list_diagram`, operando contra el mismo modelo de datos (`DiagramFile`) vía la API REST ya existente (`/api/diagrams/:id`) o directamente contra la BD.
- Autenticación: el server MCP necesitaría credenciales para actuar en nombre de un usuario — decidir si usa un token de servicio o delega en la sesión del usuario que lo invoca.
- Decisión de diseño: ¿el LLM manipula el `content` JSONB directamente (más simple, más frágil ante cambios de esquema) o pasa por operaciones semánticas de alto nivel (más trabajo, más robusto y más fácil de razonar para el LLM)?
- Relacionado con la edición colaborativa de abajo: si el LLM edita mientras un humano tiene el diagrama abierto en el navegador, aplican los mismos problemas de sincronización en tiempo real.

Complejidad alta: nuevo servicio, nueva superficie de autenticación, y decisiones de diseño de API — pero es aditivo, no rediseña lo que ya existe.

## Edición colaborativa (multi-usuario simultáneo)

Hoy el modelo es un `owner_id` por diagrama, sin concepto de colaboradores ni de edición concurrente — autoguardado vía `PUT` completo del `content` (last-write-wins). Para permitir que varios usuarios editen el mismo esquema haría falta:

1. **Modelo de permisos**: tabla nueva (p.ej. `diagram_collaborators`: `diagram_id`, `user_id`, `role`) en vez del `owner_id` único actual — decidir roles (solo "editor" vs. también "viewer").
2. **Sincronización en tiempo real**: el autoguardado actual (debounce + `PUT` de todo el `content`) no sirve para dos usuarios a la vez — el segundo `PUT` pisaría los cambios del primero. Necesitaría WebSockets (o polling corto) + algún mecanismo de merge (operational transform / CRDT, o al menos un locking optimista con versión incremental para detectar conflictos).
3. **Presencia**: cursores/selecciones de otros usuarios visibles en el `Canvas`, similar a Figma/Google Docs.
4. Impacto grande en arquitectura — no es una extensión incremental del store actual, es un rediseño de la capa de persistencia y del backend en tiempo real.

La más compleja: rediseña el modelo de permisos, la capa de persistencia y añade infraestructura en tiempo real que hoy no existe.
