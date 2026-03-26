# ADR 0003: Persistencia en localStorage

## Contexto

La aplicación necesita conservar configuración, decisión final y reportes entre sesiones, sin acoplarse a backend ni base de datos central en esta etapa.

## Decisión

Se adopta persistencia local en navegador usando `localStorage`, centralizada en `src/services/storageService.js`.

## Consecuencias

- **Positivas**:
  - Cero dependencia de infraestructura externa.
  - Experiencia inmediata offline/standalone para uso docente.
  - Implementación sencilla y mantenible.
- **Trade-offs / riesgos**:
  - Datos limitados al navegador/dispositivo actual.
  - Sin sincronización multiusuario ni respaldo automático.
  - Riesgo de pérdida de datos al limpiar almacenamiento del navegador.
