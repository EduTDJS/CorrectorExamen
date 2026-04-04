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

## Plantilla y pegado rápido

- La UI ofrece `Descargar plantilla` junto al selector de archivo.
- La plantilla genera un CSV con encabezados obligatorios:
  - `estudianteNombre`
  - `estudianteMatricula`
  - `respuestas`
- También existe la acción `Pegar desde Excel/Sheets`, que abre un modal con textarea para pegar datos en formato `TSV` (tabulado) o `CSV`.
- El texto pegado se procesa con el mismo flujo de validación que la importación por archivo (mismo esquema, deduplicación y resumen).

## Normalización de respuestas

- Entrada aceptada: `A/B/C/D` (insensible a mayúsculas).
- Se aplican correcciones de OCR comunes: `4→A`, `8→B`, `(→C`, `0/O/Q→D`.
- Si `totalPreguntas` está definido, el largo de `respuestas` debe coincidir exactamente.

## Duplicados por matrícula

- Si una matrícula aparece varias veces en el mismo archivo, se conserva **la última fila válida**.
- Se muestra advertencia de duplicados detectados en historial existente.
- En registro por lote se usa `estudianteMatricula` como clave de idempotencia para evitar reprocesar una misma fila en la misma ejecución.
- Antes de ejecutar el lote, el usuario puede seleccionar estrategia de conflicto:
  - `omitir existentes`: no modifica matrículas ya presentes en historial de la materia.
  - `sobrescribir por matrícula`: actualiza reportes existentes por matrícula.
  - `crear solo nuevos`: crea solo matrículas nuevas y no contabiliza las existentes como omitidas.
- La UI muestra un conteo previo por estrategia (`creados / actualizados / omitidos`) para validar impacto antes de ejecutar.

## Acciones masivas en la vista previa

- `Registrar todas las válidas`: persiste todas las filas válidas de la importación.
- `Registrar seleccionadas`: persiste el subconjunto visible de la tabla de vista previa (página + filtro actual).
- La vista previa incluye:
  - búsqueda rápida por `matrícula` o `nombre`,
  - selector de `filas por página` (10/15/25/50),
  - navegación por páginas para revisar lotes grandes sin recortar en duro.
- Al finalizar el lote, se muestra un resumen con:
  - filas creadas,
  - filas actualizadas,
  - filas omitidas,
  - filas fallidas.
- Cada ejecución de lote persiste un reporte de operación para trazabilidad:
  - `timestamp`,
  - `strategy`,
  - `affectedMatriculas`.
- El historial de operaciones se visualiza en el paso final y puede exportarse como CSV (`operaciones_importacion.csv`).

## Errores por registro

Se reportan por fila:

- Campos obligatorios ausentes.
- Respuestas sin letras válidas.
- Largo de respuestas distinto a `totalPreguntas`.

## Límites

- Tamaño máximo de archivo: `2MB`.
- Registros máximos por importación: configurable por `VITE_IMPORT_MAX_ROWS` o `window.__APP_CONFIG__.import.maxRows` (fallback seguro: `200`).
- Formato aceptado: `CSV UTF-8` (`.csv`) y `Excel` (`.xls` / `.xlsx`).
