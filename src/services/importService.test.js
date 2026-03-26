import { detectarMatriculasDuplicadas } from '../hooks/useReportes';
import { parsearArchivoImportacion, validarArchivoImportacion } from './importService';

const excelXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet>
    <Table>
      <Row>
        <Cell><Data>nombre</Data></Cell>
        <Cell><Data>matrícula</Data></Cell>
        <Cell><Data>respuesta</Data></Cell>
      </Row>
      <Row>
        <Cell><Data>Lucía</Data></Cell>
        <Cell><Data>2023008</Data></Cell>
        <Cell><Data>abdc</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;

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

  it('parsea Excel SpreadsheetML con alias de encabezados', async () => {
    const file = new File([excelXml], 'respuestas.xls', { type: 'application/vnd.ms-excel' });

    const resultado = await parsearArchivoImportacion({ file, totalPreguntas: 4 });

    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0]).toMatchObject({
      estudianteNombre: 'Lucía',
      estudianteMatricula: '2023008',
      respuestasTexto: 'ABDC'
    });
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
