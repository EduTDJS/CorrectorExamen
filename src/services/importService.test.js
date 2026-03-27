import { detectarMatriculasDuplicadas } from '../hooks/useReportes';
import { parsearArchivoImportacion, validarArchivoImportacion } from './importService';

const crearArchivoXlsx = (rows) => {
  const xmlEscape = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
  const xmlRows = rows.map((row) => {
    const cells = row.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  const spreadsheetXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;
  return new File([spreadsheetXml], 'respuestas.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
};

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

  it('parsea .xlsx (caso feliz) y aplica contrato homogéneo', async () => {
    const file = crearArchivoXlsx([
      ['estudianteNombre', 'estudianteMatricula', 'respuestas'],
      ['Lucía', '2023008', 'abdc']
    ]);

    const resultado = await parsearArchivoImportacion({ file, totalPreguntas: 4 });

    expect(resultado.resumen).toMatchObject({
      totalLeidas: 1,
      totalValidas: 1,
      totalErrores: 0,
      totalDuplicados: 0
    });
    expect(resultado.filas[0]).toMatchObject({
      estudianteNombre: 'Lucía',
      estudianteMatricula: '2023008',
      respuestasTexto: 'ABDC'
    });
  });

  it('acepta encabezados alias en .xlsx, reporta errores por fila y deduplica por matrícula', async () => {
    const file = crearArchivoXlsx([
      ['nombre', 'matrícula', 'respuesta'],
      ['Ana', '2023001', 'ABCD'],
      ['Carlos', '2023002', 'ABXD'],
      ['Ana Dup', '2023001', 'DDDD']
    ]);

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

  it('reporta error claro para XLSX corrupto', async () => {
    const file = new File(['contenido inválido'], 'respuestas.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    await expect(parsearArchivoImportacion({ file, totalPreguntas: 4 }))
      .rejects
      .toThrow(/No se pudo leer el archivo Excel/);
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
