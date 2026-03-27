# Modelo de datos

Este documento describe el modelo lógico actualizado para persistencia de reportes en backend.

## ER lógico (núcleo normalizado)

```text
schools (1) ────< groups (N) ────< exams (N) ────< submissions (N) >──── (1) students
                                                        |
                                                        └──── (1) grades

reports (snapshot/proyección 1:1 con submissions por report_id)
   |
   ├────< report_versions (N)
   |
   └────< audit_logs (N)
```

## Entidades núcleo

### `schools`
- Representa institución/tenant.
- Clave primaria: `id`.
- Campos principales: `tenant_id`, `name`, `created_at`, `updated_at`.

### `groups`
- Cohorte o sección del examen.
- FK: `school_id -> schools.id`.
- Campos: `name`, `exam_date`, timestamps.

### `exams`
- Configuración del examen.
- FK: `group_id -> groups.id`.
- Campos: `subject`, `exam_date`, `total_questions`, `answer_key`.

### `students`
- Catálogo de estudiantes.
- FK opcionales: `school_id`, `group_id`.
- Campos: `name`, `enrollment` (matrícula), timestamps.

### `submissions`
- Entrega de un estudiante para un examen.
- FK: `exam_id`, `student_id`.
- Relación 1:1 con `reports` por `report_id` (único).
- Campos: `submitted_at`, `responses_json`, `source_text`, `ownership_json`.

### `grades`
- Resultado evaluado de una entrega.
- FK única: `submission_id -> submissions.id`.
- Campos: `score`, `letter`, `teacher_justification`, `question_scores_json`, `ai_justifications_json`.

### `audit_logs`
- Bitácora de acciones de persistencia.
- FK: `report_id -> reports.id`.
- Campos: `action`, `actor`, `created_at`, `metadata_json`.

### `report_versions`
- Historial inmutable de snapshots por reporte.
- FK: `report_id -> reports.id`.
- Restricción de unicidad: `(report_id, version_number)`.
- Campos: `snapshot_json`, `diff_json`, `actor`, `created_at`.
- Regla de versionado:
  - creación de reporte: genera versión `1` con `diff_json = {}`.
  - cada actualización: inserta versión `n+1` y persiste diff mínimo sobre `calificacionFinal`.

## Proyección/snapshot

### `reports`

Se mantiene para compatibilidad y lectura rápida como snapshot serializado del reporte completo:

```json
{
  "id": "report_*",
  "submission_id": "submission_report_*",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "payload_json": "{...reporte serializado...}"
}
```

`reports` no reemplaza al núcleo normalizado; funciona como proyección para compatibilidad de API y exportación.

## Migraciones versionadas

El backend aplica migraciones incrementales con control de versión en `schema_migrations`:

- **v1**: `reports` + `audit_logs` (modelo legacy).
- **v2**: tablas normalizadas (`schools`, `groups`, `exams`, `students`, `submissions`, `grades`) + `reports.submission_id`.
- **v3**: backfill inicial desde snapshots legacy cuando existe data previa.
- **v4**: tabla `report_versions` + backfill inicial (versión `1`) desde `reports`.

Las migraciones viven en `backend/db/migrate.js`, y `backend/db/schema.sql` representa el estado consolidado esperado al final.

## Garantía transaccional

Cada operación de creación/actualización de reportes ejecuta en una misma transacción SQL:

1. upsert de `schools/groups/exams/students`.
2. upsert de `submissions`.
3. upsert de `grades`.
4. upsert de snapshot en `reports`.
5. inserción en `report_versions` con incremento de `version_number`.
6. inserción en `audit_logs`.

Si falla un paso, se revierte toda la transacción.

## Indicadores mínimos de respaldo (modelo operativo)

Para asegurar recuperabilidad del dato, el modelo operativo incorpora estos indicadores mínimos (expuestos en observabilidad y runbooks):

- **Edad del último backup (`backup_last_age_minutes`)**  
  Diferencia en minutos entre `now` y timestamp del último backup exitoso.
- **Tasa de éxito de backups (`backup_success_rate_24h`)**  
  `backups_exitosos_24h / backups_totales_24h`.
- **Tiempo de restore (`restore_duration_seconds`)**  
  Duración de un restore validado de inicio a fin (incluye validación de integridad).

Estos indicadores deben registrarse por ambiente (`dev`, `staging`, `prod`) y conservar evidencia asociada de restore drill en CI.
