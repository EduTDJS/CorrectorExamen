# 0013 - Dataset inicial determinístico e idempotente para desarrollo

## Contexto

Con la persistencia relacional activa (`schools`, `groups`, `exams`, `students`, `submissions`, `grades`, `reports`, `audit_logs`), hacía falta un dataset mínimo de arranque para:

- validar rápidamente el flujo extremo a extremo en ambientes locales,
- evitar datos manuales inconsistentes entre desarrolladores,
- detectar regresiones básicas de persistencia después de ejecutar migraciones.

El enfoque anterior dependía de crear datos desde UI o pruebas, sin un comando estándar de bootstrap de base de datos.

## Decisión

Se incorpora un script dedicado `backend/db/seed.js` y el comando npm `db:seed` con estas reglas:

1. **Dataset mínimo determinístico** con IDs prefijados por `seed_` y timestamps fijos.
2. **Idempotencia fuerte**: antes de insertar, el script elimina cualquier registro seed previo (por prefijo de IDs y claves relacionadas), luego reinserta en orden relacional.
3. **Dependencia explícita de migraciones**: el seed ejecuta `applyMigrations()` para garantizar esquema vigente.
4. **Validación rápida posterior**: conteo esperado por tabla seed para fallar temprano si el seed queda incompleto.

Orden recomendado de ejecución local:

1. `npm run db:migrate`
2. `npm run db:seed`

## Consecuencias

### Positivas

- Entorno local reproducible con datos estables para depuración y demos.
- Menor fricción al incorporar nuevos desarrolladores.
- Señal temprana de errores en integridad del seed por validación de conteos.

### Trade-offs

- Se mantiene lógica adicional de limpieza/inserción manual en el script.
- Si cambia el modelo de datos, hay que actualizar seed + validación + documentación en conjunto.

### Riesgos y mitigaciones

- **Riesgo:** choque de datos seed con datos reales.
  - **Mitigación:** prefijo reservado `seed_` y limpieza acotada a prefijos seed.
- **Riesgo:** drift entre esquema y seed.
  - **Mitigación:** ejecución de migraciones previa y validación de conteos por tabla.
