# Seguridad: integración IA multi-proveedor con backend propio

La aplicación usa un modelo **server-side** donde los secretos de proveedores (`Anthropic` y `OpenAI`) viven únicamente en el backend.

## Estado actual

- El frontend no solicita ni almacena API keys del proveedor.
- La UI invoca `POST /api/calificacion/sugerir` en el backend propio.
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

Si falta o es inválido, backend responde `401` con `error.code = "auth_unauthorized"`.

## RBAC por acción

Acciones críticas y mapeo de endpoints:

- `create_exam` → `POST /api/reportes`
- `correct_exam` → `POST /api/calificacion/sugerir`
- `export_report` → `GET /api/reportes/:id/export`
- `view_history` → `GET /api/reportes`, `GET /api/reportes/:id`

Matriz de permisos inicial:

- `admin`: todas las acciones.
- `docente`: todas las acciones.
- `coordinador`: todas las acciones.
- `corrector`: `correct_exam`, `view_history`.
- `auditor`: `export_report`, `view_history`.

Si el usuario está autenticado pero sin permiso, backend responde `403` con `error.code = "auth_forbidden"`.

## Logging de denegaciones de autorización

Los eventos de denegación se registran en JSON como:

- `authentication_failed` (fallo de autenticación, 401)
- `authorization_denied` (falta de permiso, 403)

Ambos incluyen:

- `actor`: `{ userId, role }` cuando la identidad está disponible.
- `resource`: identificador del recurso o endpoint protegido.

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
  - Si hay alta concurrencia legítima, subir gradualmente en pasos de 10 y observar tasa de `429` y `rate_limit_saturation`.
- **Estrategia de clave de rate limit (`RATE_LIMIT_KEY_STRATEGY`):**
  - `authenticated_or_token_or_ip` (recomendado): usa `tenantId + userId`; sin identidad, cae temporalmente a token interno o IP.
  - `authenticated`: intenta usar solo identidad autenticada (`tenantId + userId` o `tenantId:anonymous`).
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
- `PORT` (opcional, default `8787`)
