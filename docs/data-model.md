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
  "lista": ["A", "B", "", "D"],
  "texto": "ABD"
}
```

- `lista`: vector indexado por pregunta (permite vacíos).
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
    "justificacionIA": "Coincide con la clave oficial; mantiene el criterio contable esperado."
  }
]
```

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

## Entidad de historial (`reporte` persistido)

El historial almacena un arreglo de reportes bajo `corrector_historial_reportes_v1`.

```json
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
```

## Relación entre entidades

- Un `reporte` contiene exactamente un `examen` y un `estudiante`.
- Un `reporte` contiene una colección `puntuacionPorPregunta` de tamaño esperado `totalPreguntas`.
- `calificacionFinal` resume el resultado agregado del mismo `reporte`.
- El historial es una secuencia temporal de `reporte` (más reciente primero en la UI).
