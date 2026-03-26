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

## 2) Persistencia y escalabilidad (prioridad alta)

- **Migrar de `localStorage` a base de datos**
  - Modelo inicial recomendado: `schools`, `groups`, `exams`, `students`, `submissions`, `grades`, `audit_logs`.
  - Añadir migraciones y seed para desarrollo.
- **Versionado de reportes**
  - Mantener historial por intento y por edición de la decisión final docente.
- **Backups y retención**
  - Definir ventanas de retención y política de recuperación ante incidentes.

## 3) Calidad de evaluación (prioridad alta)

- **Banco de rúbricas y criterios reutilizables**
  - Plantillas por materia y grado.
  - Reglas de penalización/bonificación parametrizables.
- **Detección de inconsistencias**
  - Alertas cuando la justificación IA no coincide con evidencia por pregunta.
- **Calibración de OCR por lote**
  - Métrica de confianza promedio por examen.
  - Reintento automático en zonas de baja calidad.

## 4) Operación y confiabilidad (prioridad media)

- **Métricas y panel operativo**
  - Tasa de error por proveedor IA.
  - P50/P95 de latencia por endpoint.
  - Tiempo total de corrección por grupo.
- **Rate limiting por institución y usuario**
  - Evita abuso y controla costos de IA.
- **Circuit breaker y fallback de proveedor**
  - Si falla proveedor primario, intentar proveedor secundario (si está habilitado).

## 5) Experiencia de usuario (prioridad media)

- **Carga masiva**
  - Importar listas de estudiantes y respuestas desde CSV/Excel.
- **Revisión inteligente**
  - Filtros rápidos: "solo respuestas con baja confianza OCR", "solo preguntas incorrectas".
- **Accesibilidad**
  - Navegación completa por teclado.
  - Validaciones de contraste y etiquetas ARIA.

## 6) Pruebas y entrega continua (prioridad media)

- **Pruebas E2E**
  - Flujo completo: configuración → OCR/manual → revisión → IA → exportación.
- **Pruebas de contrato del backend**
  - Validar normalización para Anthropic/OpenAI ante respuestas parciales o mal formadas.
- **Quality gate CI**
  - `lint + test + build` obligatorios con cobertura mínima y reporte.

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
