import { agruparReportesPorMateria } from './useReportes';

describe('agruparReportesPorMateria', () => {
  it('agrupa por carpeta de materia normalizada', () => {
    const reportes = [
      {
        id: 'r-1',
        creadoEn: '2026-03-26T00:00:00.000Z',
        examen: { materia: 'Contabilidad I' },
        organizacion: { materiaNormalizada: 'contabilidad i', materiaFolderId: 'materia:contabilidad i' }
      },
      {
        id: 'r-2',
        creadoEn: '2026-03-25T00:00:00.000Z',
        examen: { materia: 'contabilidad i' },
        organizacion: { materiaNormalizada: 'contabilidad i', materiaFolderId: 'materia:contabilidad i' }
      }
    ];

    const agrupado = agruparReportesPorMateria(reportes);
    expect(agrupado).toHaveLength(1);
    expect(agrupado[0].totalReportes).toBe(2);
    expect(agrupado[0].reportes.map((rep) => rep.id)).toEqual(['r-1', 'r-2']);
  });
});
