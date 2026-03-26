# ADR 0007: Persistencia de reportes en backend con auditoría

## Contexto

Hasta este sprint, el historial de reportes se guardaba en `localStorage` del navegador. Esto impedía compartir datos entre dispositivos, centralizar auditoría y preparar integraciones futuras.

Se requiere:

- Un esquema inicial de datos para `reports` y `audit_logs`.
- Endpoints backend para crear/listar/consultar reportes.
- Registro de auditoría con actor y timestamp para creación/edición.
- Mantener compatibilidad gradual con frontend existente.

## Decisión

Se adopta persistencia backend basada en un almacén JSON versionado (`backend/db/data.json`) con esquema lógico SQL documentado en `backend/db/schema.sql`.

Se incorpora un repositorio de acceso a datos (`backend/repositories/reportRepository.js`) con operaciones:

- `createReport`
- `getReportById`
- `listReports`
- `updateReport` (extensión necesaria para auditoría de edición)

Se publican endpoints:

- `POST /api/reportes` (creación/edición por upsert basado en `id`)
- `GET /api/reportes`
- `GET /api/reportes/:id`

El frontend intenta backend primero y conserva fallback a `localStorage` cuando el backend no está disponible.

## Consecuencias

### Positivas

- Persistencia centralizada para reportes.
- Trazabilidad de acciones en `audit_logs`.
- Base técnica para migrar completamente fuera de `localStorage`.

### Trade-offs

- Almacén JSON no es concurrente ni transaccional como una base de datos relacional real.
- El endpoint `POST /api/reportes` mezcla creación y edición para acelerar integración del sprint.

### Riesgos y mitigaciones

- **Riesgo:** corrupción del archivo de datos.
  - **Mitigación:** inicialización defensiva y normalización de estructura al leer.
- **Riesgo:** divergencia de datos entre backend y fallback local.
  - **Mitigación:** backend como fuente primaria cuando está disponible.
