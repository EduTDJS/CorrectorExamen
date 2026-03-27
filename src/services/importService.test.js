import { detectarMatriculasDuplicadas } from '../hooks/useReportes';
import { parsearArchivoImportacion, validarArchivoImportacion } from './importService';

describe('importService', () => {
  it('valida extensión soportada', () => {
    const file = new File(['pdf'], 'lote.pdf', { type: 'application/pdf' });
    expect(() => validarArchivoImportacion(file)).toThrow(/Formato no soportado/);
  });

  it('parsea CSV, reporta errores y deduplica por matrícula conservando última fila', async () => {
    const csv = [
      'estudianteNombre,estudianteMatricula,respuestas',
      'Ana,2023001,ABCD',
      'Carlos,2023002,ABXD',
      'Ana Dup,2023001,DDDD'
    ].join('\n');

    const file = new File([csv], 'respuestas.csv', { type: 'text/csv' });
    const resultado = await parsearArchivoImportacion({ file, totalPreguntas: 4 });

    expect(resultado.resumen).toMatchObject({
      totalLeidas: 3,
      totalValidas: 1,
      totalErrores: 1,
      totalDuplicados: 1
    });
    expect(resultado.filas[0].estudianteNombre).toBe('Ana Dup');
    expect(resultado.errores[0].fila).toBe(3);
  });

  it('rechaza XLSX válido con error claro cuando el contrato es solo CSV', async () => {
    const csvContent = [
      'nombre,matrícula,respuesta',
      'Lucía,2023008,abdc'
    ].join('\n');
    const file = new File([csvContent], 'respuestas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    await expect(parsearArchivoImportacion({ file, totalPreguntas: 4 }))
      .rejects
      .toThrow(/Formato no soportado\. Use CSV UTF-8/);
  });

  it('reporta error claro para XLSX corrupto o no soportado', async () => {
    const file = new File(['contenido inválido'], 'respuestas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    await expect(parsearArchivoImportacion({ file, totalPreguntas: 4 }))
      .rejects
      .toThrow(/Formato no soportado\. Use CSV UTF-8/);
  });
});

describe('detectarMatriculasDuplicadas', () => {
  it('encuentra matrículas ya registradas en historial', () => {
    const reportes = [
      { estudiante: { matricula: '2023001' } },
      { estudiante: { matricula: '2023002' } }
    ];

    const duplicadas = detectarMatriculasDuplicadas(reportes, ['2023002', '2023010', '2023002']);
    expect(duplicadas).toEqual(['2023002']);
  });
});
