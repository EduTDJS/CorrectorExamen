# Seguridad: integración IA con backend propio

La aplicación migró de un modelo donde la API key de Anthropic se guardaba en `localStorage` a un modelo **server-side** donde el secreto vive únicamente en el backend.

## Estado actual

- El frontend ya no solicita ni almacena API keys del proveedor.
- La UI invoca `POST /api/calificacion/sugerir` en el backend propio.
- El backend firma la llamada a Anthropic usando `ANTHROPIC_API_KEY` desde variables de entorno.

## Riesgos mitigados

1. **Exposición por XSS de secretos en cliente**
   - Eliminado el almacenamiento de la key en navegador.

2. **Persistencia de credenciales en equipos compartidos**
   - Ya no hay credenciales de Anthropic persistidas en `localStorage`.

3. **Fuga accidental por UX o soporte**
   - Se elimina el campo visual de API key en ajustes.

## Riesgos remanentes y controles

1. **Compromiso del servidor o entorno**
   - Mitigar con control de accesos, hardening y rotación de secretos.

2. **Uso abusivo del endpoint interno**
   - Recomendado: autenticación de usuarios, rate limiting y trazabilidad.

3. **Errores de configuración (`ANTHROPIC_API_KEY`)**
   - El backend responde con error explícito si la variable no existe.

## Recomendaciones operativas

- Administrar `ANTHROPIC_API_KEY` vía secret manager (no en repositorio).
- Rotar credenciales periódicamente y ante cualquier sospecha de fuga.
- Registrar métricas de latencia/errores de `/api/calificacion/sugerir`.
- Aplicar políticas de red (egress control) para limitar destinos salientes.

## Variables de entorno mínimas

- `ANTHROPIC_API_KEY` (obligatoria)
- `ANTHROPIC_MODEL` (opcional, por defecto `claude-sonnet-4-20250514`)
- `PORT` (opcional, por defecto `8787`)
