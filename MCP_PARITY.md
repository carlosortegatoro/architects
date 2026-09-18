# Paridad MCP / UI

Actualizado: 18/09/2026. Implementación local, sin commit, push ni despliegue. Sustituye la auditoría del 17/09: el servidor pasa de 15 a **38 herramientas**. La cobertura se refiere al documento persistido; no al control remoto de una pestaña.

## Inventario y cobertura

| Operación | Herramientas |
| --- | --- |
| Descubrir diagramas y convenciones | `list_diagrams`, `get_diagram`, `get_design_guide` |
| Crear, renombrar, duplicar y borrar diagramas | `create_diagram`, `rename_diagram`, `duplicate_diagram`, `delete_diagram` |
| Importar/exportar JSON | `import_diagram`, `export_diagram` |
| Crear las cinco formas y grupos | `create_system` (full/logoOnly/textOnly), `create_group`, `create_info_card`, `create_annotation` |
| Editar textos, colores, logos, tamaño y puntos de conexión | `update_node`, `update_info_card`, `set_icon` |
| Mover, agrupar, desagrupar y ajustar grupos | `update_node` (position/parentId), `fit_group` |
| Convertir formas, alinear, distribuir y borrar nodos | `change_node_shape`, `align_nodes`, `distribute_nodes`, `delete_node` |
| Crear, editar/reconectar y borrar conexiones | `create_connection`, `update_connection`, `delete_connection` |
| Crear, editar/renombrar por ID y borrar casos de uso | `set_use_case`, `update_use_case`, `delete_use_case` |
| Consultar, crear, editar y borrar escenarios | `list_scenarios`, `create_scenario`, `update_scenario`, `delete_scenario` |
| Etiquetas de conexiones y conexiones flotantes | `set_diagram_options` |
| Listar, crear y revocar enlaces públicos | `list_share_links`, `create_share_link`, `revoke_share_link` |
| Consultar historial, deshacer y rehacer | `get_diagram_history`, `undo_diagram_change`, `redo_diagram_change` |

`list_diagrams` incluye ahora anotaciones y nombres de escenarios en su resumen. Se conservan las herramientas anteriores para no romper clientes.

## Contratos de edición

- Creación: `position` relativa a `parentId`, o absoluta si no hay padre. `update_node`: `position` siempre absoluta. Cambiar solo el padre conserva la posición absoluta; `parentId: null` saca el nodo a la raíz.
- Crear/mover hijos no redimensiona grupos. `fit_group` reproduce el botón `Fit`, conserva las posiciones absolutas de los hijos y no modifica grupos vacíos. Los grupos pueden anidarse, pero nunca contenerse a sí mismos ni a sus ancestros.
- `change_node_shape` comparte implementación con la UI: conserva identificador, textos ocultos, icono, color, conexiones y pertenencia; usa el tamaño de la forma destino y amplía ancestros cuando corresponde. Los grupos no son convertibles. `logoOnly` se crea en 90×90.
- Alineación/distribución comparten geometría con la UI. Si se seleccionan un grupo y su hijo, el hijo viaja con el grupo, sin desplazarse dos veces.
- Borrar un grupo promueve sus hijos directos a la **raíz**, conservando sus posiciones absolutas, como la UI. Las conexiones del grupo eliminado se borran, no las de sus hijos.
- Conexiones y escenarios solo admiten casos de uso existentes. Renombrar mediante `update_use_case` conserva el ID; borrarlo limpia referencias en conexiones y escenarios. Los handles configurables son `top/right/bottom/left` y `side-2` a `side-4`; reducir un número de handles en uso se rechaza.
- Importación valida versión, tipos, identificadores únicos, referencias y ausencia de ciclos. Por defecto crea un documento nuevo con `name`; para reemplazar el contenido de uno existente requiere `diagramId` y `confirmReplace: true`, sin `name`. El reemplazo mantiene el nombre y entra en el historial.
- Exportación devuelve `{ filename, content }`: el cliente puede guardarlo como JSON. El servidor no escribe archivos en la máquina del usuario. Logos por URL, preset o datos embebidos se transportan como `icon`; no se opera el selector local de archivos.
- Borrar un diagrama entero es permanente y requiere `confirmDelete: true` y su `confirmName` exacto. Crear un enlace público requiere `confirmSharing: true` y caducidad en horas; ambas herramientas indican que necesitan autorización explícita del usuario. Revocar/crear enlaces no forma parte del historial del documento.

## Historial y concurrencia

La migración `004_mcp_history.sql` añade `diagrams.revision` y el historial de hasta 50 cambios MCP por diagrama. Los snapshots incluyen nombre y contenido. Persiste entre peticiones/instancias del servidor MCP; no depende de la memoria del proceso. Cada edición documentaria es un paso, incluidos borrados de elementos y reemplazos por importación. Un no-op no crea pasos ni elimina rehacer.

Las mutaciones MCP envían la revisión leída. La API bloquea la fila del propietario y guarda documento/historial en una transacción; si la revisión cambió devuelve 409 sin escribir. Deshacer/rehacer utiliza la misma protección. Hay que releer y reconsiderar la operación, no sobrescribir a ciegas.

El editor también envía su revisión, serializa guardados y conserva los cambios hechos durante una petición en vuelo. Un conflicto deja los cambios locales intactos y pausa el autoguardado hasta resolverlo; recargar pide confirmación porque descarta lo no guardado (puede exportarse antes). **No hay fusión automática de ediciones.** Clientes REST antiguos que omitan `expectedRevision` mantienen su comportamiento anterior sin esta protección; el MCP y el editor actualizado sí la envían.

Un guardado real de la UI (incluido renombrar) borra el historial MCP para impedir que un undo remoto revierta una edición del usuario. El undo local de teclado sigue siendo independiente; no se mezclan las dos pilas. Crear/duplicar/borrar documentos completos o compartirlos no se deshace mediante estas herramientas.

## Controles de sesión fuera del MCP documental

Activar un escenario durante una presentación, fullscreen, puntero, resaltados, pausa de animaciones, tema, selección y pan/zoom son estado efímero del navegador. No se anuncian como herramientas que aparenten controlar una sesión: necesitan un canal de sesión remoto y decidir qué navegador se controla. CRUD de escenarios sí está implementado.

Login, verificación de email y recuperación de contraseña siguen en el flujo de cuenta. El MCP opera con el token del usuario y reutiliza la autorización por propietario; no se exponen herramientas para administrar cuentas.

## Puesta en marcha y verificación

1. Confirmar que `.env` apunta a la base de datos de desarrollo adecuada.
2. Ejecutar `npm run migrate` para aplicar `004_mcp_history.sql` antes de usar la API actualizada. La migración no se ha ejecutado sobre datos reales en esta tarea.
3. Arrancar con `npm run dev` y refrescar/reconectar el cliente MCP para redescubrir las 38 herramientas.
4. Usar un diagrama de prueba: crear escenario/anotación, editar grupo, convertir forma, modificar conexión, deshacer/rehacer y comprobar la actualización en la UI. Probar conflicto con cambios locales sin guardar.

Pruebas automatizadas:

- `server/mcp/parity.test.ts`: inventario real con `Client.listTools()` y llamadas por `InMemoryTransport`, con API simulada; escenarios, nodos, grupos, formas, conexiones, layout, import/export, confirmaciones, permisos e historial entre instancias.
- `server/routes/diagrams.test.ts`: handlers Express reales con SQL/transacciones simulados; propietario, revisión, rollback, no-op, límites de historial e invalidación por edición UI.
- `tests/diagramSync.test.ts`: editor real con API simulada; conflictos y solicitudes en vuelo.
- `tests/nodeGrouping.test.ts`, `tests/nodeShape.test.ts`, `server/mcp/infoCard.test.ts`: geometría, conversión, historial UI y compatibilidad de tarjetas.

La compilación y estas pruebas no sustituyen una ejecución contra PostgreSQL ni la validación visual. No se han invocado herramientas contra diagramas reales del usuario, creado enlaces públicos, aplicado migraciones ni desplegado a Heroku.
