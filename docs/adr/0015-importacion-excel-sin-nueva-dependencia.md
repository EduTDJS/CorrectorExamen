# ADR 0015: Importación Excel por extensión sin agregar nueva dependencia

## Contexto

El contrato de importación requería paridad entre CSV y Excel (validaciones, alias de encabezados, deduplicación y límites), pero la implementación activa solo procesaba `.csv`.

Además, en el entorno actual no existe una librería Excel declarada en dependencias directas del proyecto, por lo que introducir una nueva dependencia requiere una decisión explícita.

## Decisión

Se decidió:

1. Extender `IMPORT_LIMITS.supportedExtensions` a `['csv', 'xls', 'xlsx']`.
2. Implementar `parseByExtension` con rutas específicas:
   - `.csv`: parser existente.
   - `.xlsx`: lectura OpenXML (ZIP + XML) usando utilidades ya disponibles en el árbol de dependencias (`fflate`), sin introducir paquete nuevo.
   - `.xls`: soporte para archivos SpreadsheetML/XML 2003 (texto XML).
3. Mantener un único flujo de validación posterior al parsing para todas las extensiones (`REQUIRED_FIELDS`, `validarSchema`, deduplicación por matrícula, límites de tamaño/filas).

## Consecuencias

### Positivas

- Contrato uniforme entre CSV y Excel.
- Sin incremento de superficie de dependencias de producción.
- Trazabilidad clara del soporte real por extensión.

### Trade-offs y riesgos

- El soporte `.xls` se limita a SpreadsheetML/XML 2003; no cubre automáticamente formatos binarios legacy BIFF.
- El parser OpenXML implementado está orientado al primer worksheet y a celdas de texto/valor simple, lo que es suficiente para el contrato actual de importación.
