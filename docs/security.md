# Seguridad: API key en `localStorage`

La aplicación permite guardar la API key de Anthropic en `localStorage` para facilitar el uso diario. Este enfoque mejora la UX, pero introduce riesgos que deben entenderse.

## Riesgos principales

1. **Exposición por XSS**
   - Cualquier script malicioso ejecutado en el origen (propio o de terceros comprometidos) puede leer `localStorage` y extraer la API key.

2. **Persistencia indefinida en el navegador**
   - La key permanece hasta ser eliminada manualmente. En equipos compartidos, otra persona con acceso al perfil del navegador podría reutilizarla.

3. **No hay aislamiento por pestaña/sesión**
   - A diferencia de memoria volátil, `localStorage` vive entre recargas y reinicios del navegador.

4. **Uso directo desde frontend**
   - La key se envía desde cliente al proveedor externo; no existe un backend propio que permita ocultar credenciales o aplicar controles centralizados (rate limiting, auditoría, revocación granular por usuario).

## Mitigaciones recomendadas

### Mitigaciones inmediatas (frontend actual)

- **Eliminar key fácilmente desde UI**
  - Mantener y promover el botón de “Eliminar API key”.
- **Buenas prácticas de higiene en cliente**
  - No registrar key en logs.
  - Evitar interpolarla en errores visibles.
- **Content Security Policy (CSP) estricta**
  - Reducir riesgo XSS limitando scripts a orígenes confiables y bloqueando inline script cuando sea posible.
- **Validación/sanitización continua**
  - Mantener validación estricta de entradas y evitar inyección de HTML no confiable.
- **Entorno de uso controlado**
  - Recomendar no usar cuentas de navegador compartidas para corrección.

### Mitigaciones estructurales (recomendadas a mediano plazo)

1. **Backend proxy para IA (recomendado)**
   - Mover la API key al servidor.
   - El frontend llama a un endpoint propio autenticado.
   - Permite rotación de secretos, monitoreo y límites por usuario.

2. **Token efímero en lugar de key persistente**
   - Emitir tokens de corta vida desde backend.
   - Evitar exposición prolongada de credenciales reales.

3. **Secret manager + rotación periódica**
   - Guardar secretos en un gestor de secretos en servidor y rotarlos periódicamente.

4. **Auditoría y alertas de consumo**
   - Monitorear uso anómalo para detectar fuga temprana.

## Política sugerida para este proyecto

- Mantener `localStorage` solo como opción transitoria de desarrollo/uso individual.
- Para despliegue institucional o multiusuario, **no** almacenar API keys de proveedor en frontend y migrar a backend seguro.
