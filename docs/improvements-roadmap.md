# Roadmap de mejoras sugeridas

Este documento resume mejoras de alto impacto para evolucionar **CalificaYa** de MVP a producto robusto para uso institucional.

## 1) Seguridad y gobierno (prioridad alta)

- **Autenticación y autorización por rol (RBAC)**
  - Roles mínimos: docente, coordinador, administrador.
  - Permisos por acción (crear examen, corregir, exportar, ver histórico global).
- **Sesiones seguras y gestión de secretos**
  - Mover secretos a un gestor (no variables locales para entornos productivos).
  - Rotación y versionado de credenciales.
- **Auditoría trazable**
  - Guardar eventos de alto valor: cambios de calificación final, exportaciones y eliminaciones.

### Criterios de aceptación

- **RBAC operativo en endpoints críticos**: accesos no autorizados son rechazados con `403` y quedan auditados con actor, recurso y timestamp.
- **Métrica técnica**: p95 de validación de autorización < 50 ms en `/api/*` protegido y error rate de autorización incorrecta < 0.5% en staging.
- **Gestión de secretos validada**: no hay secretos en frontend ni en repositorio (`0` hallazgos en escaneo de secretos del pipeline).
- **Evidencia esperada**: tests de autorización (unit/integration), tablero de auditoría de eventos de seguridad y ADR de modelo RBAC/secret management.
- **Casos mínimos auditados**: denegación `401` por sesión inválida/ausente, denegación `403` por rol sin permiso RBAC y denegación `403` por recurso fuera de tenant/ownership, todos con `actor`, `resource` y `timestamp` en logs.

## 2) Persistencia y escalabilidad (prioridad alta)

- **Migrar de `localStorage` a base de datos**
  - Modelo inicial recomendado: `schools`, `groups`, `exams`, `students`, `submissions`, `grades`, `audit_logs`.
  - Añadir migraciones y seed para desarrollo.
- **Versionado de reportes**
  - Mantener historial por intento y por edición de la decisión final docente.
- **Backups y retención**
  - Definir ventanas de retención y política de recuperación ante incidentes.

### Criterios de aceptación

- **Persistencia transaccional habilitada**: operaciones de creación/edición de exámenes, entregas y calificaciones se almacenan en base de datos relacional.
- **Versionado verificable**: cada cambio de decisión final docente genera una nueva versión consultable con diff básico.
- **Métrica técnica**: disponibilidad de base de datos ≥ 99.9% mensual y p95 de lectura/escritura < 200 ms para operaciones de negocio principales.
- **Evidencia esperada**: migraciones versionadas + seed reproducible, suite de pruebas de repositorio, dashboard de disponibilidad/latencia y documento de estrategia de backup/restore.

## 3) Calidad de evaluación (prioridad alta)

- **Banco de rúbricas y criterios reutilizables**
  - Plantillas por materia y grado.
  - Reglas de penalización/bonificación parametrizables.
- **Detección de inconsistencias**
  - Alertas cuando la justificación IA no coincide con evidencia por pregunta.
- **Calibración de OCR por lote**
  - Métrica de confianza promedio por examen.
  - Reintento automático en zonas de baja calidad.

### Criterios de aceptación

- **Rúbricas reutilizables activas**: al menos una plantilla por materia/grado puede aplicarse sin edición manual completa.
- **Consistencia de justificación**: respuestas con desalineación entre evidencia y justificación IA se marcan automáticamente para revisión docente.
- **Métrica técnica**: exactitud OCR por lote ≥ 92% y precisión de detección de inconsistencias ≥ 85% en dataset de validación.
- **Evidencia esperada**: pruebas de evaluación con datasets etiquetados, reporte de métricas OCR/consistencia y documento técnico de calibración de reglas.

## 4) Operación y confiabilidad (prioridad media)

- **Métricas y panel operativo**
  - Tasa de error por proveedor IA.
  - P50/P95 de latencia por endpoint.
  - Tiempo total de corrección por grupo.
- **Evolucionar rate limiting existente (token/IP) hacia segmentación institucional y por usuario**
  - Estado actual: ya existe control de rate limiting por token/IP mediante `RATE_LIMIT_KEY_STRATEGY`.
  - Siguiente paso: segmentación real por institución y por usuario autenticado para aislar consumo y evitar interferencia entre tenants.
  - Incorporar límites diferenciados por rol (docente, coordinador, administrador) según criticidad y volumen esperado.
  - Añadir métricas de saturación (rechazos por límite, cercanía a umbral y ventanas más exigidas) para ajuste fino de capacidad/costos.
  - Ver detalle técnico y lineamientos vigentes en `docs/security.md` (fuente de verdad para controles de seguridad).
- **Circuit breaker y fallback de proveedor**
  - Si falla proveedor primario, intentar proveedor secundario (si está habilitado).

### Criterios de aceptación

- **Observabilidad end-to-end**: métricas de latencia, error por proveedor y saturación de rate limit disponibles por tenant/usuario.
- **Fallback automatizado**: ante fallo del proveedor primario, el sistema conmuta a secundario sin intervención manual cuando esté habilitado.
- **Métrica técnica**: SLO de disponibilidad del flujo de sugerencia ≥ 99.5%, p95 de `/api/calificacion/sugerir` < 1.5 s y error rate < 2% semanal.
- **Evidencia esperada**: panel operativo con alertas, logs estructurados de conmutación/circuit breaker y pruebas de resiliencia (failover, throttling y retry).

## 5) Experiencia de usuario (prioridad media)

- **Carga masiva**
  - Importar listas de estudiantes y respuestas desde CSV/Excel.
- **Revisión inteligente**
  - Filtros rápidos: "solo respuestas con baja confianza OCR", "solo preguntas incorrectas".
- **Accesibilidad**
  - Navegación completa por teclado.
  - Validaciones de contraste y etiquetas ARIA.

### Criterios de aceptación

- **Carga masiva usable**: docentes pueden importar CSV/Excel con validación previa y reporte claro de errores por fila.
- **Revisión enfocada**: filtros de baja confianza OCR e incorrectas reducen la navegación manual en revisión.
- **Métrica técnica**: tiempo medio para completar revisión de un grupo se reduce al menos 30% frente a línea base y tasa de error de importación < 1%.
- **Evidencia esperada**: pruebas E2E de importación/revisión, benchmark de tiempo de tarea (antes/después) y reporte de accesibilidad (teclado, contraste, ARIA).
- **Evidencia actual (MVP):** reporte base disponible en `docs/accessibility-report.md` con criterios ejecutados, fecha y hallazgos.

## 6) Pruebas y entrega continua (prioridad media)

- **Pruebas E2E**
  - Flujo completo: configuración → OCR/manual → revisión → IA → exportación.
- **Pruebas de contrato del backend**
  - Validar normalización para Anthropic/OpenAI ante respuestas parciales o mal formadas.
- **Quality gate CI**
  - `lint + test + build` obligatorios con cobertura mínima y reporte.

### Criterios de aceptación

- **Cobertura de flujo crítico**: el flujo E2E configuración → OCR/manual → revisión → IA → exportación se ejecuta en CI sin pasos manuales.
- **Contratos backend robustos**: adaptadores de IA manejan respuestas parciales/mal formadas sin romper contrato API.
- **Métrica técnica**: cobertura mínima de pruebas ≥ 80% en módulos críticos y tasa de builds exitosos en rama principal ≥ 95% por mes.
- **Evidencia esperada**: pipeline CI con quality gates visibles, reportes de cobertura/publicación de artefactos y ADR de estrategia de testing y release.
- **Evidencia actual (implementada):** caso crítico E2E `e2e/roadmap-critical-flow.spec.js` cubre configuración, importación por archivo, revisión/corrección, `POST /api/reportes` y `GET /api/reportes/:id/export`, con fixtures determinísticas en `e2e/fixtures/mockData.js` y artefacto dedicado en CI (`e2e-critical-flow-evidence`).

## Impacto documental esperado (por iniciativa de arquitectura)

Este apartado define el **mínimo documental** que debe actualizarse junto con cada iniciativa arquitectónica para mantener trazabilidad técnica y reducir deuda de documentación.

| Iniciativa de arquitectura | Documentos mínimos a actualizar |
| --- | --- |
| Seguridad y gobierno (RBAC, secretos, auditoría) | `docs/security.md`, `docs/architecture.md`, ADR en `docs/adr/` para decisiones de control de acceso y/o gestión de secretos. |
| Persistencia y escalabilidad (migración a BD, versionado, backups) | `docs/data-model.md`, `docs/architecture.md`, `docs/observability.md` (métricas de BD/backup), ADR en `docs/adr/` para elección o migración de persistencia. |
| Calidad de evaluación (rúbricas, consistencia IA, calibración OCR) | `docs/architecture.md`, `docs/observability.md` (KPIs de OCR/calidad), ADR en `docs/adr/` si cambia la estrategia de evaluación automatizada. |
| Operación y confiabilidad (rate limiting, circuit breaker, fallback) | `docs/observability.md`, `docs/security.md`, `docs/architecture.md`, ADR en `docs/adr/` para políticas de resiliencia y límites por tenant/usuario. |
| Pruebas y entrega continua (E2E, contratos, quality gates) | `docs/architecture.md`, `docs/observability.md` (SLO/SLI y calidad de entrega), ADR en `docs/adr/` para estrategia de testing/release. |

### Regla editorial obligatoria

Todo cambio de decisión técnica (por ejemplo, migración de persistencia o modificación del modelo de seguridad) **requiere**:

1. ADR nuevo en `docs/adr/`, **o**
2. actualización explícita de un ADR existente, indicando motivo, alcance y fecha del cambio.

## Primer sprint recomendado (2 semanas)

### Secuencia por dependencias

#### Iniciativas habilitadoras (primero)

1. **Autenticación técnica base (sin RBAC completo)**  
   Entregable mínimo: login funcional para usuario docente y sesión segura activa en endpoints críticos.
2. **Esquema inicial de base de datos para reportes**  
   Entregable mínimo: migración con tabla inicial de reportes + auditoría básica de creación/edición.

#### Iniciativas consumidoras (dependen de las habilitadoras)

3. **Flujo de persistencia de reportes hacia BD**  
   Entregable mínimo: escritura/lectura de reportes desde la tabla nueva (sin versionado avanzado).
4. **Prueba E2E crítica del flujo principal**  
   Entregable mínimo: 1 E2E estable de configuración → corrección/sugerencia → revisión → persistencia en BD.
5. **Panel operativo básico**  
   Entregable mínimo: dashboard con 2 métricas visibles (`p95` de latencia y tasa de error de `/api/calificacion/sugerir`).

### Fuera de alcance del sprint

- RBAC completo por rol y matriz fina de permisos institucionales.
- Fallback multi-proveedor completo con circuit breaker avanzado.
- Banco de rúbricas reutilizables y reglas avanzadas de calibración.
- Versionado completo de reportes con diff histórico por cada decisión docente.

## Definición de éxito inicial

- 0 secretos expuestos en frontend.
- > 95% de solicitudes exitosas al endpoint de sugerencia.
- Reducción de retrabajo docente en revisión manual.
- Trazabilidad completa para cambios de calificación final.

## Checklist de consistencia documental (previo al cierre de épica)

**Última actualización del checklist:** 2026-04-04.

- [x] Se actualizaron `docs/architecture.md`, `docs/data-model.md`, `docs/security.md` y/o `docs/observability.md` según el impacto real de la épica. _(Evidencia: flujo backend-first y persistencia transaccional en `docs/architecture.md` (secciones "Flujo de persistencia..." y "Política de persistencia frontend"); normalización/versionado en `docs/data-model.md`; sesión+RBAC+auditoría y evolución de rate limit en `docs/security.md`; eventos, métricas y endpoints `GET /api/metrics` + `GET /metrics` en `docs/observability.md`.)_
- [x] Se creó o actualizó ADR en `docs/adr/` cuando hubo cambio de decisión técnica. _(Evidencia: índice `docs/adr/README.md` con ADR 0008 (RBAC), 0009 (resiliencia IA), 0010 (matriz RBAC final), 0011 (backup/restore), 0012 (regla editorial roadmap), 0013 (seed determinístico) y 0014 (rúbricas versionadas).)_
- [x] Los criterios de aceptación y métricas de la épica coinciden con los documentos técnicos actualizados. _(Evidencia: SLO/SLI y consultas de panel en `docs/observability.md`; controles `401/403`, auditoría y segmentación de rate limit por rol en `docs/security.md`; quality gate por módulos críticos y E2E crítico en `docs/architecture.md`.)_
- [x] Se reflejaron dependencias, supuestos y riesgos nuevos en la documentación correspondiente. _(Evidencia: riesgos y mitigaciones operativas en `docs/security.md`; dependencias de proveedor IA + fallback/circuit breaker y transaccionalidad en `docs/architecture.md`; restore drill programado y supuestos de backup en `docs/runbooks/backup-restore.md`.)_
- [ ] La evidencia de dashboard operativo externo de la épica está registrada con datos verificables.
  - `owner`: `pendiente`.
  - `target_date`: `pendiente` (usar formato ISO-8601 `YYYY-MM-DD`).
  - `status`: `bloqueado`.
  - `blocking_dependency`: `No existe aún una URL publicada del dashboard operativo externo en el repositorio`.
  - `url`: `pendiente`.
  - `panel_name`: `pendiente`.
  - `last_verified_at`: `pendiente` (usar formato ISO-8601 `YYYY-MM-DD`).
  - `responsible`: `pendiente`.
  - Nota de cierre: al habilitar el panel, actualizar estos campos y replicar exactamente la misma trazabilidad en `docs/observability.md` (sección “Estado del dashboard externo”) y enlazar también en `docs/architecture.md`.
- [x] La evidencia restante (tests, migraciones, runbooks y artefactos CI) está enlazada desde los documentos. _(Evidencia: E2E crítico `e2e/roadmap-critical-flow.spec.js` + fixture `e2e/fixtures/mockData.js` y artefacto CI `e2e-critical-flow-evidence` (`.github/workflows/ci.yml`); migraciones/seed y restore drill en `backend/db/runMigrations.js`, `backend/db/seed.js`, `backend/db/restore-drill.js`; runbook en `docs/runbooks/backup-restore.md`; evidencia de restore drill publicada como artefacto CI `restore-drill-evidence` y descrita en `docs/observability.md`.)_

### Nota sobre evidencia CI vs. archivos versionados

- Cuando este roadmap menciona "evidencia" de restore drill o pruebas CI, se refiere a **evidencia publicada como artefacto de CI** (por ejemplo, `restore-drill-evidence` mediante `actions/upload-artifact` en `.github/workflows/ci.yml`).
- Los archivos de evidencia **no se consideran versionados en git por defecto**; solo se versiona un snapshot estable si se acuerda explícitamente para fines de auditoría/documentación.

**Nota de gobernanza:** todo PR de arquitectura debe actualizar este estado.
