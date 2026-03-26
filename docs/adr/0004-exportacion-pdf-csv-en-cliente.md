# ADR 0004: Exportación PDF/CSV en cliente

## Contexto

Se necesita exportar resultados individuales y grupales para distribución y archivo institucional. Se consideró generar archivos en backend, pero el proyecto prioriza ejecución completamente en frontend.

## Decisión

La exportación se realiza del lado cliente mediante `src/services/exportService.js`, usando `jsPDF` para PDF y utilidades CSV para archivos tabulares.

## Consecuencias

- **Positivas**:
  - Descarga inmediata sin round-trip a servidor.
  - Menor complejidad operativa y menor costo de infraestructura.
  - Mejor control del usuario sobre generación local de reportes.
- **Trade-offs / riesgos**:
  - Diferencias de compatibilidad entre navegadores para descargas.
  - Límites de rendimiento en reportes grandes.
  - Calidad visual del PDF sujeta al motor y layout del cliente.
