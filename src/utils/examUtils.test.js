import {
  limpiarRespuestas,
  convertirTextoALista,
  mapearLetraPucmm,
  extraerJsonDeTexto,
  parsearOCRPorNumeroPregunta
} from './examUtils';

describe('examUtils', () => {
  describe('limpiarRespuestas', () => {
    it('normaliza en mayúsculas y elimina caracteres no válidos', () => {
      expect(limpiarRespuestas('aB x-c1d\n?')).toBe('ABCD');
    });

    it('acepta arreglo enriquecido', () => {
      expect(limpiarRespuestas([{ respuesta: 'a' }, { respuesta: '8' }, { respuesta: '' }])).toBe('AB');
    });
  });

  describe('convertirTextoALista', () => {
    it('convierte texto en arreglo enriquecido con longitud fija', () => {
      expect(convertirTextoALista('abdc', 6)).toEqual([
        { respuesta: 'A', confianza: null, fuenteLinea: 'Manual 1' },
        { respuesta: 'B', confianza: null, fuenteLinea: 'Manual 2' },
        { respuesta: 'D', confianza: null, fuenteLinea: 'Manual 3' },
        { respuesta: 'C', confianza: null, fuenteLinea: 'Manual 4' },
        { respuesta: '', confianza: null, fuenteLinea: '' },
        { respuesta: '', confianza: null, fuenteLinea: '' }
      ]);
    });
  });

  describe('parsearOCRPorNumeroPregunta', () => {
    it('tolera formatos de línea ruidosos y usa metadatos de confianza', () => {
      const lista = parsearOCRPorNumeroPregunta('', 3, {
        lineasOCR: [
          { text: '1) A', confidence: 91.1, source: 'Línea 1' },
          { text: 'P2-8', confidence: 54.3, source: 'Línea 2' },
          { text: '01.A', confidence: 88.2, source: 'Línea 3' }
        ]
      });

      expect(lista[0]).toEqual({ respuesta: 'A', confianza: 91.1, fuenteLinea: 'Línea 1' });
      expect(lista[1]).toEqual({ respuesta: 'B', confianza: 54.3, fuenteLinea: 'Línea 2' });
      expect(lista[2]).toEqual({ respuesta: '', confianza: null, fuenteLinea: '' });
    });

    it('hace segunda pasada y detecta formatos tolerantes (PREG 1 / P1) con asignación cercana', () => {
      const lista = parsearOCRPorNumeroPregunta('', 4, {
        lineasOCR: [
          { text: 'A   P1', confidence: 80, source: 'OCR A' },
          { text: '## P2 ) 8 ##', confidence: 72, source: 'OCR B' },
          { text: 'P 03 : (', confidence: 78, source: 'OCR C' }
        ]
      });

      expect(lista[0]).toEqual({ respuesta: 'A', confianza: 76, fuenteLinea: 'OCR A' });
      expect(lista[1]).toEqual({ respuesta: 'B', confianza: 72, fuenteLinea: 'OCR B' });
      expect(lista[2]).toEqual({ respuesta: 'C', confianza: 78, fuenteLinea: 'OCR C' });
      expect(lista[3]).toEqual({ respuesta: '', confianza: null, fuenteLinea: '' });
    });

    it('resuelve duplicados por mayor confianza y luego por fuente más reciente', () => {
      const lista = parsearOCRPorNumeroPregunta('', 2, {
        lineasOCR: [
          { text: '1) A', confidence: 65, source: 'primera' },
          { text: 'P1 B', confidence: 80, source: 'segunda' },
          { text: 'P1 C', confidence: 80, source: 'tercera' },
          { text: '2) D', confidence: null, source: 'base' },
          { text: 'PREG 2 A', confidence: null, source: 'ultima' }
        ]
      });

      expect(lista[0]).toEqual({ respuesta: 'C', confianza: 80, fuenteLinea: 'tercera' });
      expect(lista[1]).toEqual({ respuesta: 'A', confianza: null, fuenteLinea: 'ultima' });
    });

    it('aplica guardrails para números fuera de rango y secuencias imposibles', () => {
      const lista = parsearOCRPorNumeroPregunta('', 5, {
        lineasOCR: [
          { text: '0) A', confidence: 90, source: 'cero' },
          { text: '99) B', confidence: 90, source: 'alto' },
          { text: 'PREG 4 D PREG 2 A', confidence: 90, source: 'ruido' },
          { text: '05 ) C', confidence: 70, source: 'valida' }
        ]
      });

      expect(lista[0]).toEqual({ respuesta: '', confianza: null, fuenteLinea: '' });
      expect(lista[1]).toEqual({ respuesta: '', confianza: null, fuenteLinea: '' });
      expect(lista[2]).toEqual({ respuesta: '', confianza: null, fuenteLinea: '' });
      expect(lista[3]).toEqual({ respuesta: 'D', confianza: 90, fuenteLinea: 'ruido' });
      expect(lista[4]).toEqual({ respuesta: 'C', confianza: 70, fuenteLinea: 'valida' });
    });
  });

  describe('mapearLetraPucmm', () => {
    it('mapea correctamente umbrales de notas', () => {
      expect(mapearLetraPucmm(95)).toBe('A');
      expect(mapearLetraPucmm(88)).toBe('B+');
      expect(mapearLetraPucmm(82)).toBe('B');
      expect(mapearLetraPucmm(76)).toBe('C+');
      expect(mapearLetraPucmm(72)).toBe('C');
      expect(mapearLetraPucmm(66)).toBe('D');
      expect(mapearLetraPucmm(50)).toBe('F');
    });
  });

  describe('extraerJsonDeTexto', () => {
    it('extrae el primer bloque JSON válido embebido en texto', () => {
      const texto = 'Respuesta IA:\n```json\n{"puntuacion_sugerida":90,"justificacion_breve":"bien"}\n```';
      expect(extraerJsonDeTexto(texto)).toEqual({
        puntuacion_sugerida: 90,
        justificacion_breve: 'bien'
      });
    });

    it('lanza error cuando no encuentra JSON', () => {
      expect(() => extraerJsonDeTexto('sin json aquí')).toThrow('La IA respondió en un formato no válido.');
    });
  });
});
