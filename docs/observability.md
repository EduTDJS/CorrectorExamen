# Observabilidad del backend de calificación

Este documento define el formato de logs del backend (`backend/server.js`) para soporte operativo y diagnóstico.

## Objetivo

- Trazar cada request con un `requestId` único.
- Facilitar troubleshooting sin exponer secretos ni datos sensibles.
- Estandarizar eventos y campos para alertas, métricas y búsqueda.

## Correlación con `requestId`

- El backend acepta `X-Request-Id` entrante si el cliente lo envía.
- Si no existe, genera un `requestId` por solicitud.
- El backend devuelve `X-Request-Id` en la respuesta.
- En respuestas de error, también incluye `error.requestId` en el body JSON.

## Eventos registrados

1. `request_started`
   - Se emite al entrar al handler.
2. `provider_selected`
   - Se emite en `POST /api/calificacion/sugerir` luego de parsear body y antes de invocar el proveedor.
3. `request_completed`
   - Se emite al finalizar (éxito o error), con status HTTP, duración y `errorCode` cuando aplique.

## Formato JSON de logs

Todos los logs estructurados salen por `stdout` como JSON por línea (JSONL).

Campos base:

- `timestamp` (ISO-8601 UTC)
- `level` (`info` | `error`)
- `event` (`request_started` | `provider_selected` | `request_completed`)
- `requestId`
- `method`
- `path`

Campos opcionales por evento:

- `status` (HTTP status final)
- `durationMs` (duración total en milisegundos)
- `provider` (ej. `anthropic`, `openai`)
- `model` (modelo configurado)
- `errorCode` (código interno, ej. `provider_timeout`)
- `payloadMetadata` (solo metadatos no sensibles)

## Política de datos sensibles

No se registran:

- API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, tokens).
- Payload completo de `datos`.
- Contenido textual de respuestas del proveedor.

`payloadMetadata` incluye únicamente:

- `hasDatos`
- `datosKeys`
- `puntajeType`
- `hasPuntaje`
- `payloadSizeBytes`

## Ejemplos

```json
{"timestamp":"2026-03-26T12:00:00.000Z","level":"info","event":"request_started","requestId":"req-abc","method":"POST","path":"/api/calificacion/sugerir"}
{"timestamp":"2026-03-26T12:00:00.010Z","level":"info","event":"provider_selected","requestId":"req-abc","method":"POST","path":"/api/calificacion/sugerir","provider":"openai","model":"gpt-4o-mini","payloadMetadata":{"hasDatos":true,"datosKeys":["fecha","grupo","materia","totalPreguntas"],"puntajeType":"number","hasPuntaje":true,"payloadSizeBytes":124}}
{"timestamp":"2026-03-26T12:00:00.320Z","level":"info","event":"request_completed","requestId":"req-abc","method":"POST","path":"/api/calificacion/sugerir","status":200,"durationMs":320,"provider":"openai","model":"gpt-4o-mini"}
```

Ejemplo con error:

```json
{"timestamp":"2026-03-26T12:00:01.115Z","level":"error","event":"request_completed","requestId":"req-xyz","method":"POST","path":"/api/calificacion/sugerir","status":504,"durationMs":5001,"provider":"anthropic","model":"claude-sonnet-4-20250514","errorCode":"provider_timeout"}
```
