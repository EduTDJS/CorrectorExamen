# Modelo de datos

Este documento describe los esquemas lógicos usados para construir y persistir reportes de corrección.

## Entidad `examen`

```json
{
  "materia": "string",
  "grupo": "string",
  "fecha": "YYYY-MM-DD",
  "totalPreguntas": "number",
  "claveRespuestas": "string"
}
```

- `claveRespuestas` se normaliza a letras válidas `A|B|C|D`.
- `materia` se guarda con normalización visual mínima (`trim` + colapso de espacios internos).

## Entidad `organizacion`

Estructura derivada para agrupar historial por carpeta semántica de materia.

```json
{
  "materiaNormalizada": "contabilidad i",
  "materiaFolderId": "materia:contabilidad i"
}
```

- `materiaNormalizada`: nombre de materia canónico (`trim`, colapso de espacios, minúsculas y sin diacríticos) para evitar duplicados semánticos.
- `materiaFolderId`: identificador estable de carpeta para agrupación y acciones masivas (conteo/exportación).

## Entidad `estudiante`

```json
{
  "nombre": "string",
  "matricula": "string"
}
```

## Entidad `respuestas`

```json
{
  "lista": [
    { "respuesta": "A", "confianza": 92.5, "fuenteLinea": "Línea 1" },
    { "respuesta": "B", "confianza": 55.2, "fuenteLinea": "Token 14" },
    { "respuesta": "", "confianza": null, "fuenteLinea": "" }
  ],
  "texto": "AB"
}
```

- `lista`: vector indexado por pregunta con metadatos OCR enriquecidos.
- `respuesta`: letra normalizada `A|B|C|D` o vacío.
- `confianza`: porcentaje (`0-100`) reportado por Tesseract cuando está disponible.
- `fuenteLinea`: referencia a la línea/token OCR que originó la respuesta.
- `texto`: concatenado limpio para validaciones rápidas.

## Entidad `puntuacionPorPregunta`

Arreglo de objetos, uno por pregunta.

```json
[
  {
    "numero": 1,
    "respuestaCorrecta": "A",
    "respuestaEstudiante": "A",
    "correcta": true,
    "puntaje": 10,
    "justificacionIA": "Coincide con la clave oficial; mantiene el criterio contable esperado.",
    "confianzaOCR": 92.5,
    "fuenteOCR": "Línea 1",
    "bajaConfianza": false,
    "desglose": {
      "criterioAplicado": "Comparación directa clave oficial vs respuesta del estudiante",
      "evidencia": {
        "clave": "A",
        "respuestaEstudiante": "A",
        "estado": "correcta",
        "confianzaOCR": 92.5,
        "fuente": "Línea 1"
      },
      "resultado": "Respuesta correcta: coincide con la clave (A) y suma 10.00 puntos.",
      "recomendacion": "Mantener criterio; no requiere ajuste docente."
    }
  }
]
```

- `bajaConfianza`: `true` cuando la confianza OCR está por debajo del umbral docente configurado en frontend.
- `desglose`: contrato explícito reutilizado en UI, persistencia y exportación (PDF/CSV).
- Campos mínimos del `desglose`: `criterioAplicado`, `evidencia`, `resultado`, `recomendacion`.

## Entidad `calificacionFinal`

```json
{
  "notaSobre100": 88.5,
  "letra": "B+",
  "justificacionDocente": "Buen dominio general con errores menores en ajustes."
}
```

- `notaSobre100`: número final (automático o ajustado por docente).
- `letra`: mapeo a escala PUCMM.

## Entidad `decisionFinal` persistida

La decisión final se guarda en `corrector_decision_final` con versión de esquema:

```json
{
  "schemaVersion": 2,
  "data": {
    "puntuacion": "string",
    "justificacion": "string"
  }
}
```

- `schemaVersion: 1` corresponde al formato legacy sin envoltura (`{ puntuacion, justificacion }`).
- La lectura valida tipos y restaura valores por defecto cuando no se puede migrar.

## Entidad de historial (`reporte` persistido en backend)

La persistencia primaria ocurre en backend con SQLite (`backend/db/data.sqlite`) y la tabla lógica `reports` (campo `payload_json`). El fallback JSON local del backend queda permitido **solo** para desarrollo local con `REPORTS_STORAGE_DEV_FALLBACK=true`.

```json
{
  "schemaVersion": 4,
  "data": [
    {
      "id": "uuid",
      "creadoEn": "ISO-8601",
      "ownership": {
        "tenantId": "string",
        "userId": "string",
        "role": "docente|coordinador|admin|corrector|auditor"
      },
      "examen": { "...": "ver esquema examen" },
      "organizacion": { "...": "ver esquema organizacion" },
      "estudiante": { "...": "ver esquema estudiante" },
      "respuestas": { "...": "ver esquema respuestas" },
      "puntuacionPorPregunta": [
        { "...": "ver esquema puntuacionPorPregunta" }
      ],
      "justificacionesIA": [
        {
          "pregunta": 1,
          "justificacion": "string"
        }
      ],
      "calificacionFinal": { "...": "ver esquema calificacionFinal" }
    }
  ]
}
```

- `ownership` define el ámbito de acceso del reporte para aplicar aislamiento por tenant y, cuando corresponda, por usuario.

Compatibilidad y resiliencia (fallback local en desarrollo):

- `schemaVersion: 1`: arreglo legacy sin envoltura (se migra automáticamente a v2).
- `schemaVersion: 2`: envoltura versionada sin `organizacion` (se migra automáticamente a v3 reconstruyendo carpetas por materia normalizada).
- `schemaVersion: 3`: reportes previos sin `desglose` explícito por pregunta (se migra automáticamente a v4 normalizando el contrato).
- Los registros corruptos o incompletos se aíslan durante la lectura: se reparan cuando es posible o se descartan.
- En producción no se usa fallback JSON; el backend opera únicamente sobre SQLite + migraciones SQL.

## Tabla lógica `reports` (backend)

```json
{
  "id": "string",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "payload_json": "{...reporte serializado...}"
}
```

## Tabla lógica `audit_logs` (backend)

```json
{
  "id": "string",
  "report_id": "string",
  "action": "report_created | report_updated",
  "actor": "string",
  "created_at": "ISO-8601",
  "metadata_json": "{\"source\":\"api\",\"id\":\"report_*\",\"tenantId\":\"tenant-*\",\"sessionId\":\"session-*\"}"
}
```

### Garantía transaccional

- `createReport` y `updateReport` escriben `reports` y `audit_logs` en la misma transacción SQL (`BEGIN IMMEDIATE ... COMMIT/ROLLBACK`) para mantener atomicidad.
- Las migraciones se aplican con `backend/db/schema.sql` al inicializar el adaptador SQL o mediante script dedicado (`npm run migrate:db`).

## Relación entre entidades

- Un `reporte` contiene exactamente un `examen` y un `estudiante`.
- Un `reporte` contiene una colección `puntuacionPorPregunta` de tamaño esperado `totalPreguntas`.
- `calificacionFinal` resume el resultado agregado del mismo `reporte`.
- El historial es una secuencia temporal de `reporte` (más reciente primero en la UI).
