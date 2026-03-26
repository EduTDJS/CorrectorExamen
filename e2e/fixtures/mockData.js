export const proveedorMock = {
  proveedor: 'mock-provider',
  modelo: 'mock-model-v1',
  timeoutMs: 15000
};

export const sugerenciaIaMock = {
  puntuacion: 87.5,
  justificacion: 'Sugerencia IA determinística para pruebas E2E.',
  proveedor: 'mock-provider',
  modelo: 'mock-model-v1'
};

export const reporteGuardadoFactory = (body) => ({
  ...body,
  id: body.id || 'reporte-e2e-001',
  creadoEn: body.creadoEn || '2026-03-26T10:00:00.000Z',
  organizacion: {
    materiaNormalizada: 'matematica',
    materiaFolderId: 'materia:matematica'
  }
});
