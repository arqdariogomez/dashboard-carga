MEJORAS:
- Que al cambiar nombre de filas, al hacer clic fuera o presionar Esc se guarden los cambios de esa fila
- Que al querer editar algo (que no sea el nombre) en una fila Grupo/Parent salga un pequeño Hint de que las filas Grupo no se pueden editar ya que su función es resumir.

- En vista Linea de tiempo: 
	- Al hacer hover sobre un proyecto/fila no haga que su index quede por encima de la sección donde están los nombres de proyecto.
al hacer hover sobre un proyecto/fila no haga que su index quede por encima de la sección donde están los nombres de proyecto.
	- Que también al hacer hover en el nombre de proyecto/fila salgan Handles como los de Tabla de proyecto, para poder abrir menú contextual, que podría tener opciones de Nuevo, duplicar, que con doble clic se renombre, marcar como Hito, Depender de otro proyecto
, y otros que sean prudentes.
	- Que no necesite estar acomodado por persona a fuerza, que mas bien sea un Agrupar por (Persona, Tipo, personalizado) similar al Colorear por, pero sin reemplazarlo, es una opción extra.
	- Poder hacer zoom o zoom out como el de Grafico de linea, y con un botón de "Hoy".
- Hacer que al cambiar la foto sea permanente en todas las fotos. Y que se pueda abrir el panel de Gestionar personas en Configuración. Y que se pueda cambiar foto o abrir el de gestionar personas desde la vista Resumen por persona en algún menú contextual al dar clic en una Persona, tal vez que al hacer Hover sobre una foto  salga un icono de Lápiz que sea de editar, y ahí salga un menú contextual flotante.
- Que al arrastrar fila o columna, haya mejor feedback profesional y fluido del dónde caerá ese elemento y cómo se acomodará.
- Se me hace raro que dura mucho tiempo lo de Guardado hace menos de un minuto, podrá ser porque se guarda constantemente o porque eso no se actualiza bien. Debe guardarse automáticamente únicamente si detecta que hubo un cambio.
- Hay algunas columnas que requieren poderse hacer mas compactas (ej. Asignado), permitir un ancho mínimo de columna menor al actual.
- Mejorar la parte de Asignado, que sea con un dropdown de selección multiple similar a del Etiquetas. Y que haya posibilidad de ligar esa persona a un usuario, o de asignarle un avatar, con opción a recibirlo directo de su foto de correo, o subir una imagen para esa Persona.
- En Vista Linea de tiempo, agregar posibilidad de depender de otro, al exportar eso a Excel se le vería una columna de Depende de, o Intersecta con, y ahí podría ser selección multiple de otros proyectos.
- Quitar el botón de +Columna en la barra superior de Tabla de proyectos.
- En Vista Linea de tiempo, agregar Hitos, y pensar como quedaría eso si se exporta a tabla o Excel.
- Poder arrastrar un elemento hacia adentro de otro, con buen feedback visual, para agregarlo dentro de ese elemento, si ya es Padre/grupo lo agregará al inicio de sus hijos, o si no es Padre lo convertiría en uno, con su debida advertencia. Cambiar la advertencia a "Al convertir este elemento en Grupo se perderán sus datos para pasar a ser resumen su interior. ¿Continuar?"
- Poder tener Orden personalizado o hasta guardar esos distintos ordenes en un dropdown con opción a agregar nuevo Orden y dejarlo guardado.
- En Historial de versiones, poder abrir esa versión en una forma de Preview antes de Restaurar, porque a veces uno no sabe si restaurar algo o no antes de ver qué tiene dentro.
- Historial de versiones, y documentar quien hizo cambios, todo eso como en Office
- Vista de Tableros tipo Kanban, que se pueda agrupar/organizar por distintas cosas, por ejemplo, por Realizado, por fechas, por persona, etc.
- Detección de título arriba de la tabla principal.
	-La tabla suele empezar en la celda A1, toda la fila 1 son los encabezados, pero si detecta filas vacías o algo que parece ser un titulo (viendo que no hay mas cosas en esa primera o segunda fila mas que esa celda, la tomará como título). Intenta hacerlo lo mas flexible posible, que puedan haber variaciones de titulo y que no deban estar en un orden especifico. O que en dado caso te salga una ventana preguntando que como no se detectó automáticamente, que si a partir de donde empieza la tabla.
- Usando MCP de supabase para aplicar/verificar en vivo, completar migración para usar correctamente el historial de versiones.
- Al dar clic en Nombre del proyecto para abrir menú de Nuevo, que el Nuevo agregue una nueva tabla/proyecto desde cero, sin nada agregado mas que una fila y las columnas esenciales. Y que haya un botón de Duplicar actual.
- Arreglar error al Guardar ahora: No se pudo guardar: insert or update on table "tasks" violates foreign key constraint "tasks_parent_fk" | 23503 | Key is not present in table "tasks"
- En menú contextual de Filas, agregar botón de Agregar grupo arriba, y Agregar grupo debajo, eso puede facilitar el proceso y te ahorras pasos
- Que funcione bien la Selección multiple, y que a un lado del botón de Salir selección multiple haya un botón de (…) o de opciones, que sería como el Menú contextual de Fila, pero destinado así a varias filas, y asegurarse que sí sirva. Investigar mejores prácticas al respecto y usarlas.

OTROS:
	- Mejorar diseño UI/UX
	- Terminar de poner bien esto. Que al entrar al modo de edición de texto también salga un menú flotante de editar texto (también inspirado en Notion) con opciones de Negrita, Cursiva.
	- Terminar de poner Tipos de columna. Que con eso se pueda poner una columna o sección de Comentarios o enlaces importantes. O poder ir dejando comentarios en los proyectos/tareas
	- Opción de conectar a IA, para poder recibir sugerencias o análisis de la carga de trabajo, etc. Es como conectarle una IA al proyecto en general, ver qué funcionalidades principales podría ayudar. con API de Google.




--------------------------------------------------

Roadmap recomendado (cerrando al 100% por bloque)

Estabilidad crítica y datos
Arreglar Guardar ahora con error FK tasks_parent_fk (23503).
Validar guardado/duplicado con jerarquías profundas y reordenamientos.
Cerrar migración de historial en Supabase (board_versions) y verificar en vivo.
DoD: 0 errores de guardado en flujo normal + pruebas manuales de crear/mover/eliminar/guardar + historial en nube funcionando.
Personas y avatares (consistencia total)
Hacer foto permanente y compartida en todas las vistas (Tabla, Resumen por persona, Carga, etc.).
Mover “Gestionar personas” también a Configuración.
En Resumen por persona: hover en avatar + lápiz + menú contextual.
Afinar fusión para que siempre deje un único registro visible global.
DoD: una edición de persona/foto se refleja en todas las vistas sin refrescar manualmente.
Selección múltiple profesional
Shift-click rango, Ctrl/Cmd-click selección discontinua.
Menú contextual para selección múltiple (...) con acciones masivas.
Homologar atajos (Esc, Del, etc.) y feedback visual.
DoD: UX tipo file manager, sin estados “atascados”, acciones masivas confiables.
Drag & drop avanzado
Mejor feedback visual de drop para filas/columnas.
“Arrastrar dentro de otro” con comportamiento consistente y advertencia final correcta.
Revisar performance y evitar saltos visuales.
DoD: preview de drop claro en todos los casos (before/inside/after), sin ambigüedad.
Timeline funcional avanzado
Dependencias entre proyectos (multi-select), con exportación a Excel.
Hitos (milestones) y su mapeo en tabla/export.
DoD: editar, visualizar y exportar dependencias/hitos sin pérdida de datos.
Productividad de tablero
“Nuevo” desde nombre del proyecto: tablero limpio (1 fila + columnas esenciales).
Botón “Duplicar actual”.
Quitar +Columna de barra superior (si ya no aporta).
Guardar/usar órdenes personalizados.
DoD: creación/duplicado/ordenes completamente usables desde UI sin workarounds.
Importación inteligente
Detección robusta de título arriba de la tabla + fallback asistido cuando falle.
DoD: importa correctamente archivos con variaciones reales de encabezado/título.
Expansión de producto
Vista Kanban configurable por criterio.
Rich text tipo Notion.
Tipos de columna faltantes (comentarios/enlaces).
IA (fase posterior, separada).
DoD: cada feature con flujo completo y persistencia.
Qué haría primero ahora mismo

Empezar por Bloque 1 (Estabilidad crítica y datos), porque todo lo demás depende de que guardar/versionar sea 100% confiable.