# ADR 0006: Selección de proveedor IA por variable de entorno y contrato normalizado

## Contexto

La integración de IA en backend dejó de ser exclusiva de Anthropic: ahora el sistema soporta Anthropic y OpenAI con una única API interna (`POST /api/calificacion/sugerir`).

Sin una decisión explícita, la documentación técnica podía divergir en dos puntos críticos:

1. **Selección de proveedor**: describir integración “Anthropic-only” contradice la implementación real basada en `AI_PROVIDER`.
2. **Contrato de salida**: exponer payloads nativos del proveedor contradice el contrato estable que ya normaliza el backend para el frontend.

Necesitamos mantener trazabilidad arquitectónica para evitar acoplamiento a formatos externos y facilitar cambios de modelo/proveedor sin tocar la UI.

## Decisión

Se adopta formalmente una arquitectura de **provider strategy** con selección por variable de entorno:

- `AI_PROVIDER=anthropic` usa Anthropic Messages API.
- `AI_PROVIDER=openai` usa OpenAI Chat Completions API.

La API interna `POST /api/calificacion/sugerir` expone un **contrato normalizado y estable** independiente del proveedor:

- `puntuacion`
- `justificacion`
- `proveedor`
- `modelo`

La normalización y validación de este contrato se centralizan en backend (función `normalizarContrato`).

## Consecuencias

### Positivas

- Desacopla frontend de contratos nativos de Anthropic/OpenAI.
- Permite cambiar proveedor/modelo sin romper consumidores internos.
- Mejora observabilidad funcional al exponer `proveedor` y `modelo` en cada sugerencia.
- Reduce contradicciones entre README, arquitectura y seguridad.

### Trade-offs

- Incrementa complejidad en backend por manejo de múltiples SDK/contratos upstream.
- Requiere pruebas de contrato para cada proveedor soportado.

### Riesgos

- Configuración incorrecta de `AI_PROVIDER` o secretos puede inutilizar el endpoint.
- Diferencias de calidad de salida entre proveedores requieren monitoreo continuo.
