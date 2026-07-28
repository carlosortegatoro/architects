# Editor de Arquitecturas Técnicas

Ver [README.md](README.md) para el contexto completo del proyecto: stack, estructura, modelo de datos, funcionalidades y decisiones de diseño.

Resumen rápido: app web standalone (Vite + React + TypeScript + React Flow + Zustand) para crear diagramas de arquitectura — cajas de sistemas conectadas por líneas que representan casos de uso, cada uno con su color y animación de partículas. Sin backend; persistencia vía `localStorage` + export/import de JSON.

Este directorio es independiente de cualquier otro proyecto de cliente (RIU, etc.) — no compartas contexto ni archivos entre ambos.
