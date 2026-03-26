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

## Primer sprint recomendado (2 semanas)

1. Implementar autenticación básica + RBAC mínimo.
2. Migrar reportes persistidos a base de datos.
3. Añadir pruebas E2E del flujo crítico.
4. Dashboard mínimo de latencia y errores de `/api/calificacion/sugerir`.

## Definición de éxito inicial

- 0 secretos expuestos en frontend.
- > 95% de solicitudes exitosas al endpoint de sugerencia.
- Reducción de retrabajo docente en revisión manual.
- Trazabilidad completa para cambios de calificación final.
