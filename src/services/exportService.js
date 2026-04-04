import { jsPDF } from 'jspdf';
import { escaparCsv } from '../utils/examUtils';

const descargarArchivo = (contenido, nombre, tipo = 'text/plain;charset=utf-8;') => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportarIndividualCSV = (reporte) => {
  const filas = [
    ['Materia', reporte.examen.materia],
    ['Grupo', reporte.examen.grupo],
    ['Fecha', reporte.examen.fecha],
    ['Estudiante', reporte.estudiante.nombre],
    ['Matrícula', reporte.estudiante.matricula],
    ['Nota', reporte.calificacionFinal.notaSobre100.toFixed(2)],
    ['Letra', reporte.calificacionFinal.letra],
    [],
    [
      'Pregunta',
      'Correcta',
      'Estudiante',
      'Puntaje',
      'Criterio aplicado',
      'Evidencia',
      'Resultado',
      'Recomendación'
    ]
  ];

  reporte.puntuacionPorPregunta.forEach((item) => {
    const evidencia = item.desglose?.evidencia || {};
    filas.push([
      item.numero,
      item.respuestaCorrecta,
      item.respuestaEstudiante,
      item.puntaje.toFixed(2),
      item.desglose?.criterioAplicado || '',
      `clave=${evidencia.clave || '-'}; respuesta=${evidencia.respuestaEstudiante || '-'}; estado=${evidencia.estado || '-'}; confianza=${evidencia.confianzaOCR ?? '-'}; fuente=${evidencia.fuente || '-'}`,
      item.desglose?.resultado || item.justificacionIA || '',
      item.desglose?.recomendacion || ''
    ]);
  });

  const csv = filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
  descargarArchivo(csv, `reporte_${reporte.estudiante.matricula || 'estudiante'}.csv`, 'text/csv;charset=utf-8;');
};

export const exportarIndividualPDF = (reporte) => {
  const doc = new jsPDF();
  let y = 12;

  doc.setFontSize(14);
  doc.text('Reporte individual de calificación', 14, y);
  y += 8;
  doc.setFontSize(10);

  const encabezado = [
    `Materia: ${reporte.examen.materia}`,
    `Grupo: ${reporte.examen.grupo}`,
    `Fecha: ${reporte.examen.fecha}`,
    `Estudiante: ${reporte.estudiante.nombre} (${reporte.estudiante.matricula})`,
    `Nota final: ${reporte.calificacionFinal.notaSobre100.toFixed(2)} / 100 (${reporte.calificacionFinal.letra})`
  ];

  encabezado.forEach((linea) => {
    doc.text(linea, 14, y);
    y += 6;
  });

  y += 2;
  doc.text('Desglose por pregunta:', 14, y);
  y += 6;

  reporte.puntuacionPorPregunta.forEach((item) => {
    const linea = `P${item.numero}: C=${item.respuestaCorrecta || '-'} E=${item.respuestaEstudiante || '-'} Pts=${item.puntaje.toFixed(2)}`;
    doc.text(linea, 14, y);
    y += 5;
    const criterio = doc.splitTextToSize(`Criterio: ${item.desglose?.criterioAplicado || '-'}`, 180);
    doc.text(criterio, 14, y);
    y += criterio.length * 4 + 1;
    const evidencia = item.desglose?.evidencia || {};
    const evidenciaTexto = doc.splitTextToSize(
      `Evidencia: clave=${evidencia.clave || '-'}, respuesta=${evidencia.respuestaEstudiante || '-'}, estado=${evidencia.estado || '-'}, confianza=${evidencia.confianzaOCR ?? '-'}, fuente=${evidencia.fuente || '-'}`,
      180
    );
    doc.text(evidenciaTexto, 14, y);
    y += evidenciaTexto.length * 4 + 1;
    const resultado = doc.splitTextToSize(`Resultado: ${item.desglose?.resultado || item.justificacionIA || '-'}`, 180);
    doc.text(resultado, 14, y);
    y += resultado.length * 4 + 1;
    const recomendacion = doc.splitTextToSize(`Recomendación: ${item.desglose?.recomendacion || '-'}`, 180);
    doc.text(recomendacion, 14, y);
    y += recomendacion.length * 4 + 2;

    if (y > 270) {
      doc.addPage();
      y = 14;
    }
  });

  doc.save(`reporte_${reporte.estudiante.matricula || 'estudiante'}.pdf`);
};

export const exportarGrupoCSV = (reportesFiltrados) => {
  const filas = [['Nombre', 'Matrícula', 'Materia', 'Grupo', 'Fecha', 'Nota', 'Letra']];
  reportesFiltrados.forEach((rep) => {
    filas.push([
      rep.estudiante.nombre,
      rep.estudiante.matricula,
      rep.examen.materia,
      rep.examen.grupo,
      rep.examen.fecha,
      rep.calificacionFinal.notaSobre100.toFixed(2),
      rep.calificacionFinal.letra
    ]);
  });
  const csv = filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
  descargarArchivo(csv, 'reporte_grupal.csv', 'text/csv;charset=utf-8;');
};

export const exportarOperacionesImportacionCSV = (operaciones = []) => {
  const filas = [['Timestamp', 'Estrategia', 'MatriculasAfectadas']];
  operaciones.forEach((operacion) => {
    filas.push([
      operacion.timestamp || '',
      operacion.strategy || '',
      Array.isArray(operacion.affectedMatriculas) ? operacion.affectedMatriculas.join('|') : ''
    ]);
  });
  const csv = filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
  descargarArchivo(csv, 'operaciones_importacion.csv', 'text/csv;charset=utf-8;');
};
