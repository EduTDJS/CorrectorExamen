# CorrectorExamen

Frontend web para configurar, corregir y exportar resultados de exámenes.

## Requisitos

- Node.js 18+
- npm 9+

## Scripts

- `npm install` instala dependencias.
- `npm run dev` ejecuta la aplicación en desarrollo.
- `npm run build` construye la versión de producción.
- `npm run preview` previsualiza el build.

## Flujo implementado

1. Configuración del examen (materia, grupo, fecha, total de preguntas, clave).
2. Ingreso de respuestas por transcripción manual o carga de foto/escaneo.
3. Procesamiento OCR en cliente con Tesseract.js y parser por número de pregunta.
4. Revisión editable de respuestas en tabla antes de calificar.
5. Revisión de calificaciones (aciertos, errores, porcentaje y puntaje).
6. Sugerencia de calificación con Anthropic (`claude-sonnet-4-20250514`) usando prompt interno en español con criterios contables.
7. Reporte final con decisión final editable de la profesora y exportación simulada.

## Ajustes y seguridad de API key

- Hay un panel **Ajustes API** para capturar la API key de Anthropic.
- La API key se guarda localmente en `localStorage` y **no se hardcodea** en el código.
- Puede guardarse o eliminarse desde la UI.

## Integración de IA y parsing

- Se realiza `fetch` directo a `https://api.anthropic.com/v1/messages`.
- El prompt interno exige salida JSON con:
  - `puntuacion_sugerida`
  - `justificacion_breve`
- La respuesta se parsea de forma robusta extrayendo JSON del texto devuelto.
- La sugerencia de IA autocompleta la decisión final, pero siempre puede editarse manualmente.

## Persistencia de decisión final

- La puntuación y justificación finales de la profesora se persisten en `localStorage`.
- Se guarda siempre la decisión final editable, independientemente de la sugerencia de IA.

## Manejo robusto de errores

La UI muestra errores claros en español para:

- API key inválida o sin permisos (`401` / `authentication_error`).
- Límite de cuota/tasa (`429` / `rate_limit_error`).
- Timeout de red (cancelación tras 20 segundos).
- Respuestas de IA mal formadas o con puntuación fuera de rango.

## OCR y parsing

- OCR del lado cliente con `tesseract.js` (idioma `spa+eng`).
- Indicador de progreso durante reconocimiento de texto.
- Parser que intenta detectar patrones tipo `1 A`, `2:B`, `Pregunta 3 C`.
- Fallback por secuencia de letras válidas `A/B/C/D` si no encuentra numeración.
- Mensajes de error claros en español cuando falla el OCR o no hay respuestas válidas.

## Validaciones

- Campos obligatorios: materia, grupo, fecha y demás campos según el paso.
- Clave de respuestas restringida a A/B/C/D.
- Validación de respuestas de estudiante con letras A/B/C/D.
- Verificación de suma de puntos total = 100.
- Mensajes de carga y error en todos los pasos.
