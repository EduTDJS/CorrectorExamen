# ADR 0014: Módulo de rúbricas versionadas para plantillas y scoring docente

## Contexto

El flujo de corrección requería configuración manual repetitiva de clave y criterios por examen. Además, el cálculo de puntaje no tenía un punto explícito para aplicar reglas pedagógicas por materia/grado ni ajustes manuales por pregunta.

## Decisión

Se incorpora un módulo de dominio de rúbricas con contrato mínimo versionado:

- `id`
- `materia`
- `grado`
- `criterios[]`
- `reglasPenalizacionBonificacion`
- `version`

Se implementa persistencia backend durable (SQLite) mediante `backend/repositories/rubricRepository.js` y endpoints:

- `GET /api/rubricas`
- `POST /api/rubricas`

Modelo persistido:

- `rubrics`: catálogo por (`tenant_id`, `materia`, `grado`) con `current_version`.
- `rubric_versions`: historial inmutable con `version_number` incremental, `criterios_json`, `reglas_json`, `created_by`.

Regla de escritura:

- Si la plantilla no existe en el tenant, se crea `version=1`.
- Si existe (por `id` o por `materia+grado`), `POST /api/rubricas` crea una nueva versión `n+1` y actualiza `current_version`.

En frontend:

- `StepConfiguracion` agrega selector de plantilla.
- `useExamWorkflow` centraliza carga/selección de rúbricas.
- `rubricScoring` aplica criterios y reglas de bonificación/penalización.
- `StepRevision` habilita override manual docente por pregunta.

## Consecuencias

### Positivas

- Menor tiempo de configuración inicial por reutilizar plantillas.
- Scoring más trazable por criterio aplicado.
- Soporte explícito para intervención docente con override manual.

### Trade-offs y riesgos

- Se incrementa complejidad del estado en frontend.
- El historial durable añade costo de almacenamiento y requiere política de mantenimiento si el número de versiones crece sin control.
