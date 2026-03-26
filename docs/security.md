# Seguridad: integración IA multi-proveedor con backend propio

La aplicación usa un modelo **server-side** donde los secretos de proveedores (`Anthropic` y `OpenAI`) viven únicamente en el backend.

## Estado actual

- El frontend no solicita ni almacena API keys del proveedor.
- La UI invoca `POST /api/calificacion/sugerir` en el backend propio.
- El backend selecciona proveedor por `AI_PROVIDER` y firma la llamada saliente con:
  - `ANTHROPIC_API_KEY` (Anthropic)
  - `OPENAI_API_KEY` (OpenAI)
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
   - Recomendado: autenticación de usuarios, rate limiting y trazabilidad.

3. **Errores de configuración (`AI_PROVIDER`, API key y modelo)**
   - El backend valida configuración al invocar el proveedor y responde con `provider_config_error`.

## Recomendaciones operativas

- Administrar `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` vía secret manager (no en repositorio).
- Rotar credenciales periódicamente y ante cualquier sospecha de fuga.
- Registrar métricas de latencia/errores de `/api/calificacion/sugerir`.
- Aplicar políticas de red (egress control) para limitar destinos salientes.
- Mantener `AI_REQUEST_TIMEOUT_MS` ajustado (default 20s) para evitar cuelgues y consumo excesivo.
- Validar payloads en backend (`datos` objeto y `puntaje` numérico) antes de consumir proveedor.

## Variables de entorno mínimas

- `AI_PROVIDER` (opcional, default `anthropic`; valores: `anthropic`, `openai`)
- `ANTHROPIC_API_KEY` (obligatoria si `AI_PROVIDER=anthropic`)
- `ANTHROPIC_MODEL` (opcional, default `claude-sonnet-4-20250514`)
- `OPENAI_API_KEY` (obligatoria si `AI_PROVIDER=openai`)
- `OPENAI_MODEL` (opcional, default `gpt-4o-mini`)
- `AI_REQUEST_TIMEOUT_MS` (opcional, default `20000`)
- `PORT` (opcional, default `8787`)
