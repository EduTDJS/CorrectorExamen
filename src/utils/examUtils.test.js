import {
  limpiarRespuestas,
  convertirTextoALista,
  mapearLetraPucmm,
  extraerJsonDeTexto
} from './examUtils';

describe('examUtils', () => {
  describe('limpiarRespuestas', () => {
    it('normaliza en mayúsculas y elimina caracteres no válidos', () => {
      expect(limpiarRespuestas('aB x-c1d\n?')).toBe('ABCD');
    });
  });

  describe('convertirTextoALista', () => {
    it('convierte texto en arreglo con longitud fija', () => {
      expect(convertirTextoALista('abdc', 6)).toEqual(['A', 'B', 'D', 'C', '', '']);
    });

    it('devuelve lista simple si totalPreguntas no es válido', () => {
      expect(convertirTextoALista('abdc', 0)).toEqual(['A', 'B', 'D', 'C']);
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
