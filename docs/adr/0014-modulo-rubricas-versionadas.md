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

Se implementa persistencia backend mediante `backend/repositories/rubricRepository.js` y endpoints:

- `GET /api/rubricas`
- `POST /api/rubricas`

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
- La persistencia inicial del repositorio de rúbricas es en memoria de proceso; para alta durabilidad futura debe migrarse a almacenamiento transaccional (SQLite/postgres).
