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
- Verificacion final de paridad modular vs monolitico en interacciones finas de celdas dinamicas.
- Permitir columnas mas compactas en algunos casos (ej. `Asignado`).
- Revisar autosave para que "Guardado hace menos de un minuto" refleje cambios reales y no ruido. Y que solo se guarde si hubo un cambio.
- Estructura/funcionalidad
    - Orden personalizado y guardado de multiples ordenes.

## En progreso / validar

- Validacion funcional completa de `Progreso` en UI:
    - crear columna nueva tipo `Progreso`
    - editar valores en varias filas
    - persistencia despues de recargar

## Por hacer / revalidar (Linea de tiempo)

- Menu de fila desde boton de `Acciones de fila` (3 puntos), sin abrir por clic derecho. Sale del lado izquierdo de cada fila, similar al grip en la vista de Tabla de proyectos. Solo aparece por cada fila segun se hace hover, el estilo de boton es sin outline, fondo o sombra.
- Dropdown de acciones renderizado en `portal` para evitar clipping/solape. Revisar bien el z-index.
- Posicionamiento inteligente del dropdown (derecha/izquierda y arriba/abajo segun viewport), para que no haga overflow o tenga que hacerse un scroll extra solo para ver lo restante del dropdown contextual.
- Boton de acciones por fila movido al extremo izquierdo de la fila.
- Icono de acciones cambiado a `...` (en lugar de grip) para evitar confusion de drag.
- Minimap inferior removido de la UI por redundante.
- Validacion visual final de capas en hover de barras (sin bleed-through sobre sidebar sticky).
- Nuevo control `Agrupar` independiente de `Color`:
    - `Ninguno`
    - `Por persona`
    - `Por tipo`
    - `Personalizado` (`Sucursal`/`Prioridad`)
- Nuevo control `Orden` independiente:
    - `Cronologico`
    - `Personalizado`
- Menu de fila con reorden manual:
    - `Mover arriba`
    - `Mover abajo`
    - al reordenar cambia automaticamente a modo `Personalizado`.
- Nuevo control `Vista` funcional en Linea de tiempo:
    - seleccionar vista guardada
    - `Guardar` (actualiza vista activa o crea si es `Vista actual`)
    - `Guardar como`
    - `Eliminar` (con confirmacion) para vistas guardadas
    - persistencia por tablero en `localStorage`.
- Corregir capas restantes en casos borde (hover barras vs sidebar sticky).
- Zoom in/out y boton `Hoy`.
- La barra con Vista, Agrupar, Color, Orden, seria con un estilo minimalista y basado en practicas de la competencia (monday, asana, etc) y seria tipo dropdown principalmente, para ahorrar espacio. Y segun se van haciendo cambios se mostrarian esos chips en la barra para que sea sencillo poderlos ir quitando de uno por uno. Y saldria un boton ahi mismo de Limpiar todo.

## Pendiente (prioridad alta)

1. Vista Linea de tiempo

- Dependencias entre proyectos y modelo de exportacion a Excel.
- Hitos y su exportacion.

2. UX/fluidez

- Mejor feedback visual de drag & drop (fila y columna) para indicar caida final.

3. Datos y plataforma

- Deteccion flexible de titulo al importar tabla principal (heuristica + fallback de confirmacion).
- Completar migracion/uso de historial de versiones con verificacion en Supabase.

4. Vista tipo Kanban agrupable por varios criterios.

## Otros

- Mejoras generales UI/UX.
- Editor flotante de texto estilo Notion (negrita/cursiva) al entrar en edicion.
- Extender tipos de columna para comentarios/enlaces importantes si aplica.
- Integracion de IA para sugerencias, alertas y bitacora priorizada de cambios.

## Inmediato sugerido (proximas sesiones)

1. Terminar la sección de Por hacer / revalidar
2. Cerrar validacion de `Progreso` en navegador con checklist de regresion.
3. Revisar y ajustar autosave/estado "Guardado".