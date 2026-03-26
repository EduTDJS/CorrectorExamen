# ADR 0008: Modelo de identidad mínimo y RBAC en backend

## Contexto

El backend ya protegía `POST /api/calificacion/sugerir` con un token interno de servicio (`INTERNAL_AUTH_TOKEN`), pero no tenía:

- identidad de usuario final adjunta a cada request,
- autorización por rol/acción en endpoints críticos,
- trazabilidad homogénea de denegaciones por falta de autenticación/autorización.

Además, el sistema requiere permisos explícitos para acciones de negocio: crear examen, corregir, exportar y ver histórico.

## Decisión

Se adopta un modelo de seguridad en dos capas:

1. **Autenticación de sesión de usuario (Bearer token firmado) en backend**
   - Header: `Authorization: Bearer <token>`.
   - Contrato del token (versión `v1`):
     - Formato: `v1.<payload_base64url>.<signature_base64url>`.
     - Firma: `HMAC-SHA256("v1.<payload>", SESSION_TOKEN_SECRET)`.
     - Payload mínimo requerido:
       - `sub` (userId)
       - `role`
       - `institution`
       - `sessionId`
       - `exp` (epoch seconds)

2. **Autorización RBAC por acción**
   - Acciones controladas:
     - `create_exam`
     - `correct_exam`
     - `export_report`
     - `view_history`
   - Matriz inicial:
     - `admin`: todas
     - `docente`: todas
     - `corrector`: `correct_exam`, `view_history`
     - `auditor`: `export_report`, `view_history`

Además:

- Se agrega endpoint `GET /api/reportes/:id/export` para flujo de exportación backend.
- Se estandariza logging de denegaciones (`authentication_failed`, `authorization_denied`) incluyendo `actor` (`userId`, `role`) y `resource`.

## Consecuencias

### Positivas

- Se separan responsabilidades de autenticación y autorización.
- Se reduce riesgo de acceso indebido a endpoints sensibles.
- Mejoran auditoría y diagnósticos con eventos de denegación trazables.

### Trade-offs

- Aumenta complejidad operativa por gestión de `SESSION_TOKEN_SECRET` y emisión/rotación de tokens de sesión.
- Requiere al cliente enviar siempre Bearer token válido incluso en rutas de lectura de reportes.

### Riesgos y mitigaciones

- **Riesgo:** configuración ausente de `SESSION_TOKEN_SECRET`.
  - **Mitigación:** falla explícita con `500 auth_config_error`.
- **Riesgo:** desalineación de roles y permisos reales de negocio.
  - **Mitigación:** centralizar matriz `PERMISSIONS_BY_ROLE` y versionar cambios vía nuevos ADR.
