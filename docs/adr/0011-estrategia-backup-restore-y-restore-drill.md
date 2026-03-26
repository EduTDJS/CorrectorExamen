# ADR 0011: Estrategia de backup/restore con validación de integridad y restore drill periódico

- **Fecha:** 2026-03-26
- **Alcance:** `backend/db/backupUtils.js`, `backend/db/backup-dump.js`, `backend/db/restore-dump.js`, `backend/db/restore-drill.js`, `.github/workflows/ci.yml`, `docs/runbooks/backup-restore.md`, `docs/data-model.md`, `docs/observability.md`, `package.json`
- **Motivación:** formalizar una capacidad mínima de recuperación de datos con objetivos explícitos (RPO/RTO), scripts operativos reutilizables y evidencia periódica de restore en CI.

## Contexto

El sistema ya persistía reportes y auditoría en SQLite, pero no tenía una política consolidada de respaldo y restauración con pruebas periódicas automatizadas.

Riesgos identificados:

1. No detectar corrupción o inconsistencia de backup hasta un incidente real.
2. Ausencia de evidencia auditable de drills de recuperación.
3. Falta de indicadores operativos para evaluar cumplimiento de RPO/RTO.

## Decisión

Se adopta la siguiente estrategia:

1. **Runbook técnico** con frecuencia, retención por ambiente, objetivos RPO/RTO y restore validado.
2. **Scripts operativos dedicados**:
   - `db:backup` para generar backup SQLite + evidencia.
   - `db:restore` para restaurar backup y validar integridad/conteos.
   - `db:restore:drill` para prueba periódica end-to-end con evidencia JSON.
3. **Automatización periódica en CI**:
   - Job programado (`schedule`) y manual (`workflow_dispatch`) para ejecutar restore drill y publicar artefacto de evidencia.
4. **Observabilidad mínima de respaldos**:
   - edad del último backup,
   - tasa de éxito,
   - tiempo de restore.

## Consecuencias

### Positivas

- Recuperación más predecible mediante procedimientos repetibles y verificables.
- Evidencia auditable en cada restore drill programado.
- Mayor capacidad para detectar degradación de continuidad antes de incidentes críticos.

### Trade-offs

- Incremento de complejidad operativa (scripts, artefactos y alertas).
- Costo de cómputo/tiempo en CI por ejecución periódica de drill.

### Riesgos y mitigaciones

- **Riesgo:** falsa sensación de seguridad por validar solo un escenario simple.
  - **Mitigación:** evolucionar drills con datasets más realistas por ambiente.
- **Riesgo:** crecimiento de artefactos de evidencia.
  - **Mitigación:** política de retención explícita por ambiente y cleanup programado.
- **Riesgo:** dependencia de binario `sqlite3` en entornos CI.
  - **Mitigación:** fijar runner con soporte SQLite y validar precondiciones en pipeline.
