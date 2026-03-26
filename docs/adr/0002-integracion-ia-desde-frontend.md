# ADR 0002: Integración IA desde frontend

## Estado

Superada por [ADR 0005](0005-migracion-ia-a-backend.md) el 2026-03-26.

## Contexto

Se requiere sugerir puntuación y justificación docente asistida por IA con baja fricción de implementación. Una opción era intermediar con backend propio para custodiar credenciales, pero actualmente el proyecto es frontend-first y busca simplicidad operativa.

## Decisión

La integración con Anthropic se realiza por `fetch` directo desde frontend (`src/services/aiService.js`), utilizando API key ingresada por el docente y persistida localmente.

## Consecuencias

- **Positivas**:
  - Implementación rápida sin capa servidor adicional.
  - Menor tiempo de despliegue y mantenimiento inicial.
- **Trade-offs / riesgos**:
  - Riesgo de exposición de API key en entorno cliente.
  - Dependencia de CORS, límites de red y disponibilidad del proveedor desde el navegador.
  - Requiere lineamientos claros de uso seguro y rotación de credenciales.
