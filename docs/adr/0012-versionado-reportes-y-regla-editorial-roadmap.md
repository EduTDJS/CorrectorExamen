# ADR 0012: Versionado de reportes con snapshot+diff y cumplimiento editorial del roadmap

## Contexto

El roadmap prioriza versionado de reportes y exige trazabilidad documental consistente cuando cambia una decisión técnica. Hasta ahora existía auditoría de eventos (`audit_logs`), pero no una tabla dedicada para consultar versiones inmutables de cada reporte.

Además, la regla editorial del roadmap requiere que cambios arquitectónicos se documenten mediante ADR nuevo o actualización explícita de ADR existente.

## Decisión

1. Se introduce `report_versions` como historial inmutable por `report_id` con:
   - `id`, `report_id`, `version_number`, `snapshot_json`, `diff_json`, `actor`, `created_at`.
2. Cada operación de persistencia de reporte inserta una versión en la misma transacción SQL del upsert principal.
3. Se hace backfill inicial para datos existentes en `reports`, creando versión `1` por cada reporte previo.
4. El diff mínimo persistido se centra en `calificacionFinal` para permitir trazabilidad funcional de cambios docentes.
5. Se habilitan endpoints de consulta:
   - `GET /api/reportes/:id/versiones`
   - `GET /api/reportes/:id/versiones/:version`
   reutilizando el mismo scope RBAC y aislamiento tenant/usuario que los endpoints de reportes.
6. Este ADR cumple explícitamente la regla editorial obligatoria del roadmap para cambios de persistencia.

## Consecuencias

### Positivas

- Se obtiene historial consultable y reproducible por versión de reporte.
- Los cambios de `calificacionFinal` quedan trazados en forma estructurada (`diff_json`) y por actor.
- El control de acceso sigue unificado con la semántica existente de ownership.
- Se mejora la capacidad de auditoría y debugging sin romper compatibilidad del snapshot `reports`.

### Trade-offs

- Incremento de almacenamiento por snapshots versionados.
- Mayor costo de escritura por inserción adicional por operación de persistencia.
- Se mantiene una estrategia de diff mínima (focalizada), no un diff semántico completo de todo el payload.

### Riesgos y mitigaciones

- **Riesgo:** crecimiento de tabla `report_versions` con alto volumen.
  - **Mitigación:** índices por `report_id/version_number` y `report_id/created_at`; política futura de archivado.
- **Riesgo:** inconsistencias si la inserción de versión queda fuera de transacción.
  - **Mitigación:** inserción acoplada al mismo `BEGIN IMMEDIATE ... COMMIT` de persistencia.
