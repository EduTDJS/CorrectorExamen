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
    ['Pregunta', 'Correcta', 'Estudiante', 'Puntaje', 'Justificación IA']
  ];

  reporte.puntuacionPorPregunta.forEach((item) => {
    filas.push([
      item.numero,
      item.respuestaCorrecta,
      item.respuestaEstudiante,
      item.puntaje.toFixed(2),
      item.justificacionIA
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
    const justificacion = doc.splitTextToSize(`IA: ${item.justificacionIA}`, 180);
    doc.text(justificacion, 14, y);
    y += justificacion.length * 4 + 2;

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
