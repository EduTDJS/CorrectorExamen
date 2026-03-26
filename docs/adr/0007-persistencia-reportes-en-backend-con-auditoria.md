# ADR 0007: Persistencia de reportes en backend con auditoría

**Estado:** Aceptada (actualizada el 26 de marzo de 2026).

## Contexto

Hasta este sprint, el historial de reportes se guardaba en `localStorage` del navegador. Esto impedía compartir datos entre dispositivos, centralizar auditoría y preparar integraciones futuras.

Se requiere:

- Un esquema inicial de datos para `reports` y `audit_logs`.
- Endpoints backend para crear/listar/consultar reportes.
- Registro de auditoría con actor y timestamp para creación/edición.
- Mantener compatibilidad gradual con frontend existente.

## Decisión

Se adopta persistencia backend relacional con SQLite (`backend/db/data.sqlite`) y migraciones SQL versionadas en `backend/db/schema.sql`.

Se incorpora un adaptador de acceso a BD relacional (`backend/db/`) con cliente, pool, errores de infraestructura y control de timeouts. El repositorio SQL (`backend/repositories/reportRepository.js`) implementa:

- `createReport`
- `getReportById`
- `listReports`
- `updateReport` (extensión necesaria para auditoría de edición)

Se publican endpoints:

- `POST /api/reportes` (creación/edición por upsert basado en `id`)
- `GET /api/reportes`
- `GET /api/reportes/:id`

El frontend intenta backend primero y conserva fallback a `localStorage` cuando el backend no está disponible.

Se define fallback JSON del backend **solo para desarrollo local** y detrás de flag explícito (`REPORTS_STORAGE_DEV_FALLBACK=true`), separado del flujo estándar de producción.

## Consecuencias

### Positivas

- Persistencia centralizada para reportes.
- Trazabilidad de acciones en `audit_logs`.
- Atomicidad en escrituras de reporte + auditoría mediante transacciones.
- Base técnica para migrar completamente fuera de `data.json` como almacenamiento primario.

### Trade-offs

- SQLite embebido simplifica operación, pero requiere disciplina de migraciones y gestión de archivo.
- El endpoint `POST /api/reportes` mantiene upsert por compatibilidad de cliente.

### Riesgos y mitigaciones

- **Riesgo:** lock de archivo o timeout bajo carga.
  - **Mitigación:** `busy_timeout`, journal WAL, pool singleton y timeout configurable.
- **Riesgo:** divergencia de datos entre backend y fallback local.
  - **Mitigación:** backend SQL como fuente primaria y fallback restringido a entorno local de desarrollo.
