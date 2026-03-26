# Seguridad: integración IA multi-proveedor con backend propio

La aplicación usa un modelo **server-side** donde los secretos de proveedores (`Anthropic` y `OpenAI`) viven únicamente en el backend.

## Estado actual

- El frontend no solicita ni almacena API keys del proveedor.
- La UI invoca `POST /api/calificacion/sugerir` en el backend propio.
- El backend selecciona proveedor por `AI_PROVIDER` y firma la llamada saliente con:
  - `ANTHROPIC_API_KEY` (Anthropic)
  - `OPENAI_API_KEY` (OpenAI)
- El endpoint `POST /api/calificacion/sugerir` exige token interno en header (`X-Internal-Token` por defecto).
- El backend aplica rate limiting configurable por ventana y límite máximo.
- El backend expone `GET /api/calificacion/proveedor` sin secretos, solo metadatos operativos (proveedor/modelo/timeout).

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
  - `RATE_LIMIT_MAX_REQUESTS=20` por token/IP para entornos internos pequeños.
  - Si hay alta concurrencia legítima, subir gradualmente en pasos de 10 y observar tasa de `429`.
- **Estrategia de clave de rate limit (`RATE_LIMIT_KEY_STRATEGY`):**
  - `token_or_ip` (recomendado): usa token cuando existe, si no cae a IP.
  - `token`: útil cuando todos los consumidores internos siempre envían token.
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
- `RATE_LIMIT_KEY_STRATEGY` (opcional, default `token_or_ip`; valores: `token`, `ip`, `token_or_ip`)
- `PORT` (opcional, default `8787`)
