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

rubrics (plantillas versionadas)

rosters (listas por grupo/periodo) ────< roster_students (N)
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

### `rubrics`

- Catálogo durable de plantillas por tenant/materia/grado.
- Clave primaria: `id`.
- Restricción de unicidad: `(tenant_id, materia, grado)`.
- Campos: `tenant_id`, `materia`, `grado`, `current_version`, `created_at`, `updated_at`.

### `rubric_versions`

- Historial inmutable de versiones por rúbrica.
- FK: `rubric_id -> rubrics.id`.
- Restricción de unicidad: `(rubric_id, version_number)`.
- Campos: `criterios_json`, `reglas_json`, `created_by`, `created_at`.
- Regla de versionado:
  - primera creación de plantilla: inserta `version_number = 1`;
  - edición de plantilla existente: inserta `n+1` y actualiza `rubrics.current_version`.
- Endpoints backend:
  - `GET /api/rubricas` admite filtros `materia`, `grado`, `version`, `rubricId`, `vigente`, `historial`.
  - `POST /api/rubricas` crea una nueva plantilla o una nueva versión incremental si ya existe plantilla para el mismo `id` o para la misma combinación `materia + grado` en el tenant.

### `rosters`

- Lista nominal de un grupo en un periodo académico.
- Clave primaria: `id`.
- Restricción de unicidad: `(group_name, term)`.
- Campos: `group_name`, `term`, `created_at`, `updated_at`.

### `roster_students`

- Integrantes de una lista nominal (`rosters`).
- FK: `roster_id -> rosters.id` con borrado en cascada.
- Restricción de unicidad: `(roster_id, student_enrollment)`.
- Campos: `student_name`, `student_enrollment`, timestamps.
- Endpoints backend:
  - `GET /api/rosters` acepta filtros `group` y `term`.
  - `GET /api/rosters/:id` devuelve lista con su arreglo `students`.
  - `POST /api/rosters` crea lista (`group`, `term`, `students`).
  - `PUT /api/rosters/:id` reemplaza metadatos y estudiantes.
  - `DELETE /api/rosters/:id` elimina la lista y sus estudiantes.

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
- **v5**: tablas `rubrics` + `rubric_versions` con índices y constraints de versionado durable por tenant.
- **v6**: tablas `rosters` + `roster_students` para membresía de aula por grupo/periodo.

Las migraciones viven en `backend/db/migrate.js`, y `backend/db/schema.sql` representa el estado consolidado esperado al final.

## Seed de datos mínimo (determinístico)

Se incluye `backend/db/seed.js` para poblar un dataset mínimo reproducible sobre:

- `schools`
- `groups`
- `exams`
- `students`
- `submissions`
- `grades`
- `reports`
- `audit_logs`

Características del seed:

- IDs con prefijo `seed_` para aislamiento operativo.
- Timestamps fijos y datos estables para pruebas manuales.
- Ejecución **idempotente**: limpia registros seed previos y reinserta el dataset completo.
- Validación rápida con conteos esperados por tabla (falla si una tabla queda incompleta).

Orden recomendado:

1. `npm run db:migrate`
2. `npm run db:seed`

## Garantía transaccional

Cada operación de persistencia de reportes ejecuta en una misma transacción SQL:

### Crear/actualizar reporte

1. upsert de `schools/groups/exams/students`.
2. upsert de `submissions`.
3. upsert de `grades`.
4. upsert de snapshot en `reports`.
5. inserción en `report_versions` con incremento de `version_number`.
6. inserción en `audit_logs`.

### Eliminar reporte

1. borrado de `reports` y su `submission` asociada.
2. limpieza de huérfanos en `exams/groups/schools/students`.
3. inserción de `audit_logs` de acción `report_deleted`.
4. `COMMIT`.

Si falla cualquier paso (incluyendo auditoría), se revierte toda la transacción para evitar borrados parciales.

## Indicadores mínimos de respaldo (modelo operativo)

Para asegurar recuperabilidad del dato, el modelo operativo incorpora estos indicadores mínimos (expuestos en observabilidad y runbooks):

- **Edad del último backup (`backup_last_age_minutes`)**  
  Diferencia en minutos entre `now` y timestamp del último backup exitoso.
- **Tasa de éxito de backups (`backup_success_rate_24h`)**  
  `backups_exitosos_24h / backups_totales_24h`.
- **Tiempo de restore (`restore_duration_seconds`)**  
  Duración de un restore validado de inicio a fin (incluye validación de integridad).

Estos indicadores deben registrarse por ambiente (`dev`, `staging`, `prod`) y conservar evidencia asociada de restore drill en CI.
