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
2. Ingreso de respuestas por transcripción manual o carga de imagen.
3. Revisión de calificaciones (aciertos, errores, porcentaje y puntaje).
4. Reporte final con opción de exportación simulada.

## Validaciones

- Campos obligatorios: materia, grupo, fecha y demás campos según el paso.
- Clave de respuestas restringida a A/B/C/D.
- Verificación de suma de puntos total = 100.
- Mensajes de carga y error en todos los pasos.
