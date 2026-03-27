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

export const expectedPersistedReport = {
  id: 'reporte-e2e-001',
  creadoEn: '2026-03-26T10:00:00.000Z',
  examen: {
    materia: 'Matemática',
    grupo: 'G1',
    fecha: '2026-03-26',
    totalPreguntas: 5,
    claveRespuestas: 'ABCDA'
  },
  estudiante: {
    nombre: 'Ana Pérez',
    matricula: '2026001'
  },
  respuestas: {
    texto: 'ABCDA'
  },
  calificacionFinal: {
    notaSobre100: 90,
    justificacionDocente: 'Ajuste final determinístico de docente sobre sugerencia IA mock.'
  },
  organizacion: {
    materiaNormalizada: 'matematica',
    materiaFolderId: 'materia:matematica'
  }
};

export const expectedExportResponse = {
  reporteId: expectedPersistedReport.id,
  generadoEn: expectedPersistedReport.creadoEn,
  archivos: [
    {
      tipo: 'pdf',
      nombre: 'reporte-e2e-001.pdf',
      mimeType: 'application/pdf'
    },
    {
      tipo: 'csv',
      nombre: 'reporte-e2e-001.csv',
      mimeType: 'text/csv'
    }
  ]
};

export const csvImportValido = [
  'estudianteNombre,estudianteMatricula,respuestas',
  'Ana Pérez,2026001,ABCDA',
  'Beatriz Ruiz,2026002,ABCDA'
].join('\n');

export const reporteGuardadoFactory = (body) => ({
  ...body,
  id: body.id || expectedPersistedReport.id,
  creadoEn: body.creadoEn || expectedPersistedReport.creadoEn,
  organizacion: {
    materiaNormalizada: expectedPersistedReport.organizacion.materiaNormalizada,
    materiaFolderId: expectedPersistedReport.organizacion.materiaFolderId
  }
});
