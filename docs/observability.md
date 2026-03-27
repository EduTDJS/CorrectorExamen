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
3. `provider_failover`
   - Se emite cuando el proveedor primario falla con un error conmutable y se deriva al secundario.
4. `provider_circuit_opened` / `provider_circuit_half_open` / `provider_circuit_closed`
   - Cambios de estado del circuito por proveedor.
5. `rate_limit_saturation`
   - Se emite cuando el consumo está cerca del umbral o cuando ya hay rechazo (`429`).
6. `request_completed`
   - Se emite al finalizar (éxito o error), con status HTTP, duración y `errorCode` cuando aplique.
7. `report_exported`
   - Se emite al completar una exportación exitosa (`GET /api/reportes/:id/export`).
8. `report_scope_denied`
   - Se emite cuando un reporte existe, pero el actor autenticado no tiene alcance tenant/usuario sobre el recurso.
9. `rate_limit_bucket_count`
   - Se emite para observabilidad del tamaño del mapa de buckets de rate limit (`rate_limit_bucket_count`) durante limpieza periódica, limpieza oportunista y control de capacidad.

## Formato JSON de logs

Todos los logs estructurados salen por `stdout` como JSON por línea (JSONL).

Campos base:

- `timestamp` (ISO-8601 UTC)
- `level` (`info` | `error`)
- `event` (`request_started` | `provider_selected` | `provider_failover` | `provider_circuit_*` | `rate_limit_saturation` | `rate_limit_bucket_count` | `request_completed` | `report_exported` | `report_scope_denied`)
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
- `metrics` (contador agregado de `failovers`, `providerErrors`, `circuitOpenEvents` y/o métrica `rate_limit_bucket_count`)
- `from`/`to` (proveedor origen/destino en failover)
- `circuitState` (`closed` | `open` | `half_open`)
- `attempts` (intentos y códigos de error por proveedor)
- `rateLimit` (métricas de bucket: `key`, `role`, `tenantId`, `userId`, `count`, `maxRequests`, `windowMs`, `remainingMs`, `thresholdRatio`, `nearThreshold`, `rejected`)
- `actor` (cuando aplica: `userId`, `role`, `tenantId`)
- `resource` (en eventos de reporte: `action`, `type`, `id`, `tenantId`, `endpoint`, `timestamp`)

## Catálogo de auditoría de negocio (`audit_logs`)

Eventos persistidos:

- `report_created`
- `report_updated`
- `final_grade_changed`
- `report_deleted`

Campos obligatorios de trazabilidad:

- `tenantId`
- `actor` (`userId`, `role`)
- `resource` (tipo + id + endpoint cuando aplique)
- `timestamp` (ISO-8601 UTC)
- `requestId` (logs operacionales)

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
{"timestamp":"2026-03-26T12:00:00.221Z","level":"error","event":"provider_failover","requestId":"req-abc","method":"POST","path":"/api/calificacion/sugerir","from":"anthropic","to":"openai","errorCode":"provider_upstream_error","metrics":{"failovers":1,"providerErrors":{"anthropic":1,"openai":0},"circuitOpenEvents":{"anthropic":0,"openai":0}}}
```

Ejemplo con error:

```json
{"timestamp":"2026-03-26T12:00:01.115Z","level":"error","event":"request_completed","requestId":"req-xyz","method":"POST","path":"/api/calificacion/sugerir","status":504,"durationMs":5001,"provider":"anthropic","model":"claude-sonnet-4-20250514","errorCode":"provider_timeout"}
```

## Monitoreo recomendado para rate limiting

- Alertar por aumento de `event = "rate_limit_saturation"` con `rateLimit.rejected = true`.
- Crear dashboard por `rateLimit.role` para validar que límites por rol estén balanceados.
- Revisar distribución de `rateLimit.key` para detectar tokens compartidos o tenants saturados.
- Ajustar `RATE_LIMIT_NEAR_THRESHOLD_RATIO` (default `0.8`) según ruido esperado de alertas tempranas.
- Monitorear `event = "rate_limit_bucket_count"` y alertar si `metrics.rate_limit_bucket_count` se aproxima sostenidamente a `RATE_LIMIT_MAX_BUCKETS`.

### Política operativa de buckets de rate limit

- Cada clave (`tenant:user`, token o IP según estrategia) mantiene un bucket con `count`, `resetAt` y `lastSeenAt`.
- Limpieza periódica: un timer configurable elimina entradas expiradas (`resetAt < now`) con `RATE_LIMIT_BUCKET_CLEANUP_INTERVAL_MS` (default `30000` ms).
- Limpieza oportunista: cada ejecución de `assertRateLimit` corre mantenimiento para no depender solo de timers (relevante en runtimes serverless).
- Capacidad máxima: `RATE_LIMIT_MAX_BUCKETS` (default `5000`). Si se excede:
  1. se eliminan expirados agresivamente;
  2. si aún excede, se aplica descarte LRU simple (menor `lastSeenAt`).
- Frecuencia de emisión de métrica de tamaño del mapa: `RATE_LIMIT_BUCKET_COUNT_LOG_INTERVAL_MS` (default `30000` ms), con emisión forzada cuando hay limpieza/evicción.

## Observabilidad de cobertura de pruebas (CI)

La cobertura de tests se ejecuta con `npm run test:ci` (Vitest + `--coverage`) y genera artefactos en `coverage/`.

Reportes publicados por CI:

- `coverage/lcov.info` para trazabilidad e integración con herramientas externas.
- `coverage/index.html` y archivos HTML asociados para inspección visual por archivo/línea.
- Resumen `text` en logs del job para diagnóstico rápido.

Umbrales vigentes:

- Globales: `statements >= 70`, `branches >= 60`, `functions >= 70`, `lines >= 70`.
- Quality gate de módulos críticos (por archivo):
  - `backend/server.js >= 80`
  - `backend/ai/providerOrchestrator.js >= 80`
  - `src/hooks/useReportes.js >= 80`
  - `src/services/aiService.js >= 80`
  (cada uno en `statements`, `functions` y `lines`; `branches` mantiene el umbral global).

Interpretación operativa:

- Cualquier incumplimiento de los módulos críticos se considera falla de quality gate, aunque los globales se mantengan.

- Si el job falla por cobertura, la causa raíz suele estar en archivos nuevos o modificados que no alcanzan umbral por archivo (`perFile: true`).
- Usar el reporte HTML para localizar líneas sin cubrir y priorizar pruebas en ramas condicionales no ejercitadas.
- El `lcov.info` debe conservarse como evidencia histórica de calidad en cada ejecución del pipeline.

## Indicadores mínimos de respaldo y recuperación

Además de logs de aplicación, se deben registrar y monitorear estos indicadores de continuidad:

- `backup_last_age_minutes` (edad del último backup exitoso por ambiente).
- `backup_success_rate_24h` (tasa de éxito de backups de últimas 24h).
- `restore_duration_seconds` (tiempo total de restore validado).

Fuentes de evidencia:

- Evidencias JSON generadas por scripts en `backend/db/` (`*.evidence.json`).
- Artefacto de CI del job programado de restore drill (`artifacts/restore-drill/restore-drill-evidence.json`).

Alertas sugeridas:

- `backup_last_age_minutes` por encima del RPO objetivo del ambiente.
- `backup_success_rate_24h < 0.95` en `prod`.
- Tendencia de `restore_duration_seconds` cercana o superior al RTO objetivo del ambiente.
