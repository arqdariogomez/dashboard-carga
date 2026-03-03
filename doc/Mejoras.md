MEJORAS

## Hecho (actualizado)
- Menu contextual de columnas unificado visualmente con iconos y acciones consistentes.
- Menu contextual de filas: `Mover / Copiar a...` con popup (no dropdown inline).
- Resize de columnas con limites minimo/maximo y persistencia de anchos.
- `Asignado` con dropdown rico:
  - seleccion multiple
  - alta rapida con Enter/+ en filas sucesivas
  - renombrar/eliminar
  - avatar
- `Sucursal` y `Etiquetas` con dropdown rico de etiquetas:
  - seleccion multiple
  - alta rapida
  - renombrar/eliminar
  - fusionar
- Tooltip de bloqueo para filas tipo grupo en celdas no editables.
- Se quito `Editar opciones` del menu contextual de columnas dinamicas.
- Se quito `Seleccion` de las opciones disponibles para crear/cambiar tipo de columna.
- Correccion importante en tipo `Progreso` para funcionar en escala real 0-100 (referencia monolitica).
- Linea de tiempo:
  - Menu de fila desde boton de `Acciones de fila` (3 puntos), sin abrir por clic derecho.
  - Dropdown de acciones renderizado en `portal` para evitar clipping/solape.
  - Posicionamiento inteligente del dropdown (derecha/izquierda y arriba/abajo segun viewport).

## En progreso / validar
- Validacion funcional completa de `Progreso` en UI:
  - crear columna nueva tipo `Progreso`
  - editar valores en varias filas
  - persistencia despues de recargar
- Verificacion final de paridad modular vs monolitico en interacciones finas de celdas dinamicas.
- Linea de tiempo:
  - Validacion visual final de capas en hover de barras (sin bleed-through sobre sidebar sticky).

## Pendiente (prioridad alta)
1. Vista Linea de tiempo
- Corregir capas restantes en casos borde (hover barras vs sidebar sticky).
- Agrupar por configurable (Persona, Tipo, personalizado), independiente de Colorear por.
- Zoom in/out y boton `Hoy`.
- Dependencias entre proyectos y modelo de exportacion a Excel.
- Hitos y su exportacion.

2. UX/fluidez
- Mejor feedback visual de drag & drop (fila y columna) para indicar caida final.
- Revisar autosave para que "Guardado hace menos de un minuto" refleje cambios reales y no ruido.
- Permitir columnas mas compactas en algunos casos (ej. `Asignado`).

3. Estructura/funcionalidad
- Quitar boton `+Columna` de la barra superior de Tabla de proyectos (si se confirma decision final).
- Orden personalizado y guardado de multiples ordenes.
- Vista tipo Kanban agrupable por varios criterios.

4. Datos y plataforma
- Deteccion flexible de titulo al importar tabla principal (heuristica + fallback de confirmacion).
- Completar migracion/uso de historial de versiones con verificacion en Supabase.

5. Proyecto/tablero
- Al crear tablero nuevo desde menu del nombre:
  - iniciar vacio (columnas esenciales + 1 fila placeholder)
  - agregar opcion explicita de "Duplicar actual".

## Otros
- Mejoras generales UI/UX.
- Editor flotante de texto estilo Notion (negrita/cursiva) al entrar en edicion.
- Extender tipos de columna para comentarios/enlaces importantes si aplica.
- Integracion de IA para sugerencias, alertas y bitacora priorizada de cambios.

## Inmediato sugerido (proximas 1-2 sesiones)
1. Cerrar validacion de `Progreso` en navegador con checklist de regresion.
2. Revisar y ajustar autosave/estado "Guardado".
3. Mejorar feedback visual de arrastre (drop target) en filas y columnas.
4. Consolidar pendientes de Linea de tiempo en subtareas ejecutables.
