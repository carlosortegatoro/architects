# Editor de Arquitecturas Técnicas

App web standalone para diseñar diagramas de arquitectura interactivos: cajas que representan sistemas, conectadas por líneas que representan casos de uso concretos (con color y animación propios). Sin backend — todo vive en el navegador, con export/import a JSON.

## Stack

- **Vite + React + TypeScript** — proyecto 100% cliente, sin SSR.
- **[@xyflow/react](https://reactflow.dev)** (React Flow) — motor de nodos/edges: drag-and-drop, dibujo de conexiones, nodos y edges personalizados.
- **Zustand** — estado global del diagrama (nodos, edges, casos de uso).
- Persistencia: `localStorage` (autoguardado) + export/import manual de archivos `.json`.

## Cómo arrancar

```bash
npm install
npm run dev
```

Abre la URL que indique Vite (por defecto `http://localhost:5173`, puede variar si el puerto está ocupado).

```bash
npm run build     # build de producción (tsc + vite build)
npm run preview   # sirve el build de producción localmente
```

**Importante:** este proyecto no está inicializado como repositorio git. Si quieres control de versiones:

```bash
git init
git add .
git commit -m "Initial commit: editor de arquitecturas técnicas"
```

## Estructura

```
src/
  main.tsx                    # entry point de React
  App.tsx                     # layout raíz, hidratación desde localStorage, modo presentación
  styles.css                  # todos los estilos (sin CSS-in-JS ni módulos, un solo archivo)
  types.ts                    # tipos del dominio: UseCase, SystemNodeData, ConnectionEdgeData, DiagramFile
  store/
    diagramStore.ts           # store Zustand: nodos, edges, casos de uso + todas las acciones CRUD
  components/
    Canvas.tsx                 # wrapper de <ReactFlow>, prop `interactive` para modo presentación
    SystemBoxNode.tsx          # nodo custom: caja de sistema (icono/logo + label + color)
    UseCaseEdge.tsx            # edge custom: línea(s) con color + animación de partículas por caso de uso
    Sidebar.tsx                # panel izquierdo: alta/baja de sistemas
    UseCaseLegend.tsx          # panel derecho: alta/baja/edición de casos de uso
    EdgeInspector.tsx          # panel derecho: asignar casos de uso a la conexión seleccionada
    PresentationLegend.tsx     # leyenda flotante de casos de uso en modo presentación
    Toolbar.tsx                # barra superior: guardar/cargar JSON, limpiar, entrar en modo presentación
  utils/
    fileIO.ts                  # serialización a/desde JSON, descarga de archivo, localStorage
```

## Modelo de datos

Ver [`src/types.ts`](src/types.ts). Resumen:

- **`SystemNodeData`**: `{ label, description?, color, icon? }`. `icon` es un data URL base64 de la imagen subida (se guarda embebido en el JSON, no como archivo aparte).
- **`UseCase`**: `{ id, name, color, animation: 'particles' | 'none' }`. Se definen una vez en la leyenda y se reutilizan en varias conexiones.
- **`ConnectionEdgeData`**: `{ useCaseIds: string[], label? }`. Una conexión puede tener 0, 1 o varios casos de uso asignados.
- **`DiagramFile`**: `{ version: 1, nodes[], edges[], useCases[] }` — es el formato que se exporta/importa como `.json`.

## Funcionalidades

### Cajas de sistema (`SystemBoxNode`)
- Doble click sobre el texto → edición inline del nombre.
- Círculo a la izquierda → subir una imagen/logo (PNG/SVG/JPG), se guarda como base64 en `data.icon`.
- Fila de swatches → cambiar el color de la caja (afecta borde y línea inferior).
- Handles de conexión en los 4 lados (arrastrar desde el borde para crear una conexión).
- Botón "✕" → eliminar la caja (y sus conexiones asociadas).

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
- **Autoguardado**: cada cambio en el store se serializa y guarda en `localStorage` (clave `architectures.diagram`, ver [`utils/fileIO.ts`](src/utils/fileIO.ts)). Al abrir la app, se restaura automáticamente si existe.
- **Export**: botón "Guardar JSON" descarga el diagrama completo como `diagrama.json`.
- **Import**: botón "Cargar JSON" reemplaza el diagrama actual por el contenido de un archivo `.json` (se valida `version === 1` antes de aplicar).

## Decisiones de diseño relevantes

- **Sin backend**: se optó por export/import de archivos JSON en vez de una base de datos, para mantener la herramienta ligera y sin infraestructura que mantener.
- **React Flow en vez de SVG/Canvas a medida**: ahorra la reimplementación de drag-and-drop, zoom/pan, y gestión de conexiones — todo eso viene resuelto por la librería.
- **Animación de partículas con SVG nativo (`animateMotion`)**: se evitó añadir una librería de animación; el propio SVG soporta mover un elemento a lo largo de un `path` con temporización e loop infinito.
- **Múltiples casos de uso por conexión → líneas paralelas**: en vez de un gradiente o mezcla de color, cada caso de uso mantiene su línea y color propio, evitando ambigüedad visual sobre qué caso de uso está presente.
- **El estilo de las cajas** (fondo blanco, borde gris grueso, icono circular a la izquierda, línea de color bajo el texto) fue definido a partir de ejemplos visuales aportados por el usuario, no es un patrón de una librería de diseño externa.

## Pendientes / mejoras conocidas

- El layout de 3 columnas (sidebar + canvas + panel derecho) necesita bastante ancho — en viewports muy estrechos (menos de ~520px) el canvas puede colapsar a 0px de ancho. No se ha hecho el layout responsive todavía.
- No hay tests automatizados.
- El proyecto no tiene `.git` inicializado (ver sección "Cómo arrancar" arriba).
