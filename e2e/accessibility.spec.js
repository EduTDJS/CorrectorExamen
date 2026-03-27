import { expect, test } from '@playwright/test';
import { proveedorMock, reporteGuardadoFactory, sugerenciaIaMock } from './fixtures/mockData';

async function mockApi(page) {
  await page.route('**/api/calificacion/proveedor', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(proveedorMock)
    });
  });

  await page.route('**/api/calificacion/sugerir', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sugerenciaIaMock)
    });
  });

  await page.route('**/api/reportes', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      });
      return;
    }

    const payload = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reporteGuardadoFactory(payload))
    });
  });
}

test.describe('Accesibilidad del workflow de examen', () => {
  test('permite navegar y activar acciones críticas únicamente con teclado', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await page.getByLabel('Materia').click();
    await page.keyboard.type('Matemática');
    await page.keyboard.press('Tab');
    await page.keyboard.type('G1');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2026-03-27');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Ana Pérez');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2026001');
    await page.keyboard.press('Tab');
    await page.keyboard.type('5');
    await page.keyboard.press('Tab');
    await page.keyboard.type('ABCDA');

    await page.getByRole('button', { name: 'Siguiente' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 2, name: 'Ingreso de respuestas' })).toBeVisible();
    await page.getByLabel('Respuestas del estudiante (A/B/C/D)').focus();
    await page.keyboard.type('ABCDA');

    await page.getByRole('button', { name: 'Siguiente' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 2, name: 'Revisión de calificaciones' })).toBeVisible();
    await page.getByRole('button', { name: 'Sugerir calificación con IA' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('mock-provider')).toBeVisible();

    await page.getByRole('button', { name: 'Siguiente' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 2, name: 'Reporte final y exportación' })).toBeVisible();
    await page.getByLabel('Puntuación final (0-100)').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('90');
    await page.getByLabel('Justificación final').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Ajuste final docente mediante navegación por teclado.');

    await page.getByRole('button', { name: 'Guardar reporte' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Estado del reporte actual:')).toBeVisible();
    await expect(page.getByText('Guardado')).toBeVisible();
  });

  test('expone foco visible, orden lógico de tabulación y atributos ARIA en formularios/tablas', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const ordenTabulacionConfiguracion = await page.locator('.paso').evaluate((root) => {
      const esVisible = (el) => {
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && !el.hasAttribute('disabled');
      };

      const focusables = Array.from(root.querySelectorAll('input, select, textarea, button'))
        .filter((el) => esVisible(el))
        .map((el) => {
          const aria = el.getAttribute('aria-label');
          const id = el.getAttribute('id');
          const label = id ? root.querySelector(`label[for="${id}"]`)?.textContent : el.closest('label')?.textContent;
          const nombre = (aria || label || el.textContent || '').replace(/\s+/g, ' ').trim();
          return nombre;
        });

      return focusables;
    });

    expect(ordenTabulacionConfiguracion.slice(0, 7)).toEqual([
      'Plantilla de rúbrica',
      'Materia',
      'Grupo',
      'Fecha',
      'Nombre estudiante',
      'Matrícula estudiante',
      'Total de preguntas'
    ]);

    await page.getByRole('button', { name: 'Siguiente' }).focus();
    const estiloFoco = await page.getByRole('button', { name: 'Siguiente' }).evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth
      };
    });

    expect(estiloFoco.outlineStyle).not.toBe('none');
    expect(parseFloat(estiloFoco.outlineWidth)).toBeGreaterThan(0);

    await page.getByLabel('Materia').fill('Matemática');
    await page.getByLabel('Grupo').fill('G1');
    await page.getByLabel('Fecha').fill('2026-03-27');
    await page.getByLabel('Nombre estudiante').fill('Ana Pérez');
    await page.getByLabel('Matrícula estudiante').fill('2026001');
    await page.getByLabel('Total de preguntas').fill('5');
    await page.getByLabel('Clave de respuestas (solo A/B/C/D)').fill('ABCDA');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('table', { name: 'Respuestas extraídas y edición manual' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Respuesta de la pregunta 1' })).toBeVisible();

    await page.getByLabel('Respuestas del estudiante (A/B/C/D)').fill('ABCDA');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('table', { name: 'Desglose de revisión por pregunta' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Override pregunta 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sugerir calificación con IA' })).toBeEnabled();

    const pasoActivo = page.locator('nav[aria-label="Progreso del flujo de corrección"] li[aria-current="step"]');
    await expect(pasoActivo).toContainText('3. Revisión de calificaciones');
  });
});
