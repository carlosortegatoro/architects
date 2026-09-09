# Backlog de ideas

Ideas discutidas pero no implementadas (o pendientes de decidir). No es un roadmap comprometido — es para no perder el hilo entre sesiones.

Ordenadas de más fácil a más compleja de desarrollar.

## ✅ Auto-align de cajas al seleccionar — implementado

`AlignmentToolbar.tsx`: barra flotante contextual que aparece solo con ≥2 nodos seleccionados, con botones de alineación (izquierda/centro/derecha, arriba/medio/abajo) que llaman a `alignNodes` en `diagramStore.ts`. Con ≥3 nodos seleccionados aparecen además los botones de distribución (horizontal/vertical/grid) vía `distributeNodes`.

## ✅ Formas alternativas para "systems" (logo-only / texto-only) — implementado

`SystemNodeData.displayMode?: 'full' | 'logoOnly' | 'textOnly'` en `types.ts`, con fallback a `'full'` cuando no está presente (mismo patrón que `showEdgeLabels`). `SystemBoxNode.tsx` renderiza condicionalmente logo/texto según `data.displayMode`.

## ✅ Cambiar la forma de una caja existente — implementado y validado localmente

Selector compartido mediante clic derecho sobre una caja o el botón `Change shape` al seleccionar un solo nodo. Permite convertir entre caja completa, solo logo, solo texto, caja informativa y anotación; los grupos quedan excluidos como origen y destino.

Conserva identificador, posición, pertenencia a grupos, textos, logo, color, puntos de conexión y conexiones. Los campos no visibles en la nueva forma se mantienen también al exportar/importar JSON. Cada destino usa su tamaño inicial; si requiere espacio, se amplían los grupos ancestros. Cada conversión es un paso independiente de deshacer/rehacer, que restaura los datos, las dimensiones personalizadas y los tamaños de los grupos afectados. Un redimensionado posterior tiene su propio paso de historial.

El menú indica la forma actual, acepta teclado (flechas, Enter/Espacio y Escape) y se cierra al pulsar fuera. No se ofrece en presentación o vistas compartidas y respeta el menú nativo al editar texto. Abrir el selector o elegir la forma actual no crea una edición.

Validación visual local confirmada por Carlos y commit/push autorizados. El despliegue a producción es una operación aparte y requiere su aprobación.

## ✅ Escenarios: grupos de casos de uso para presentación — implementado

`Scenario { id, name, useCaseIds }` en `DiagramFile.scenarios`, con acciones `addScenario`/`updateScenario`/`removeScenario`/`applyScenario` en `diagramStore.ts`. `applyScenario` calcula `hiddenUseCaseIds` como el complementario de `useCaseIds`, reutilizando el filtrado existente en `Canvas.tsx` sin tocarlo. Gestión de escenarios junto a los casos de uso; cambio rápido de un clic en `PresentationLegend` durante la presentación.

## Atajos de teclado para cambiar escenarios en presentación

Permitir cambiar de escenario sin usar el ratón mientras el diagrama está en modo presentación:

- Teclas `1`–`9` para activar directamente el escenario correspondiente según su orden en la leyenda.
- Flechas `←`/`→` para activar el escenario anterior o siguiente.
- Mostrar el número de acceso rápido junto al nombre de cada escenario en `PresentationLegend`.
- Guardar qué escenario está activo para poder navegar de forma cíclica con las flechas y reflejar visualmente la selección actual.
- Mantener `Escape` reservado para salir del modo presentación e ignorar shortcuts cuando el foco esté en un campo editable.

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

## ✅ Conexiones fluidas (floating edges, centroide a centroide) — implementado

Antes, toda conexión sin handle fijado manualmente salía siempre por `top` (primer handle registrado en `nodeHandles.tsx`), lo cual era especialmente visible en diagramas creados por MCP (`create_connection` nunca fija handle). Se descartó la primera versión (auto-lado dinámico siempre activo, ancla en el lado más cercano con clamp) por feedback directo: no debía ser automático, y la geometría de "lado más cercano" se veía poco natural.

Solución final: toggle `floatingEdges` a nivel de diagrama (persistido en `DiagramFile`, off por defecto), en el mismo botón de la toolbar junto a los demás toggles (`SplineOnIcon`/`SplineOffIcon`). Cuando está activo, `UseCaseEdge.tsx` calcula en cada render el punto donde la línea recta centroide-a-centroide entre ambas cajas cruza el borde de cada una (intersección rayo-rectángulo, no "lado más cercano con clamp"), solo para edges sin `sourceHandle`/`targetHandle` fijado a mano — las conexiones arrastradas manualmente a un handle concreto nunca se ven afectadas.

## ✅ Hitbox de handles/resize ampliado — implementado

Los puntos de conexión (`.react-flow__handle`, 6×6px) y las manijas de resize (`.react-flow__resize-control.handle`, 5×5px) eran 100% default de `@xyflow/react`, sin ningún override previo — obligaban a apuntar con extrema precisión. Solución CSS-only en `src/styles.css`: pseudo-elemento `::after` con `inset` negativo sobre ambas clases, que amplía el área clicable invisible sin cambiar el tamaño visual del punto en reposo. No se tocó ningún componente React.

## ✅ Auto-resize de grupos (fit-to-children) — implementado

Los grupos se creaban con tamaño fijo (`GROUP_WIDTH=400`/`GROUP_HEIGHT=300`) y nunca se recalculaban al añadir sistemas dentro — con 3+ sistemas el grupo quedaba demasiado pequeño para contenerlos visualmente, típicamente al crear vía MCP. Función pura `fitGroupToChildren` (bounding box de los hijos + padding fijo, con mínimo `GROUP_MIN_WIDTH=240`/`GROUP_MIN_HEIGHT=160`) duplicada en ambos lados, igual que ya ocurre con `GROUP_WIDTH`/`GROUP_HEIGHT`:
- **Frontend** (`diagramStore.ts`): integrada en `onNodesChange`, tras resolver las reasignaciones de `parentId` al soltar un drag — recalcula el tamaño de cualquier grupo que ganó o perdió un hijo en ese batch. Puede crecer y encoger (fit real, no solo crecer). No se recalcula en cada frame durante el arrastre, solo al soltar.
- **Backend MCP** (`server/mcp/server.ts`): integrada en `create_system` cuando se pasa `parentId` — tras insertar el nuevo nodo hijo, recalcula el tamaño del grupo padre a partir de todos sus hijos actuales, dentro de la misma mutación.

El usuario sigue pudiendo redimensionar un grupo manualmente en cualquier momento vía `NodeResizer`; el fit-to-content solo se dispara en los eventos descritos, no de forma continua.

## 🔍 Exportar/importar desde Lucidchart — descartado

Investigación profunda completada (2026-08-05) contra la documentación oficial de Lucid (`developer.lucid.co`, `lucid.readme.io`, foros de soporte). Conclusión: **no es viable bidireccional**, y la asimetría está confirmada al nivel del propio esquema de la API, no es una limitación de esfuerzo de implementación.

**Exportar (esta app → Lucidchart): técnicamente viable.**
- Mecanismo: "Standard Import" — un `.lucid` (zip con `document.json` + carpetas opcionales `/data`/`/images`) enviado a `POST https://api.lucid.co/v1/documents/create`. Crea un documento nuevo únicamente; no puede modificar uno existente.
- Auth: **API key de cuenta propia** (no OAuth2 con flujo de consentimiento por usuario) — ajusta bien al perfil de este proyecto (un solo operador probando contra su propia cuenta).
- Se preserva razonablemente: color, texto, imagen/icono personalizado (si es SVG se rasteriza a PNG, perdiendo escalabilidad vectorial pero no apariencia), posición/tamaño, y anidamiento de grupos (`GroupNodeData`/`parentId` mapea limpio al modelo `items` de grupos de Lucid).
- **Bloqueador previo a cualquier prototipo**: el Developer Portal de Lucid (API REST y Extension API) requiere plan **Team o Enterprise** — confirmado directamente por soporte de Lucid. Una cuenta Free/Individual no puede llamar al endpoint sin importar la calidad del código.

**Importar (Lucidchart → esta app): no viable con la API documentada.**
- El único endpoint de lectura (`GET /documents/<id>/contents`) devuelve tipos de shape y topología de conexiones (qué conecta con qué), pero el propio equipo de soporte de Lucid confirma explícitamente que **no** incluye color, posición, tamaño ni fuente — exactamente los datos necesarios para reconstruir algo visualmente fiel. No es un "vamos a intentarlo y ver", el plano de datos visual no está expuesto por ningún canal.
- Los formatos de intercambio tampoco resuelven esto: Lucidchart exporta a `.vsdx` (con una regresión de fidelidad documentada en conectores al reabrir en Visio) pero **no exporta a `.drawio`/`.xml`** — solo lo importa, y en beta. SVG hacia Lucidchart no es una importación de diagrama editable: se convierte a imagen de shape, no a objetos distintos.

**Se pierde siempre, sin importar el formato elegido** (confirmado, no aproximable con más esfuerzo):
- **Líneas paralelas multi-caso-de-uso**: un `line` de Standard Import tiene un solo objeto `stroke`. No existe el concepto de "N líneas semánticamente distintas para el mismo edge" en ningún formato investigado. Solo aproximable con workarounds (N líneas separadas con offset manual, o metadata invisible en la UI de Lucidchart).
- **Animación de partículas** (`speed` → `animateMotion`): comportamiento de runtime, ningún formato de diagrama estático captura estado de animación. Pérdida total e inevitable por definición, no una brecha de fidelidad a mejorar.
- **Escenarios**: lógica de presentación propia de la app, sin equivalente en ningún formato — solo recuperable si se inventa una convención propia de metadata custom en ambos extremos.
- **`handleCounts`**: sin equivalente directo (Lucidchart usa "smart lines" sin conteo fijo de handles por lado).

**Recomendación si se retoma**: prototipar solo la dirección exportación (Standard Import + API key), y solo tras confirmar que la cuenta de Lucidchart relevante ya tiene plan Team/Enterprise. Tratar como una función de "exportar una copia aproximada a Lucidchart", nunca como sincronización o importación real.

## ✅ Headline + texto explicativo — implementado

Nodo `annotation` independiente (`AnnotationNode.tsx`) — no se dio uso al campo `SystemNodeData.description` (sigue sin usar). Título editable por doble-click y cuerpo aparte (textarea, Enter inserta salto de línea en vez de cerrar), swatches de color y tamaño ajustable vía `NodeResizer`. Participa en `fitGroupToChildren` igual que cualquier otro nodo. Inicialmente era solo informativo; ahora tiene handles configurables en los cuatro lados para poder conectarse con el resto de tipos de nodo. Sigue sin tener una tool MCP de creación propia; desde MCP se usa `create_info_card` para contenido explicativo estructurado.

## ✅ Acción de borrar por MCP — implementado

`delete_node`, `delete_connection`, `delete_use_case` en `server/mcp/server.ts` (`delete_diagram` queda fuera de alcance). `delete_node` sobre un `group` con hijos los promueve al nivel del padre del grupo (o a la raíz), conservando su posición absoluta — igual que ya hacía `removeNode` en la UI. `delete_use_case` limpia referencias en `edges`/`scenarios` sin borrar los edges/scenarios en sí.

## ✅ Acción de insertar imagen por MCP — implementado

Se expuso solo el campo `icon` (URL externa o `preset:<slug>`) en el `inputSchema` de `create_system`/`create_group`, más una tool nueva `set_icon` para cambiar o borrar (`icon: ''`) el icono de un nodo ya existente. No se construyó un nodo de imagen independiente — fuera de alcance decidido.

## ✅ Grupos de grupos (anidamiento de grupos) — implementado

Quitado el guard que excluía a los nodos `group` de la detección de contenedor al soltar un drag. Nuevo helper `isDescendantOf`/`isDescendantOfNode` (frontend y MCP respectivamente) previene ciclos — un grupo no puede pasar a ser hijo de su propio descendiente. `create_group` en el MCP ahora acepta `parentId`, vía una función compartida `attachToParent` extraída de la lógica que ya usaba `create_system`.

De paso se corrigieron dos bugs pre-existentes que solo se manifestaban con 2+ niveles de anidamiento (invisibles con un solo nivel, porque ahí posición relativa y absoluta coinciden): `removeNode` promocionaba a los hijos de un grupo eliminado usando su posición relativa en vez de la absoluta; y `loadDiagram` ordenaba los nodos "grupos primero, resto después" sin tener en cuenta la profundidad relativa entre grupos anidados, lo cual podía violar el requisito de `@xyflow/system` de que un padre aparezca antes que su hijo en el array (ahora ordenado por `depthOf`).

## ✅ Pausar la continuidad del flujo de datos en presentación — implementado

Toggle global (`particlesPaused` en el store, no persistido, mismo patrón que `spotlightEnabled`) en `PresentationControls`. `Canvas.tsx` itera con `querySelectorAll('svg')` sobre **todos** los `<svg>` dentro del canvas — React Flow renderiza un `<svg>` independiente por edge (no uno único compartido, como se asumía inicialmente), así que iterar sobre uno solo dejaba sin pausar la mayoría de las partículas. Se confirmó soporte de `pauseAnimations()`/`unpauseAnimations()` en el entorno de Carlos antes de comprometerse al enfoque.

## ✅ Caja informativa con logo, header y descripción — implementado

Nuevo tipo de nodo independiente `infoCard`, con datos propios `{ header, description, icon?, color, handleCounts? }`, pensado para productos, capacidades, actores externos o conceptos que necesitan más contexto visible que una caja de sistema.

Incluye edición inline del header y de la descripción multilínea, logo mediante preset/subida/URL, colores, redimensionado y handles configurables en los cuatro lados. Se puede conectar en ambos sentidos con sistemas, grupos, anotaciones y otras cajas informativas. Participa también en undo/redo, alineación/distribución, importación/exportación JSON, grupos anidados, autoajuste de grupos, persistencia y modo presentación.

El MCP la expone mediante `create_info_card` y `update_info_card`; las tools genéricas `create_connection`, `set_icon` y `delete_node` aceptan igualmente este tipo. `list_diagrams` incorpora el número de cajas informativas y los headers de las situadas en el nivel raíz para que el agente pueda descubrirlas sin cargar primero todo el diagrama.

## 🚧 Verificación de cuentas y restablecimiento de contraseña por email — implementado, pendiente de despliegue

Añadida verificación de la dirección de email al registrar una cuenta y un flujo seguro para **restablecer** una contraseña olvidada. El proveedor elegido es el add-on de Mailgun para Heroku, consumido mediante su API HTTP y encapsulado detrás de `server/email/sender.ts`.

Implementación preparada:
- Migración `002_email_verification_and_password_reset.sql`: añade `email_verified_at`/`auth_version`, conserva activas las cuentas existentes y crea `auth_tokens`.
- Tokens aleatorios de un solo uso almacenados únicamente como SHA-256, con 24 horas para verificar y 30 minutos para restablecer.
- Registro sin sesión hasta verificar, reenvío de verificación, recuperación y cambio de contraseña mediante nuevos endpoints y pantallas públicas.
- Respuestas neutras para evitar enumeración de usuarios, cooldown por cuenta y rate limiting por IP.
- Cambio de contraseña con incremento de `auth_version`, que revoca cookies web y tokens MCP anteriores.
- Enlaces con el token en el fragmento de la URL para evitar que aparezca en los logs HTTP de Heroku; confirmación mediante `POST` y tracking de Mailgun desactivado.
- `Procfile` con release phase para aplicar migraciones antes de activar cada nueva versión.
- Pruebas unitarias para criptografía de tokens y generación de enlaces/plantillas.

Pendiente antes de marcarla como completada: desplegar, confirmar `APP_BASE_URL`, dominio/remitente y región de Mailgun en las config vars de Heroku, y realizar una prueba real de ambos correos contra una cuenta autorizada en el sandbox de Mailgun.

## Librería de sistemas reutilizables

Hoy cada `create_system`/caja de sistema se crea desde cero cada vez (nombre, logo/icono, color, todo a mano o dictado al MCP en cada diagrama). Idea: un catálogo de sistemas "de librería" —definidos una vez con nombre, logo/icono y color ya fijados— reutilizable entre diagramas distintos, en vez de repetir la configuración cada vez que ese mismo sistema (p.ej. "Stripe", "Postgres", "Auth0") aparece en una arquitectura nueva.

Incluiría probablemente:
- Conexiones "habituales" pre-asociadas al sistema de librería (p.ej. si el sistema de librería es "Stripe", sugerir automáticamente que suele conectar con un "Backend"/"Checkout service" con un use case tipo "Payment"), para no repetir también el patrón de integración cada vez.
- Alcance de esta librería: ¿por usuario, o global a la app? Afecta si vive en Postgres ligada a `owner_id` o es un catálogo compartido.
- Relación con [[MCP: uso automático de la librería]] (ver entrada siguiente) — si existe la librería, tiene sentido que el propio MCP la conozca y la use sin que haya que pedírselo explícitamente.

No evaluada la complejidad todavía — depende de si se decide alcance por usuario o global, y si las "conexiones habituales" son solo una sugerencia en la UI o algo que el MCP aplica automáticamente.

## MCP: uso automático de la librería de sistemas

Depende de la entrada anterior (librería de sistemas reutilizables) — sin catálogo, esto no aplica. Una vez exista, la idea es que las tools del MCP (`server/mcp/server.ts`) reconozcan automáticamente cuando el nombre de un sistema que se está creando coincide con uno ya definido en la librería, y en ese caso aplique su logo/color/icono ya configurado sin que haya que especificarlo en cada llamada a `create_system`. Reduciría la carga de tener que describir "usa el logo de Stripe, color tal" cada vez que ese mismo sistema aparece en una arquitectura nueva generada por MCP.

Puntos a decidir cuando se ataque: cómo hace el matching (¿nombre exacto, alias, fuzzy?), qué pasa si el nombre coincide pero el usuario quiere un override puntual de color/logo para ese diagrama en concreto, y si esto se expone como comportamiento automático silencioso o como una sugerencia que el propio agente MCP puede aceptar o no (ver [[feedback_design_corrections]] sobre la preferencia de Carlos por evitar comportamiento automático no solicitado — probablemente aplique aquí también, a confirmar con él antes de implementar).

## Edición colaborativa (multi-usuario simultáneo)

Hoy el modelo es un `owner_id` por diagrama, sin concepto de colaboradores ni de edición concurrente — autoguardado vía `PUT` completo del `content` (last-write-wins). Para permitir que varios usuarios editen el mismo esquema haría falta:

1. **Modelo de permisos**: tabla nueva (p.ej. `diagram_collaborators`: `diagram_id`, `user_id`, `role`) en vez del `owner_id` único actual — decidir roles (solo "editor" vs. también "viewer").
2. **Sincronización en tiempo real**: el autoguardado actual (debounce + `PUT` de todo el `content`) no sirve para dos usuarios a la vez — el segundo `PUT` pisaría los cambios del primero. Necesitaría WebSockets (o polling corto) + algún mecanismo de merge (operational transform / CRDT, o al menos un locking optimista con versión incremental para detectar conflictos).
3. **Presencia**: cursores/selecciones de otros usuarios visibles en el `Canvas`, similar a Figma/Google Docs.
4. Impacto grande en arquitectura — no es una extensión incremental del store actual, es un rediseño de la capa de persistencia y del backend en tiempo real.

La más compleja: rediseña el modelo de permisos, la capa de persistencia y añade infraestructura en tiempo real que hoy no existe.
