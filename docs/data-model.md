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
    "bajaConfianza": false
  }
]
```

- `bajaConfianza`: `true` cuando la confianza OCR está por debajo del umbral docente configurado en frontend.

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

## Entidad de historial (`reporte` persistido)

El historial se persiste bajo `corrector_historial_reportes_v1` con envoltura versionada.

```json
{
  "schemaVersion": 2,
  "data": [
    {
      "id": "uuid",
      "creadoEn": "ISO-8601",
      "examen": { "...": "ver esquema examen" },
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

Compatibilidad y resiliencia:

- `schemaVersion: 1`: arreglo legacy sin envoltura (se migra automáticamente a v2).
- Los registros corruptos o incompletos se aíslan durante la lectura: se reparan cuando es posible o se descartan.

## Relación entre entidades

- Un `reporte` contiene exactamente un `examen` y un `estudiante`.
- Un `reporte` contiene una colección `puntuacionPorPregunta` de tamaño esperado `totalPreguntas`.
- `calificacionFinal` resume el resultado agregado del mismo `reporte`.
- El historial es una secuencia temporal de `reporte` (más reciente primero en la UI).
