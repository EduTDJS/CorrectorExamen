# ADR 0010: Matriz RBAC final y auditoría de denegaciones por recurso

- **Fecha:** 2026-03-26
- **Alcance:** `backend/middleware/authorize.js`, `backend/server.js`, `backend/server.test.js`, `docs/security.md`
- **Motivación:** cerrar brecha entre matriz RBAC teórica y controles efectivos en endpoints críticos, asegurando además trazabilidad explícita de denegaciones `401/403` por rol y por recurso.

## Contexto

El ADR 0008 introdujo el modelo de identidad y una matriz RBAC inicial, pero la implementación mantenía permisos demasiado amplios para varios roles y no auditaba de forma explícita todas las denegaciones vinculadas a ownership de recurso (cross-tenant o cross-user).

Los criterios del roadmap de seguridad exigen:

1. Rechazo consistente de accesos no autorizados (`401/403`) en endpoints críticos.
2. Evidencia auditable con actor, recurso y timestamp.
3. Documentación sincronizada entre código, pruebas y política de seguridad.

## Decisión

Se adopta una **matriz RBAC final** con separación real por rol:

- `admin`: `create_exam`, `correct_exam`, `export_report`, `view_history`.
- `docente`: `create_exam`, `correct_exam`, `view_history`.
- `coordinador`: `correct_exam`, `export_report`, `view_history`.
- `corrector`: `correct_exam`, `view_history`.
- `auditor`: `view_history`.

Y se alinean los endpoints protegidos a acciones:

- `POST /api/reportes` → `create_exam`.
- `GET /api/reportes` y `GET /api/reportes/:id` → `view_history`.
- `GET /api/reportes/:id/export` → `export_report`.
- `POST /api/calificacion/sugerir` → `correct_exam`.

Adicionalmente, toda denegación por recurso fuera de ownership (tenant/usuario) también se registra como `authorization_denied` con `actor` y `resource`.

## Consecuencias

### Positivas

- Menor superficie de privilegios por rol (principio de mínimo privilegio).
- Trazabilidad homogénea de denegaciones `401/403` tanto por RBAC como por alcance de recurso.
- Cobertura de pruebas de autorización por rol y por recurso para endpoints críticos.

### Trade-offs

- Cambios de comportamiento para integraciones que asumían permisos previos más amplios (ej. `docente` exportando o `auditor` exportando).
- Mayor dependencia de documentación y pruebas para evitar regresiones de autorización.

### Riesgos y mitigaciones

- **Riesgo:** confusión operativa por cambios de permisos.
  - **Mitigación:** documentar matriz final en `docs/security.md` y ADR explícito con fecha/alcance.
- **Riesgo:** falsos negativos en auditoría de seguridad.
  - **Mitigación:** pruebas automáticas que validan eventos `authentication_failed` y `authorization_denied` en logs estructurados.
