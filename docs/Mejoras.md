\*Recordatorio hacer un commit no por cada pequeño movimiento, pero sí cada cierto tiempo o cambio importante. El push debe ser por solicitud explícita.

#### 

#### Pendiente:

Vista Linea de tiempo (GanttTImeline)

* Poder arrastrar las barras de tiempo para ajustar al mismo tiempo su fecha de inicio y de fin, ajustar esas fechas ahí debe actualizarlo también en las demás vistas.
* Que los nombres de proyectos mejor queden por fuera de la barra, a la derecha, como en monday.com
* Que al dar clic en algún día, enliste los proyectos que se tienen en ese día, y que también esa lista sea agrupable, filtrable, etc.
* Agregar a un lado de la barra, opcionalmente, un avatar de a quien está asignado.
* Ver qué pasa en Colorear cuando hay mas de una persona (Dejar blanco?)
* Dependencias entre proyectos y modelo de exportación a Excel.
* Hitos y su exportación. Hitos por color según si son Flexibles (metas propias) o Fijos(2 de Nov).
* En vista Linea de tiempo. La barra con Vista, Agrupar, Color, Orden, seria con un estilo minimalista y basado en practicas de la competencia (monday, asana, etc) y seria tipo dropdown principalmente, para ahorrar espacio. Y segun se van haciendo cambios se mostrarían esos chips en la barra para que sea sencillo poderlos ir quitando de uno por uno. Y saldria un boton ahi mismo de Limpiar todo.
* En la misma barra, poner a la izquierda los asignados, fuera de la barra, su avatar.  Activable por Toggle.
* Poner avance por proyecto, con un ligero cambio de tono, basado en la columna de Progreso, si no hay columna de progreso su fallback sería desactivado. (desactivable por toggle)
* Idea: Poder activar una ventana en la parte de abajo, que muestre la gráfica de línea como en la vista Gráfica de linea, y estaría alineado a los filtros y zoom de tiempo activos en ese momento en el gráfico de arriba en esa misma vista. Si se hace zoom o se cambia cualquier cosa en la vista de arriba, ahí se actualizaría al mismo tiempo. La idea nace de la gráfica de línea que se muestra en la Timeline de los videos YouTube que muestran en qué parte del video la gente lo ve mas, pero aquí mostraría mas bien la carga. Como idea extra, en vez de eso podría mostrarse de forma minimalista en la misma barra de persona al activar el filtro Por persona. Se mostraría la carga por persona en su misma barra/altura. 
* Mostrar distintas las barras de resumen que las de Tareas, por ejemplo las de tareas estarían redondeadas, y las de resumen tendrían un corte a 45 en una esquina al inicio y otra al final, como Forecast



Vista Resumen por persona (GanttTImeline)

* Poder filtrar por Hoy, Esta semana, Este mes, Personalizado.
* Poder poner recordartorios, o resumenes de lo actual y lo que está por venir, segun prioridades, dado por una IA.



Otros:

* En Vista gráfico de línea poner en la parte superior las indicacioens de Año y meses, así como lo tiene la parte superior de la vista Linea de tiempo (GanttTimeline)
* Mejor feedback visual de drag \& drop (fila y columna) para indicar caída final.
* Detección flexible de titulo al importar tabla principal (heuristica + fallback de confirmacion).
* Completar migración/uso de historial de versiones con verificación en Supabase.
* Vista tipo Kanban agrupable por varios criterios.



#### Otras prioridades

* Opciones de enlaces y vistas compartibles por permisos. Publico, solo cierta cuenta o proyecto, sólo ver, edición, etc. Enfocarse primero en Publico, que cualquiera con una cuenta en la Database pueda editar los archivos, al mismo tiempo, basado en Tickets y mostrando en qué celda está, y guardando quién hizo qué cambio.
* En la vista Gráfico de línea y Vista de Carga. Que la barra de zoom sea como la de Linea de tiempo. con su misma ubicaicón y opciones de 3M, 6M, Todo, y todo lo demás referente a eso.
* En vista Linea de Tiempo, acciones de Mover a...
* Que los grupos sí se puedan contraer, primero hagamoslo únicamente en la Vista Tabla de proyectos, y una vez que yo lo validé al 100% ahí, nos pasamos a duplicar ese funcionamiento en las demás vistas
* Poder meter o sacar de grupo (indent/sangría) a varias filas/proyectos a la vez. Mientras se usa el Seleccionar varios.
* Asegurar que detecte bien las sangrías/grupos al importar Excel.
* Poner un botón de Importar, con opción a Importar Excel, y que enseguida esté el botón de Exportar, que ahí metería el de Excel y CSV actual.
* Que el botón de Nuevo proyecto diga mejor "Nueva fila/proyecto"
* En vista Tabla de proyectos. Agregar una opción de Ordenar (Personalizado, Cronológicamente, Alfabético A -Z, Alfabético Z-A)
* En vista Tabla de proyectos. Agregar una opción de Ocultar columna, una opción para ver cuales columnas están prendidas o apagadas y ahí poder prender todas nuevamente.
* En vista Tabla de proyectos. Tener una opción de Vistas, donde se pueda configurar cuales columnas tener prendidas o apagadas. Y que tenga dropdown para elegir entre distintas vistas guardadas. Con botones de Guardar y Guardar cómo.
* Mejoras generales UI/UX.
* Editor flotante de texto estilo Notion (negrita/cursiva) al entrar en edición de texto en Nombres de proyecto.
* Ver según mejores practicas si agregar un botón con sólo el icono, de Comentarios, para tenerlo mas a la mano, sólo al hacer hover en las filas, en vista de Tabla de proyectos y vista Linea de tiempo (Gantt).
* Integración de IA para sugerencias, alertas y bitácora inteligente priorizada de cambios.
* 

---



#### Hecho

* Menu de fila desde boton de `Acciones de fila` (3 puntos), sin abrir por clic derecho. Sale del lado izquierdo de cada fila, similar al grip en la vista de Tabla de proyectos. Solo aparece por cada fila segun se hace hover, el estilo de boton es sin outline, fondo o sombra.
* Menu contextual de columnas unificado visualmente con iconos y acciones consistentes.
* Menu contextual de filas: `Mover / Copiar a...` con popup (no dropdown inline).
* Resize de columnas con limites minimo/maximo y persistencia de anchos.
* `Asignado` con dropdown rico:

  * seleccion multiple
  * alta rapida con Enter/+ en filas sucesivas
  * renombrar/eliminar
  * avatar

* `Sucursal` y `Etiquetas` con dropdown rico de etiquetas:

  * seleccion multiple
  * alta rapida
  * renombrar/eliminar
  * fusionar

* Tooltip de bloqueo para filas tipo grupo en celdas no editables.
* Se quito `Editar opciones` del menu contextual de columnas dinamicas.
* Se quito `Seleccion` de las opciones disponibles para crear/cambiar tipo de columna.
* Correccion importante en tipo `Progreso` para funcionar en escala real 0-100 (referencia monolitica).
* Verificacion final de paridad modular vs monolitico en interacciones finas de celdas dinamicas.
* Permitir columnas mas compactas en algunos casos (ej. `Asignado`).
* Revisar autosave para que "Guardado hace menos de un minuto" refleje cambios reales y no ruido. Y que solo se guarde si hubo un cambio.
* Estructura/funcionalidad

Orden personalizado y guardado de multiples ordenes.

