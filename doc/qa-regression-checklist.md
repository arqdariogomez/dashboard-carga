# QA Regression Checklist

## Scope
- Vista Tabla de Proyectos
- Jerarquia (indent/outdent, drag/drop)
- Columnas esenciales y dinamicas
- Comentarios y enlaces
- Realtime entre pestañas

## Pre-Run
1. Iniciar sesion en la app.
2. Abrir el mismo tablero en dos pestañas del navegador.
3. Confirmar que ambas pestañas muestran el mismo `board` en URL.

## A. Filas y jerarquia
1. Seleccionar una fila con un clic.
2. Abrir menu de handle (6 puntos) y usar:
- `Agregar fila arriba`
- `Agregar fila debajo`
- `Duplicar fila`
3. Verificar que aparecen filas nuevas en posicion correcta.
4. Usar `Aumentar sangria` y `Reducir sangria`.
5. Verificar jerarquia visual y contador de hijos.
6. Arrastrar una fila dentro/fuera de otra.
7. Verificar que no se permite ciclo de jerarquia.

## B. Sticky y navegacion
1. Hacer scroll vertical largo.
2. Verificar sticky de:
- barra superior
- headers de columnas
- padres jerarquicos
3. Verificar que no hay huecos transparentes arriba.

## C. Columnas (esenciales + dinamicas)
1. En header, abrir menu de una columna esencial.
2. Ejecutar:
- `Agregar antes`
- `Agregar despues`
- `Mover a la izquierda`
- `Mover a la derecha`
3. Verificar que orden visual cambia en header y celdas.
4. En columna dinamica:
- doble clic para renombrar (WYSIWYG)
- `Cambiar tipo` (etiquetas en espanol)
- `Mover / Copiar a...`
- `Eliminar`
5. Verificar que `Mover / Copiar` permite mover esenciales pero no copiar esenciales.
6. Recargar pagina y validar que orden de columnas dinamicas persiste.

## D. Comentarios y enlaces
1. Abrir panel de comentarios desde menu de fila.
2. Crear comentario de texto.
3. Crear enlace con URL y titulo opcional.
4. Verificar:
- avatar/nombre visible
- fecha visible
- boton eliminar en hover sin solaparse con fecha
- enlace abre en nueva pestaña
5. Eliminar comentario y confirmar dialogo.

## E. Realtime (2 pestañas)
1. En pestaña A editar nombre de fila.
2. Validar sincronizacion en pestaña B.
3. Reordenar fila en pestaña A, validar en B.
4. Cambiar orden de columnas dinamicas en A, validar en B tras sync.
5. Agregar comentario en A con panel abierto en B, validar refresco en vivo.

## F. Accesibilidad basica
1. Abrir menus (fila/columna) y presionar `Escape`.
2. Verificar cierre de menu/panel/modal.
3. Verificar foco inicial al abrir:
- menu contextual de columna
- modal `Mover / Copiar`

## Exit Criteria
- No errores bloqueantes en flujos A-F.
- Realtime consistente en cambios principales.
- Sin glitches visuales severos de sticky/superposicion.
- Sin perdida de datos tras recargar.
