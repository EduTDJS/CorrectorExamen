# ADR 0009: Resiliencia IA con orquestador, fallback y circuit breaker

## Contexto

La integración IA en backend usaba un único proveedor activo (`AI_PROVIDER`), sin mecanismo de conmutación automática ni protección ante fallas repetidas del upstream.  
Esto generaba indisponibilidad total de `POST /api/calificacion/sugerir` cuando el proveedor primario presentaba degradación.

Necesitamos:

- Soportar proveedor primario y secundario.
- Definir política explícita de fallback (reintentos y códigos de error conmutables).
- Reducir cascadas de error con un circuito simple por proveedor.
- Exponer señales operativas (logs estructurados y métricas básicas).

## Decisión

Se introduce `backend/ai/providerOrchestrator.js` como capa de orquestación de proveedores IA.

La estrategia adoptada:

1. **Primario + secundario opcional** configurables por entorno.
2. **Fallback condicionado** por:
   - `AI_FALLBACK_ENABLED`
   - `AI_FALLBACK_RETRIES`
   - `AI_FALLBACK_ERROR_CODES`
3. **Circuit breaker simple por proveedor**:
   - Estados: `closed`, `open`, `half_open`
   - Apertura por umbral de fallos (`AI_CIRCUIT_FAILURE_THRESHOLD`)
   - Ventana temporal de apertura (`AI_CIRCUIT_OPEN_MS`)
4. **Observabilidad mínima obligatoria**:
   - Eventos `provider_failover`, `provider_circuit_opened`, `provider_circuit_half_open`, `provider_circuit_closed`
   - Métricas acumuladas básicas en logs (`failovers`, errores y aperturas por proveedor)

## Consecuencias

### Positivas

- Mayor disponibilidad de sugerencias IA ante fallos transitorios del primario.
- Reducción de presión sobre proveedores degradados al abrir circuito.
- Mejor trazabilidad operacional para soporte y postmortems.

### Trade-offs / Riesgos

- Mayor complejidad operativa (más variables de entorno y estados internos).
- Métricas iniciales están en memoria y logs; no persisten entre reinicios.
- La política por códigos de error requiere calibración para evitar conmutaciones no deseadas.

### Próximos pasos

- Exportar métricas a un backend dedicado (Prometheus/OTEL) en lugar de logs solamente.
- Añadir jitter/backoff en reintentos para mayor estabilidad.
- Implementar pruebas de integración de transición `open -> half_open -> closed`.
