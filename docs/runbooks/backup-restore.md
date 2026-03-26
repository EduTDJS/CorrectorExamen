# Runbook técnico: backup y restore de base de datos

## Objetivo

Definir el procedimiento operativo estándar para respaldos de SQLite (`backend/db/data.sqlite`), recuperación validada, y evidencia auditable de pruebas de restore.

## Alcance

- Entornos: `dev`, `staging`, `prod`.
- Base de datos: almacenamiento de reportes y auditoría (`reports`, `audit_logs`, `submissions`, `grades`).
- Scripts operativos: `backend/db/backup-dump.js`, `backend/db/restore-dump.js`, `backend/db/restore-drill.js`.

## Política de frecuencia de backups

- **Producción (`prod`)**: backup incremental lógico cada **6 horas** + backup diario de cierre.
- **Staging (`staging`)**: backup diario.
- **Desarrollo (`dev`)**: backup semanal o antes de migraciones/cambios de esquema.

> Referencia operativa: ejecutar `npm run db:backup` con scheduler del entorno (cron o pipeline).

## Política de retención por ambiente

- **prod**
  - Backups cada 6 horas: retención de **14 días**.
  - Backups diarios: retención de **90 días**.
  - Evidencia de restore drill: retención mínima de **180 días**.
- **staging**
  - Backups diarios: retención de **30 días**.
  - Evidencia de restore drill: retención mínima de **90 días**.
- **dev**
  - Backups semanales: retención de **14 días**.

## Objetivos de continuidad (SLO de recuperación)

- **RPO objetivo**
  - `prod`: **<= 6 horas**.
  - `staging`: **<= 24 horas**.
  - `dev`: **<= 7 días**.
- **RTO objetivo**
  - `prod`: **<= 30 minutos** para restauración base + validación.
  - `staging`: **<= 60 minutos**.
  - `dev`: **<= 120 minutos**.

## Procedimiento de backup (validado)

1. Definir DB origen (opcional):
   - `export REPORTS_DB_FILE=/ruta/a/data.sqlite`
2. Ejecutar backup:
   - `npm run db:backup`
3. Confirmar salida:
   - archivo `*.sqlite`
   - evidencia `*.sqlite.evidence.json`
4. Validación automática incluida por script:
   - `PRAGMA integrity_check` en origen y backup.
   - comparación de conteos de tablas críticas.

## Procedimiento de restore validado

1. Seleccionar backup origen:
   - ejemplo: `backend/db/backups/backup-2026-03-26-120000000.sqlite`
2. Ejecutar restore a objetivo (idealmente sandbox/temporal):
   - `npm run db:restore -- --backup <ruta-backup> --target <ruta-restore.sqlite>`
3. Revisar evidencia generada:
   - `<ruta-restore.sqlite>.evidence.json`
4. Criterio de éxito:
   - `PRAGMA integrity_check = ok`.
   - conteos de `reports`, `audit_logs`, `submissions`, `grades` idénticos entre backup y restore.
5. Si falla:
   - no promover restore a productivo.
   - abrir incidente y conservar evidencia JSON para análisis de causa raíz.

## Restore drill periódico (prueba de restauración)

- Ejecución automática por CI en job programado (`restore-drill`).
- Script: `npm run db:restore:drill`.
- Evidencia esperada:
  - `artifacts/restore-drill/restore-drill-evidence.json`
  - logs del job CI.

## Roles y responsabilidades

- **DevOps/SRE**: mantenimiento de scheduler y retención de artefactos.
- **Equipo backend**: mantenimiento de scripts y validaciones de integridad.
- **Responsable de seguridad/compliance**: auditoría de evidencia de restore drills.

## Checklist operativo rápido

- [ ] Backup ejecutado en ventana esperada.
- [ ] Evidencia JSON generada sin errores.
- [ ] Restore drill del período actual en estado `ok`.
- [ ] Retención y artefactos dentro de política por ambiente.
