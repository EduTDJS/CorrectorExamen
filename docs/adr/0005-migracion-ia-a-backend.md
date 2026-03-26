# ADR 0005: Migración de IA a backend y custodia de secretos

## Estado

Aceptada — 2026-03-26.

## Contexto

La arquitectura previa llamaba Anthropic directamente desde frontend y guardaba la API key en `localStorage`. Esto simplificaba el arranque, pero elevaba riesgos de exposición de credenciales (XSS, equipos compartidos, fuga por soporte).

## Decisión

1. Crear endpoint backend `POST /api/calificacion/sugerir` para centralizar la integración con Anthropic.
2. Mover `ANTHROPIC_API_KEY` al entorno del servidor.
3. Eliminar captura/persistencia de API key en la UI.
4. Refactorizar `src/services/aiService.js` para consumir el backend propio.

## Consecuencias

### Positivas

- El secreto de Anthropic deja de exponerse en cliente.
- Mejor base para controles empresariales (auth, rate limit, auditoría).
- Menor fricción para usuario final (no introduce su key).

### Trade-offs

- Se añade una capa operativa (backend Node).
- Requiere gestión de variables de entorno y observabilidad del endpoint.
- Se introduce dependencia de disponibilidad backend incluso en local.

## Alternativas consideradas

1. **Mantener frontend directo + localStorage**
   - Rechazada por riesgo de seguridad.
2. **Token efímero firmado por backend y llamada directa desde frontend**
   - Posible futuro, pero agrega complejidad temprana sin resolver totalmente superficie cliente.
3. **Backend completo con orquestación de prompts y políticas**
   - Compatible con esta decisión, pero fuera del alcance inicial.

## Plan de evolución

- Añadir autenticación al endpoint.
- Incorporar rate limiting por usuario/curso.
- Registrar métricas y trazas de llamadas IA.
- Integrar secret manager y rotación automatizada.
