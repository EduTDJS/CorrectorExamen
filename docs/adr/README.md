# ADR (Architecture Decision Records)

Este directorio contiene los **Architecture Decision Records (ADR)** del proyecto.

## Propósito

Los ADR documentan decisiones estructurales importantes del sistema para mantener trazabilidad técnica y facilitar futuras evoluciones.

## Formato estándar

Cada ADR debe incluir estas secciones mínimas:

1. **Contexto**: problema, restricciones y alternativas consideradas.
2. **Decisión**: elección final adoptada y alcance.
3. **Consecuencias**: impactos positivos, trade-offs y riesgos.

## Convenciones

- Numeración incremental con 4 dígitos: `0001-...`, `0002-...`.
- Un ADR por archivo Markdown.
- Nombre de archivo descriptivo y en minúsculas con guiones.
- No editar el historial de decisiones previas sin justificación explícita; en su lugar, crear un nuevo ADR que reemplace o extienda al anterior.

## Índice actual

- [0001 - OCR en cliente con Tesseract](0001-ocr-en-cliente-con-tesseract.md)
- [0002 - Integración IA desde frontend](0002-integracion-ia-desde-frontend.md)
- [0003 - Persistencia en localStorage](0003-persistencia-localstorage.md)
- [0004 - Exportación PDF/CSV en cliente](0004-exportacion-pdf-csv-en-cliente.md)
- [0005 - Migración IA a backend y custodia de secretos](0005-migracion-ia-a-backend.md)
- [0006 - Selección de proveedor IA por variable de entorno y contrato normalizado](0006-ai-provider-env-y-contrato-normalizado.md)
- [0007 - Persistencia de reportes en backend con auditoría](0007-persistencia-reportes-en-backend-con-auditoria.md)
- [0008 - Modelo de identidad mínimo y RBAC en backend](0008-modelo-rbac-y-sesion-token.md)
- [0009 - Resiliencia IA con orquestador, fallback y circuit breaker](0009-resiliencia-ia-orquestador-fallback-circuit-breaker.md)
- [0010 - Matriz RBAC final y auditoría de denegaciones por recurso](0010-rbac-matriz-final-y-auditoria-de-denegaciones.md)
- [0011 - Estrategia de backup/restore con validación de integridad y restore drill periódico](0011-estrategia-backup-restore-y-restore-drill.md)
- [0012 - Versionado de reportes con snapshot+diff y cumplimiento editorial del roadmap](0012-versionado-reportes-y-regla-editorial-roadmap.md)

## Nota de nomenclatura

Desde marzo de 2026, la marca activa del producto es **CalificaYa**. ADRs históricos pueden conservar el nombre previo **CorrectorExamen** cuando describen decisiones de su momento.
