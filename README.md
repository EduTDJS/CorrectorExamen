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
6. Reporte final con opción de exportación simulada.

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
