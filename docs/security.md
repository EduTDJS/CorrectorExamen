# Seguridad: integración IA multi-proveedor con backend propio

La aplicación usa un modelo **server-side** donde los secretos de proveedores (`Anthropic` y `OpenAI`) viven únicamente en el backend.

## Estado actual

- El frontend no solicita ni almacena API keys del proveedor.
- La UI invoca `POST /api/calificacion/sugerir` en el backend propio.
- El cliente centraliza el token de sesión en `src/services/sessionService.js` y construye headers autenticados con `buildAuthHeaders`.
- Los endpoints críticos del backend exigen `Authorization: Bearer <session-token>` de usuario final.
- El backend selecciona proveedor por `AI_PROVIDER` y firma la llamada saliente con:
  - `ANTHROPIC_API_KEY` (Anthropic)
  - `OPENAI_API_KEY` (OpenAI)
- El endpoint `POST /api/calificacion/sugerir` exige token interno en header (`X-Internal-Token` por defecto).
- El backend aplica rate limiting configurable por ventana, límite base y límites por rol (`docente`, `coordinador`, `admin`).
- El backend expone `GET /api/calificacion/proveedor` sin secretos, solo metadatos operativos (proveedor/modelo/timeout).
- El backend aplica RBAC por acción para crear examen, corregir, exportar y ver histórico.

## Modelo de identidad mínimo y contrato de sesión/token

La identidad mínima de usuario en backend queda definida por:

- `userId` (`sub` en token)
- `role`
- `institution`
- `tenantId` (si no viene explícito en token, se deriva temporalmente desde `institution`)

Además, para trazabilidad y control de expiración de sesión:

- `sessionId`
- `exp` (epoch seconds)

### Contrato de token de sesión (`v1`)

- Transporte: `Authorization: Bearer <token>`.
- Formato: `v1.<payload_base64url>.<signature_base64url>`.
- Firma: `HMAC-SHA256("v1.<payload_base64url>", SESSION_TOKEN_SECRET)`.
- Payload requerido:
  - `sub`, `role`, `institution`, `tenantId`, `sessionId`, `exp` (`tenantId` puede omitirse temporalmente y derivarse desde `institution`).
- Validaciones mínimas:
  - firma válida,
  - campos obligatorios presentes,
  - token no expirado.

Normalización aplicada al `role` del payload (`v1`):

- Se aplica `trim` + minúsculas.
- Alias de negocio aceptado: `administrador` → `admin`.
- El rol normalizado es el que usa backend para RBAC y rate limiting.

Si falta o es inválido, backend responde `401` con `error.code = "auth_unauthorized"`.


### Flujo de sesión cliente → backend

1. El frontend obtiene/actualiza el token de sesión desde una única fuente (`sessionService`).
2. `buildAuthHeaders` adjunta `Authorization: Bearer <token>` para llamadas críticas: `POST /api/calificacion/sugerir`, `GET/POST /api/reportes`, `GET /api/reportes/:id`, `GET /api/reportes/:id/export` y endpoints de versionado (`GET /api/reportes/:id/versiones`, `GET /api/reportes/:id/versiones/:version`).
3. Si backend responde `401`, la UI muestra mensaje explícito de sesión expirada/inválida.
4. Si backend responde `403`, la UI muestra mensaje explícito de permiso insuficiente según RBAC.

### Aislamiento multi-tenant en reportes

- Cada `reporte` persistido incluye `ownership` con `tenantId`, `userId` y `role`, derivados de `req.user`.
- `GET /api/reportes` aplica aislamiento por `tenantId` y, para roles con alcance personal (`docente`, `corrector`), también por `userId`.
- `GET /api/reportes/:id`, `GET /api/reportes/:id/export`, `GET /api/reportes/:id/versiones` y `GET /api/reportes/:id/versiones/:version` validan ownership:
  - si el recurso existe pero pertenece a otro tenant/usuario, backend responde `403` (`auth_forbidden`);
  - si no existe, responde `404`.
- La auditoría en `audit_logs.metadata_json` registra `tenantId` y `sessionId` en `report_created` / `report_updated` para trazabilidad entre sesión y recurso.
- El campo `audit_logs.actor` en eventos de persistencia (`report_created`, `report_updated`, `final_grade_changed`, `report_deleted`) se deriva de `req.user.userId` validado por sesión firmada (`Authorization: Bearer <session-token>`), no de headers cliente como `x-actor`.
- Si llega `x-actor`, backend lo conserva solo como metadato no confiable (`untrustedActorHint`) dentro de `audit_logs.metadata_json`.

## RBAC por acción

Acciones críticas y mapeo de endpoints:

- `create_exam` → `POST /api/reportes`
- `correct_exam` → `POST /api/calificacion/sugerir`
- `export_report` → `GET /api/reportes/:id/export`
- `view_history` → `GET /api/reportes`, `GET /api/reportes/:id`, `GET /api/reportes/:id/versiones`, `GET /api/reportes/:id/versiones/:version`
- `delete_report` → `DELETE /api/reportes/:id`

Matriz de permisos final (marzo 2026):

- `admin`: `create_exam`, `correct_exam`, `export_report`, `view_history`, `delete_report` (control total de plataforma).
- `docente`: `create_exam`, `correct_exam`, `view_history`, `delete_report` (opera su flujo y puede eliminar recursos propios en su alcance).
- `coordinador`: `correct_exam`, `export_report`, `view_history`, `delete_report` (supervisión académica, exportación y eliminación en su tenant).
- `corrector`: `correct_exam`, `view_history` (corrección operativa sin alta de reportes).
- `auditor`: `view_history` (lectura para revisión y cumplimiento).

Alias RBAC aceptado para compatibilidad: `administrador` (en token) se normaliza a `admin`.

Si el usuario está autenticado pero sin permiso, backend responde `403` con `error.code = "auth_forbidden"`.

## Logging de denegaciones de autorización

Los eventos de denegación se registran en JSON como:

- `authentication_failed` (fallo de autenticación, 401)
- `authorization_denied` (falta de permiso por rol o por recurso, 403)

Ambos incluyen:

- `actor`: `{ userId, role }` cuando la identidad está disponible.
- `resource`: identificador del recurso o endpoint protegido.

Casos auditados de denegación (trazabilidad de roadmap):

- `401` por ausencia/token de sesión inválido sobre rutas protegidas (`/api/reportes`, `/api/reportes/:id/export`, `/api/calificacion/sugerir`): evento `authentication_failed`.
- `403` por rol sin permiso RBAC (por ejemplo `auditor` o `coordinador` en `POST /api/reportes`): evento `authorization_denied`.
- `403` por recurso fuera de alcance tenant/ownership (`/api/reportes/:id`, `/api/reportes/:id/export`, `DELETE /api/reportes/:id`): evento `report_scope_denied` con `actor` y `resource` enriquecido (`action`, `type`, `id`, `tenantId`, `endpoint`, `timestamp`).

## Catálogo de eventos auditables (reportes)

Eventos persistidos en `audit_logs`:

- `report_created`: alta de reporte.
- `report_updated`: actualización general de reporte.
- `final_grade_changed`: cambio explícito de decisión final docente (`calificacionFinal`).
- `report_deleted`: eliminación segura del reporte.
- `report_versions`: registro inmutable de snapshots por versión, incluyendo `actor` y `diff_json` de `calificacionFinal`.

Eventos de trazabilidad operacional en logs JSON (`stdout`):

- `report_exported`: exportación exitosa de `GET /api/reportes/:id/export`.
- `report_scope_denied`: denegación por alcance tenant/usuario en rutas de reporte.
- `authentication_failed` y `authorization_denied`: denegaciones por autenticación/RBAC.

Campos obligatorios de trazabilidad por evento auditable:

- `actor`: `userId`, `role` (y `tenantId` en eventos de reporte).
- `tenantId`: tenant efectivo del actor o del recurso.
- `resource`: identificador de recurso (`id`), endpoint lógico y tipo.
- `timestamp`: marca de tiempo ISO-8601 UTC.
- `requestId`: correlación extremo a extremo (logs operacionales).

## Riesgos mitigados

1. **Exposición por XSS de secretos en cliente**
   - Eliminado el almacenamiento de la key en navegador.

2. **Persistencia de credenciales en equipos compartidos**
   - No hay credenciales de Anthropic ni OpenAI persistidas en `localStorage`.

3. **Fuga accidental por UX o soporte**
   - Se elimina el campo visual de API key en ajustes.

## Riesgos remanentes y controles

1. **Compromiso del servidor o entorno**
   - Mitigar con control de accesos, hardening y rotación de secretos.

2. **Uso abusivo del endpoint interno**
   - Controlado con token interno y rate limiting en backend.
   - Recomendado adicional: autenticación de usuarios finales y trazabilidad por actor.

3. **Errores de configuración (`AI_PROVIDER`, API key y modelo)**
   - El backend valida configuración al invocar el proveedor y responde con `provider_config_error`.

## Recomendaciones operativas

- Administrar `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` vía secret manager (no en repositorio).
- Rotar credenciales periódicamente y ante cualquier sospecha de fuga.
- Registrar métricas de latencia/errores de `/api/calificacion/sugerir`.
- Estandarizar y centralizar logs JSON con `requestId`; ver `docs/observability.md`.
- Aplicar políticas de red (egress control) para limitar destinos salientes.
- Mantener `AI_REQUEST_TIMEOUT_MS` ajustado (default 20s) para evitar cuelgues y consumo excesivo.
- Validar payloads en backend (`datos` objeto y `puntaje` numérico) antes de consumir proveedor.
- Configurar `INTERNAL_AUTH_TOKEN` con un valor robusto (secreto aleatorio de alta entropía).
- Limitar exposición de red del backend para que el endpoint interno no sea público sin protección adicional.

## Notas operativas (token interno y límites)

- **Rotación de token interno:**
  1. Generar nuevo token y distribuirlo por secret manager.
  2. Actualizar consumidores internos para enviar el nuevo header.
  3. Reiniciar despliegues de backend y consumidores en una ventana coordinada.
  4. Revocar el token anterior y verificar ausencia de tráfico con credencial vieja.
- **Límites recomendados (punto de partida):**
  - `RATE_LIMIT_WINDOW_MS=60000` (1 minuto).
  - `RATE_LIMIT_MAX_REQUESTS=20` como límite base para roles no explícitos.
  - `RATE_LIMIT_MAX_REQUESTS_DOCENTE=20`, `RATE_LIMIT_MAX_REQUESTS_COORDINADOR=30`, `RATE_LIMIT_MAX_REQUESTS_ADMIN=40`.
  - `RATE_LIMIT_BUCKET_CLEANUP_INTERVAL_MS=30000` para limpieza periódica de buckets expirados.
  - `RATE_LIMIT_MAX_BUCKETS=5000` para tope de cardinalidad en memoria con descarte seguro.
  - `RATE_LIMIT_BUCKET_COUNT_LOG_INTERVAL_MS=30000` para telemetría de tamaño de mapa (`rate_limit_bucket_count`).
  - Si hay alta concurrencia legítima, subir gradualmente en pasos de 10 y observar tasa de `429` y `rate_limit_saturation`.
- **Estrategia de clave de rate limit (`RATE_LIMIT_KEY_STRATEGY`):**
  - `authenticated_or_token_or_ip` (recomendado): usa `tenantId + userId`; sin identidad, cae temporalmente a token interno o IP.
  - `authenticated`: intenta usar identidad autenticada (`tenantId + userId` o `tenantId:anonymous`); si no hay `tenantId`, cae a token interno o IP.
  - `token`: útil cuando consumidores internos usan token compartido y todavía no hay identidad de usuario.
  - `ip`: útil detrás de redes internas con IPs estables y tokens compartidos.
- **Códigos de error consistentes del endpoint:**
  - `401` → `error.code = "internal_auth_unauthorized"`
  - `429` → `error.code = "rate_limit_exceeded"`

## Variables de entorno mínimas

- `AI_PROVIDER` (opcional, default `anthropic`; valores: `anthropic`, `openai`)
- `ANTHROPIC_API_KEY` (obligatoria si `AI_PROVIDER=anthropic`)
- `ANTHROPIC_MODEL` (opcional, default `claude-sonnet-4-20250514`)
- `OPENAI_API_KEY` (obligatoria si `AI_PROVIDER=openai`)
- `OPENAI_MODEL` (opcional, default `gpt-4o-mini`)
- `AI_REQUEST_TIMEOUT_MS` (opcional, default `20000`)
- `INTERNAL_AUTH_TOKEN` (obligatoria para proteger `/api/calificacion/sugerir`)
- `INTERNAL_AUTH_HEADER` (opcional, default `x-internal-token`)
- `RATE_LIMIT_WINDOW_MS` (opcional, default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (opcional, default `20`)
- `RATE_LIMIT_MAX_REQUESTS_DOCENTE` (opcional, default `20`)
- `RATE_LIMIT_MAX_REQUESTS_COORDINADOR` (opcional, default `30`)
- `RATE_LIMIT_MAX_REQUESTS_ADMIN` (opcional, default `40`)
- `RATE_LIMIT_NEAR_THRESHOLD_RATIO` (opcional, default `0.8`)
- `RATE_LIMIT_KEY_STRATEGY` (opcional, default `authenticated_or_token_or_ip`; valores: `authenticated_or_token_or_ip`, `authenticated`, `token`, `ip`)
- `RATE_LIMIT_BUCKET_CLEANUP_INTERVAL_MS` (opcional, default `30000`)
- `RATE_LIMIT_MAX_BUCKETS` (opcional, default `5000`)
- `RATE_LIMIT_BUCKET_COUNT_LOG_INTERVAL_MS` (opcional, default `30000`)
- `PORT` (opcional, default `8787`)
