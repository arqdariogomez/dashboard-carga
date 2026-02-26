MEJORAS:
- Asegurar que puedan editar nombres de filas o las columnas que no sean Esenciales al dar doble clic de modo WYISWYG como antes.
- Asegurar que al cambiar nombre de filas, al hacer clic fuera o presionar Esc se guarden los cambios de esa fila.
- En menú contextual de Columnas unificar estilo con el menú contextual de Filas, incluyendo que tenga iconos como en el otro menú.
- En menú contextual de Filas, al dar Click a "Mover / Copiar a..." que no salga ahí mismo como dropdown, sino que también para verse unificado con esta misma opción de las columnas, que es con un Popup, sería el mismo estilo de ventana pero amoldado a las Filas.
- Asegurarse que las columnas sean expandibles o contraíbles dentro de un rango aceptable


1. En vista Linea de tiempo: 
	1.1. Al hacer hover sobre un proyecto/fila no haga que su z-index quede por encima de la sección donde están los nombres de proyecto.
al hacer hover sobre un proyecto/fila no haga que su index quede por encima de la sección donde están los nombres de proyecto.
	1.2 Que también al hacer hover en el nombre de proyecto/fila salgan Handlers como los de Tabla de proyecto, para poder abrir menú contextual, que podría tener opciones de Nuevo, duplicar, que con doble clic se renombre, marcar como Hito, Depender de otro proyecto
, y otros que sean prudentes.
	1.3 Que no necesite estar acomodado por persona a fuerza, que mas bien sea un Agrupar por (Persona, Tipo, personalizado) similar al Colorear por, pero sin reemplazarlo, es una opción extra.

- Poder hacer zoom in o zoom out como el de Grafico de linea, y con un botón de "Hoy".
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
- Vista de Tableros tipo Kanban, que se pueda agrupar/organizar por distintas cosas, por ejemplo, por Realizado, por fechas, por persona, etc.
- Detección de título arriba de la tabla principal.
	-La tabla suele empezar en la celda A1, toda la fila 1 son los encabezados, pero si detecta filas vacías o algo que parece ser un titulo (viendo que no hay mas cosas en esa primera o segunda fila mas que esa celda, la tomará como título). Intenta hacerlo lo mas flexible posible, que puedan haber variaciones de titulo y que no deban estar en un orden especifico. O que en dado caso te salga una ventana preguntando que como no se detectó automáticamente, que si a partir de donde empieza la tabla.
- Usando MCP de supabase para aplicar/verificar en vivo, completar migración para usar correctamente el historial de versiones.
- Al dar clic en Nombre del proyecto para abrir menú de Nuevo, que el Nuevo agregue una nueva tabla/proyecto desde cero, sin nada agregado mas que una fila y las columnas esenciales. Y que haya un botón de Duplicar actual.

OTROS:
	- Mejorar diseño UI/UX
	- Terminar de poner bien esto. Que al entrar al modo de edición de texto también salga un menú flotante de editar texto (también inspirado en Notion) con opciones de Negrita, Cursiva.
	- Terminar de poner Tipos de columna. Que con eso se pueda poner una columna o sección de Comentarios o enlaces importantes. O poder ir dejando comentarios en los proyectos/tareas
	- Opción de conectar a IA, para poder recibir sugerencias o análisis de la carga de trabajo, etc. Es como conectarle una IA al proyecto en general, ver qué funcionalidades principales podría ayudar. con API de Google. Y que vaya avisando a los involucrados, estilo asistente, de que ya se acerca tal proyecto, o que si cómo vamos con este otro proyecto que se ve atrasado y que nos recuerde que si en caso de que esté pausado por algo, es importante tenerlo documentado. Y que vaya creando una bitácora de cambios, dando mas prioridad a unas cosas que otras pero que vaya anotando cambios de fecha, asignados, nuevas tareas o tareas completadas, y que se pueda editar o marcar como No importante para ocultarlo.


Roadmap inmediato:
Fase 1: Bugs críticos (primero)
Mover/copiar columnas - La UI existe pero no funciona bien
Gestión de opciones de columns dinámicas - Renombrar/eliminar opciones de tags puede fallar
Fase 2: Features importantes
Toggle "En radar" - Solo un botón en la toolbar (fácil)
handleToggleChecked - Para columnas tipo checkbox
Fase 3: Mejoras visuales
Secciones visuales (scheduled/unscheduled/radar) - Más complejo, riesgo de errores
