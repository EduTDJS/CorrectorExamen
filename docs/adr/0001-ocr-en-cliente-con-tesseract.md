# ADR 0001: OCR en cliente con Tesseract

## Contexto

El sistema necesita extraer respuestas desde fotos o escaneos de exámenes sin depender de un backend propio para procesamiento de imágenes. Se evaluó mover OCR al servidor, pero eso introduce mayor complejidad operativa, costos y exposición de datos de estudiantes en tránsito/servidor.

## Decisión

Se ejecutará OCR del lado cliente usando **Tesseract.js**, encapsulado en `src/services/ocrService.js`.

## Consecuencias

- **Positivas**:
  - Menor dependencia de infraestructura backend.
  - Mejor privacidad al procesar imágenes localmente en el navegador.
  - Menor latencia de ida y vuelta para OCR.
- **Trade-offs / riesgos**:
  - Consumo de CPU/memoria en dispositivos del usuario.
  - Variabilidad de resultados según calidad de imagen y navegador.
  - Necesidad de UX de progreso/reintento para errores de legibilidad.
