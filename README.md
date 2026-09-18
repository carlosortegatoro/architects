# Editor de Arquitecturas Técnicas

App web multiusuario para diseñar diagramas de arquitectura interactivos: cajas que representan sistemas, conectadas por líneas que representan casos de uso concretos (con color y animación propios). Los diagramas se guardan en PostgreSQL y también se pueden exportar/importar como JSON.

## Stack

- **Vite + React + TypeScript** — SPA sin SSR.
- **[@xyflow/react](https://reactflow.dev)** (React Flow) — motor de nodos/edges: drag-and-drop, dibujo de conexiones, nodos y edges personalizados.
- **Zustand** — estado global del diagrama (nodos, edges, casos de uso).
- **Express + PostgreSQL** — autenticación, persistencia multiusuario y enlaces públicos de solo lectura.
- **Mailgun** — verificación de cuentas y restablecimiento de contraseñas mediante el add-on de Heroku.
- **MCP HTTP** — creación y edición textual de diagramas con tokens por usuario.

## Cómo arrancar

```bash
npm install
npm run migrate
npm run dev
```

Copia primero `.env.example` a `.env` y configura al menos `DATABASE_URL` y `JWT_SECRET`. Para probar los flujos de email también hacen falta las variables de Mailgun y `APP_BASE_URL`. Abre la URL que indique Vite (por defecto `http://localhost:5173`, puede variar si el puerto está ocupado).

```bash
npm run build     # build de producción (tsc + vite build)
npm run preview   # sirve el build de producción localmente
npm test          # pruebas de backend y del store del editor
```

En Heroku, la release phase del `Procfile` aplica automáticamente las migraciones antes de activar una nueva versión.

## Estructura

```
src/
  main.tsx                    # entry point de React
  App.tsx                     # layout raíz, carga remota, autoguardado y modo presentación
  styles.css                  # todos los estilos (sin CSS-in-JS ni módulos, un solo archivo)
  types.ts                    # tipos del dominio: nodos, casos de uso, conexiones y DiagramFile
  store/
    diagramStore.ts           # store Zustand: nodos, edges, casos de uso + todas las acciones CRUD
  components/
    Canvas.tsx                 # wrapper de <ReactFlow>, prop `interactive` para modo presentación
    SystemBoxNode.tsx          # nodo custom: caja de sistema (icono/logo + label + color)
    InfoCardNode.tsx           # tarjeta informativa conectable (logo + header + descripción)
    AnnotationNode.tsx         # nota libre conectable (título + texto)
    UseCaseEdge.tsx            # edge custom: línea(s) con color + animación de partículas por caso de uso
    Sidebar.tsx                # panel izquierdo: alta/baja de sistemas
    UseCaseLegend.tsx          # panel derecho: alta/baja/edición de casos de uso
    EdgeInspector.tsx          # panel derecho: asignar casos de uso a la conexión seleccionada
    PresentationLegend.tsx     # leyenda flotante de casos de uso en modo presentación
    MenuBar.tsx                # barra superior: archivo, presentación, cuenta y configuración
    LoginScreen.tsx            # login, registro y estado pendiente de verificación
    VerifyEmailScreen.tsx      # confirmación de la dirección de email
    ForgotPasswordScreen.tsx   # solicitud de recuperación de contraseña
    ResetPasswordScreen.tsx    # establecimiento de la nueva contraseña
  utils/
    fileIO.ts                  # serialización JSON y migración del antiguo estado local
server/
  index.ts                     # aplicación Express y publicación del frontend
  routes/                      # autenticación, diagramas y enlaces compartidos
  email/                       # adaptador Mailgun y plantillas transaccionales
  mcp/                         # servidor MCP HTTP multiusuario
  migrations/                  # esquema PostgreSQL versionado
```

## Modelo de datos

Ver [`src/types.ts`](src/types.ts). Resumen:

- **`SystemNodeData`**: `{ label, description?, color, icon?, handleCounts?, displayMode? }`.
- **`InfoCardNodeData`**: `{ header, description, color, icon?, handleCounts? }`. Es un tipo separado para no mezclar la semántica de una tarjeta explicativa con la de un sistema.
- **`AnnotationNodeData`**: `{ title, body?, color?, handleCounts? }`.
- **`icon`**: puede ser un preset estable (`preset:<slug>`), una URL externa o un data URL base64 de una imagen subida; se persiste dentro del JSON del diagrama.
- **`UseCase`**: `{ id, name, color, speed, shape }`. Se definen una vez en la leyenda y se reutilizan en varias conexiones.
- **`ConnectionEdgeData`**: `{ useCaseIds: string[], label? }`. Una conexión puede tener 0, 1 o varios casos de uso asignados.
- **`DiagramFile`**: `{ version: 1, nodes[], edges[], useCases[] }` — es el formato que se exporta/importa como `.json`.

## Funcionalidades

### Cajas de sistema (`SystemBoxNode`)
- Doble click sobre el texto → edición inline del nombre.
- Círculo a la izquierda → subir una imagen/logo (PNG/SVG/JPG), se guarda como base64 en `data.icon`.
- Selector desplegable con el color actual → cambiar el color de la caja (afecta borde y línea inferior).
- Handles de conexión en los 4 lados (arrastrar desde el borde para crear una conexión).
- Botón "✕" → eliminar la caja (y sus conexiones asociadas).

### Cajas informativas (`InfoCardNode`)

- Logo seleccionable desde presets, archivo local o URL.
- Header y descripción multilínea editables por doble click.
- Color y tamaño ajustables.
- Handles configurables en los cuatro lados; pueden ser origen o destino de conexiones con cualquier tipo de nodo.
- Compatibles con grupos, undo/redo, alineación, importación/exportación, autoguardado y modo presentación.
- Disponibles en MCP mediante `create_info_card` y `update_info_card`; también funcionan con `create_connection`, `set_icon` y `delete_node`.

### Anotaciones (`AnnotationNode`)

- Título y cuerpo libre editables, color y tamaño ajustables.
- Handles configurables para conectarlas con sistemas, grupos, cajas informativas u otras anotaciones.

### Agrupar y mover cajas

- Al soltar una caja completamente dentro de un grupo, pasa a pertenecer a él sin cambiar su posición en el canvas. El grupo destino se resalta durante el arrastre.
- La pertenencia cambia solo al soltar. Arrastrar fuera permite salir del grupo o pasar a otro; un solapamiento parcial no basta para entrar.
- Entre grupos anidados se prioriza el más interior; entre candidatos al mismo nivel, el más pequeño. En empates se conserva el padre actual o se elige el último dibujado.
- Mover un grupo transporta sus hijos y grupos anidados sin alterar sus posiciones relativas. Los grupos arrastrados y sus descendientes no son destinos para los demás elementos del mismo arrastre.
- Los grupos no crecen ni se encogen al mover cajas. El botón `Fit` de la cabecera ajusta el marco al contenido directo, con espacio para la cabecera y los bordes, sin mover el contenido en el canvas. Un grupo vacío no cambia.
- Cada arrastre (también múltiple) y cada ajuste explícito tienen un paso de deshacer/rehacer. Las conexiones y la agrupación se conservan al guardar y volver a abrir.
- Cambiar la forma de una caja conserva el comportamiento anterior: puede ampliar sus grupos contenedores para acomodar el nuevo tamaño. Esto es independiente del arrastre.

Prueba local: crea primero una caja y después un grupo, arrástrala dentro y fuera, pásala entre dos grupos, repite con grupos anidados y varias cajas seleccionadas, y comprueba `Fit`, deshacer/rehacer y guardar/reabrir. La geometría está cubierta por `tests/nodeGrouping.test.ts`; queda pendiente la validación visual en navegador.

### Cobertura del MCP

El servidor anuncia **38 herramientas** para edición del documento: escenarios, todas las formas de nodo, movimiento/tamaño/agrupación, conversión de formas, conexiones, casos de uso, alineación/distribución, opciones guardadas, importación/exportación, duplicación, borrado y compartición. Incorpora deshacer/rehacer persistente para los últimos 50 cambios MCP y control de revisión para evitar sobrescrituras concurrentes entre el editor y el agente.

Requiere aplicar `004_mcp_history.sql` mediante `npm run migrate` contra la base de datos de desarrollo antes de probar esta versión. La implementación está local, sin desplegar. Inventario, contratos de coordenadas, confirmaciones y pruebas en [MCP_PARITY.md](MCP_PARITY.md).

Los controles efímeros de una pestaña (activar un escenario en presentación, fullscreen, puntero, zoom, tema) no son edición del documento y siguen fuera del MCP. El historial MCP es independiente del undo del navegador y se reinicia tras un guardado de la UI.

### Cambiar la forma de una caja

Clic derecho sobre una caja, o selección de una sola caja → botón `Change shape` sobre el canvas. El selector ofrece caja completa, solo logo, solo texto, caja informativa y anotación. Los grupos no se convierten.

El cambio conserva textos, logo (aunque no sea visible), color, posición, grupo y conexiones. Aplica el tamaño inicial de la forma elegida y amplía los grupos contenedores si hace falta. `Ctrl/Cmd+Z` restaura la forma, contenido y tamaño anteriores en un solo paso; `Ctrl/Cmd+Shift+Z` rehace la conversión. Elegir la forma actual o cerrar el menú no añade cambios al historial.

Para probarlo con `npm run dev`, utiliza un diagrama de prueba: conecta una caja, personaliza su contenido y tamaño, cambia entre las cinco formas y comprueba deshacer/rehacer. Repite dentro de un grupo y exporta/importa el JSON para comprobar que el contenido oculto se conserva. El menú admite flechas y Enter/Espacio; Escape o clic fuera lo cierran.

### Selector de color compacto

Todas las cajas (sistema completo, solo logo, solo texto, informativa, anotación y grupo) comparten un desplegable que muestra únicamente el color actual y una flecha. Conserva los colores personalizados ya guardados y utiliza el historial y la persistencia habituales. Abrir el selector o elegir el color actual no modifica el diagrama.

En `Logo only`, el logo ocupa el espacio interior disponible, sin recorte circular. El selector de color y el botón de borrar aparecen en una barra exterior al seleccionar la caja, pasar el cursor o darle foco con el teclado. Los controles se ocultan en presentación. En cajas informativas y anotaciones, el selector está en la cabecera para liberar espacio para la descripción.

### Casos de uso (`UseCaseLegend`)
- Botón "+ Nuevo" → crea un caso de uso con color/nombre por defecto.
- Cada caso de uso tiene: color (color picker), nombre editable, y tipo de animación (`particles` o `none`).
- Al eliminar un caso de uso, se desasigna automáticamente de todas las conexiones que lo tuvieran.

### Conexiones (`UseCaseEdge` + `EdgeInspector`)
- Click en una línea → abre el inspector (panel derecho) con checkboxes de todos los casos de uso disponibles.
- Una conexión sin casos de uso asignados se dibuja gris y discontinua.
- Con 1 caso de uso: una sola línea con su color; si su animación es `particles`, se ven 3 puntos viajando por la línea (SVG `<animateMotion>` nativo, sin librerías extra).
- Con 2+ casos de uso: se dibujan líneas paralelas (offset de ±10px), una por caso de uso, cada una con su propio color/animación y su chip de etiqueta.

### Modo presentación
- Botón "Presentar" en la Toolbar → oculta Sidebar, Toolbar y los paneles de edición derechos; intenta activar fullscreen del navegador (`requestFullscreen`, requiere gesto de usuario real — un click físico).
- El canvas queda solo-lectura (`Canvas interactive={false}`): no se pueden mover cajas ni crear conexiones nuevas, pero sí hacer pan/zoom.
- Aparece una leyenda flotante (`PresentationLegend`) en la esquina inferior izquierda con los casos de uso.
- Se sale con el botón "✕" de la leyenda o con la tecla `Esc`.

### Persistencia
- **Autoguardado**: cada cambio se guarda en PostgreSQL con debounce y revisión esperada; el frontend comprueba además si el diagrama ha sido actualizado remotamente. Un conflicto pausa el guardado y mantiene los cambios locales hasta que el usuario decida recargar (con confirmación y posibilidad de exportar antes).
- **Migración local**: si una cuenta nueva no tiene diagramas, se ofrece importar el antiguo diagrama almacenado en `localStorage`.
- **Export**: botón "Guardar JSON" descarga el diagrama completo como `diagrama.json`.
- **Import**: botón "Cargar JSON" reemplaza el diagrama actual por el contenido de un archivo `.json` (se valida `version === 1` antes de aplicar).

### Autenticación
- Se admiten direcciones `@salesforce.com` y, como excepción, la cuenta Gmail dedicada a pruebas.
- Las cuentas nuevas deben verificar su dirección antes de iniciar sesión.
- Los enlaces de verificación caducan a las 24 horas y los de restablecimiento de contraseña a los 30 minutos.
- Cambiar la contraseña invalida las sesiones web y tokens MCP anteriores.

## Decisiones de diseño relevantes

- **Persistencia multiusuario**: Express y PostgreSQL mantienen cuentas y diagramas; el JSON sigue siendo el formato portable de importación/exportación.
- **React Flow en vez de SVG/Canvas a medida**: ahorra la reimplementación de drag-and-drop, zoom/pan, y gestión de conexiones — todo eso viene resuelto por la librería.
- **Animación de partículas con SVG nativo (`animateMotion`)**: se evitó añadir una librería de animación; el propio SVG soporta mover un elemento a lo largo de un `path` con temporización e loop infinito.
- **Múltiples casos de uso por conexión → líneas paralelas**: en vez de un gradiente o mezcla de color, cada caso de uso mantiene su línea y color propio, evitando ambigüedad visual sobre qué caso de uso está presente.
- **El estilo de las cajas** (fondo blanco, borde gris grueso, icono circular a la izquierda, línea de color bajo el texto) fue definido a partir de ejemplos visuales aportados por el usuario, no es un patrón de una librería de diseño externa.

## Pendientes / mejoras conocidas

- El layout de 3 columnas (sidebar + canvas + panel derecho) necesita bastante ancho — en viewports muy estrechos (menos de ~520px) el canvas puede colapsar a 0px de ancho. No se ha hecho el layout responsive todavía.
- La cobertura automatizada todavía es parcial y está concentrada en los flujos sensibles del backend.
