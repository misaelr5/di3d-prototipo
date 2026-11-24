# Arquitectura del panel DI3D

## Fase 1 · Diagnóstico

La demo se sirve como HTML, CSS y JavaScript desde GitHub Pages. El ingreso y el cambio de integrante se simulan en el navegador. El flujo de cobros existente se probó con Chromium a 390 y 1440 px, incluyendo cobro parcial, recarga, archivo, anulación y filtro por período.

| Archivo | Responsabilidad actual |
| --- | --- |
| `index.html`, `estilos.css`, `panel.css` | Vistas y navegación del panel, diálogo de proyecto y formularios |
| `demo.js` | Pantalla activa, rutas por hash, bandeja, ficha y aclaraciones |
| `panel.js` | Resumen, tablero, contactos, archivo y cobros |
| `pedidos.js` | IndexedDB v6, datos de muestra, operaciones y derivados de cobros |
| `conexion.js` | Selección del almacenamiento. El modo publicado usa exclusivamente IndexedDB |

IndexedDB guarda pedidos, archivos, cotización vigente, cobros e historial. Los contactos se derivan de los pedidos. El valor de sesión y el integrante elegido viven en sessionStorage. Las mutaciones de pedidos registran el evento en la misma transacción de IndexedDB.

## Hallazgos y decisiones para la implementación

- **Estado y cobros.** El ejemplo de Estudio Sur con cotización aprobada y seña aparece como Cotizada. El modelo guarda la aprobación comercial dentro de la cotización y el estado operativo en el pedido. La migración deberá conciliar ambos datos, conservar el avance y aplicar la validación desde una sola operación de transición.
- **Cotizaciones y contactos.** La edición reemplaza la cotización vigente y conserva el PDF si corresponde. Faltan ítems y versiones consultables. Los contactos agrupados por teléfono o correo carecen de identidad propia. Conviene asignarles un identificador estable y migrar los pedidos existentes sin perder archivos ni referencias.
- **Solicitudes y administración.** El Resumen ya permite crear una consulta de WhatsApp. Faltan el acceso equivalente desde la bandeja, los canales de ingreso y los filtros del plan. Los tres filtros de Presupuestos ya funcionan y el período filtra los cobros. Lo pendiente es sumar contexto, acciones y exportación.
- **Rutas y reinicio.** Ya existen enlaces profundos por hash, compatibles con el alojamiento estático. Conviene conservar ese mecanismo y agregar navegación atrás entre pasos. El reinicio de la demo deberá ser explícito, con confirmación y limitado a su propia base.
- **Datos de muestra.** Extraer el seed a un módulo y usar fechas relativas. Los ejemplos de WhatsApp pueden mostrar la vista previa del mensaje. Abrir un chat externo requiere un número ingresado expresamente para evitar dirigir la demo a terceros.
- **Interfaz.** Solicitudes y Archivo comparten icono. El Resumen todavía prioriza un gráfico de volumen. El nuevo orden propuesto es pendientes, taller y cobros. La verificación a 360 px, zoom, contraste y Lighthouse corresponde a las fases de interfaz y QA.

## Orden de cambios

1. Mantener IndexedDB para guardar archivos y migrar datos sin perder historia. Extraer el seed y consolidar los derivados y las transiciones. Guardar montos en centavos.
2. Unificar tokens, componentes y navegación. Adaptar la bandeja, la ficha y el tablero sobre el modelo migrado.
3. Completar contactos, presupuestos y archivo. Construir el resumen a partir de los mismos datos y probar el recorrido de Estudio Sur en celular.

El repositorio usa archivos estáticos y no define un comando de build, lint o pruebas automatizadas. Para esta fase se ejecutó el recorrido existente de cobros. El checklist integral queda para las fases correspondientes.
