# UX: Importación de respuestas (CSV/Excel)

## Objetivo

Permitir carga masiva de respuestas con validación temprana y corrección manual asistida antes de guardar el reporte.

## Formato de plantilla

Formato aceptado:

- `CSV UTF-8` (`.csv`).
- `Excel` (`.xls` / `.xlsx`).

Campos obligatorios por fila:

1. `estudianteNombre`
2. `estudianteMatricula`
3. `respuestas`

Ejemplo CSV:

```csv
estudianteNombre,estudianteMatricula,respuestas
Ana Pérez,2026001,ABCDAB
Luis Díaz,2026002,ABCCDB
```

## Normalización de respuestas

- Entrada aceptada: `A/B/C/D` (insensible a mayúsculas).
- Se aplican correcciones de OCR comunes: `4→A`, `8→B`, `(→C`, `0/O/Q→D`.
- Si `totalPreguntas` está definido, el largo de `respuestas` debe coincidir exactamente.

## Duplicados por matrícula

- Si una matrícula aparece varias veces en el mismo archivo, se conserva **la última fila válida**.
- Se muestra advertencia de duplicados detectados en historial existente.
- En registro por lote se usa `estudianteMatricula` como clave de idempotencia para evitar reprocesar una misma fila en la misma ejecución.

## Acciones masivas en la vista previa

- `Registrar todas las válidas`: persiste todas las filas válidas de la importación.
- `Registrar seleccionadas`: persiste el subconjunto visible de la tabla de vista previa.
- Al finalizar el lote, se muestra un resumen con:
  - filas creadas,
  - filas actualizadas,
  - filas omitidas,
  - filas fallidas.

## Errores por registro

Se reportan por fila:

- Campos obligatorios ausentes.
- Respuestas sin letras válidas.
- Largo de respuestas distinto a `totalPreguntas`.

## Límites

- Tamaño máximo de archivo: `2MB`.
- Registros máximos por importación: `200`.
- Formato aceptado: `CSV UTF-8` (`.csv`) y `Excel` (`.xls` / `.xlsx`).
