# UI/UX Final Audit (Frontend-Design)

## Objetivo
Cerrar polish visual y de usabilidad sin cambiar comportamiento core.

## 1. Jerarquia visual
- Subir un poco contraste entre niveles de texto en headers (`text-text-secondary` vs `text-text-primary`).
- Unificar altura visual de botones de toolbar (actualmente hay pequeñas variaciones).
- Mantener espaciado horizontal consistente entre icono y etiqueta en menus.

## 2. Menus contextuales
- Agregar `role=\"menu\"` y `role=\"menuitem\"` para semantica de accesibilidad.
- Mostrar estado activo para opciones de ordenado actual.
- Agregar separadores semanticos claros entre:
  - acciones de estructura
  - acciones de orden
  - acciones destructivas

## 3. Comentarios
- Mostrar estado de hover mas suave en boton eliminar (menos contraste brusco).
- Agregar truncado inteligente del nombre del autor con tooltip en nombres largos.
- Etiquetar enlaces visualmente con icono leve para distinguirlos de texto normal.

## 4. Columnas dinamicas
- En `Cambiar tipo`, destacar tipo actual con icono y color de estado.
- Validacion inline en vez de `alert` para opciones invalidas.
- En `Mover / Copiar`, agregar buscador cuando haya muchas columnas.

## 5. Realtime feedback
- Reducir ruido visual de indicadores `Editando:` cuando hay varios usuarios.
- Opcional: agrupar indicadores por iniciales/avatar en lugar de texto largo.

## 6. Checklist de cierre visual
1. Revisar en 1366px y 1920px.
2. Revisar en 1280x720 (densidad compacta).
3. Revisar estados hover/focus/active en:
- toolbar
- menu fila
- menu columna
- panel comentarios
