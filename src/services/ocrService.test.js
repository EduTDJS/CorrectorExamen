import Tesseract from 'tesseract.js';
import * as examUtils from '../utils/examUtils';
import { procesarImagenOCR } from './ocrService';

vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn()
  }
}));

vi.mock('../utils/examUtils', async () => {
  const actual = await vi.importActual('../utils/examUtils');
  return {
    ...actual,
    limpiarRespuestas: vi.fn(),
    parsearOCRPorNumeroPregunta: vi.fn()
  };
});

const instalarMockImagen = () => {
  let indiceCarga = 0;
  const dimensionesPorCarga = [
    { width: 1200, height: 1600 },
    { width: 80, height: 100 }
  ];

  class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      const dimensiones = dimensionesPorCarga[Math.min(indiceCarga, dimensionesPorCarga.length - 1)];
      this.naturalWidth = dimensiones.width;
      this.naturalHeight = dimensiones.height;
      this.width = dimensiones.width;
      this.height = dimensiones.height;
      indiceCarga += 1;
    }

    set src(_value) {
      queueMicrotask(() => {
        if (this.onload) {
          this.onload();
        }
      });
    }
  }

  vi.stubGlobal('Image', MockImage);
};

const crearMockCanvas = ({ sinContexto = false } = {}) => ({
  width: 0,
  height: 0,
  getContext: vi.fn(() => {
    if (sinContexto) {
      return null;
    }

    return {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([
          255,
          255,
          255,
          255,
          20,
          20,
          20,
          255,
          250,
          250,
          250,
          255,
          10,
          10,
          10,
          255
        ])
      })),
      putImageData: vi.fn(),
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillStyle: '#fff'
    };
  }),
  toBlob: vi.fn((cb) => cb(new Blob(['preprocesada'], { type: 'image/png' })))
});

describe('ocrService - preprocesamiento', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    instalarMockImagen();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:imagen-prueba')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });

    examUtils.parsearOCRPorNumeroPregunta.mockReturnValue(['A', 'B']);
    examUtils.limpiarRespuestas.mockReturnValue(true);

    Tesseract.recognize.mockResolvedValue({
      data: {
        text: '1 A\\n2 B',
        lines: []
      }
    });
  });

  it('usa el archivo preprocesado como entrada de Tesseract', async () => {
    const canvas = crearMockCanvas();
    const createElementOriginal = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return canvas;
      }
      return createElementOriginal(tag);
    });

    const archivoOriginal = new File([new Uint8Array(26 * 1024)], 'scan.jpg', { type: 'image/jpeg' });

    await procesarImagenOCR({ archivoImagen: archivoOriginal, totalPreguntas: 2 });

    expect(Tesseract.recognize).toHaveBeenCalledTimes(1);
    const archivoOCR = Tesseract.recognize.mock.calls[0][0];
    expect(archivoOCR).toBeInstanceOf(File);
    expect(archivoOCR.name).toContain('ocr-preprocesada');
    expect(archivoOCR).not.toBe(archivoOriginal);
  });

  it('vuelve al archivo original cuando falla el preprocesamiento', async () => {
    const canvasSinContexto = crearMockCanvas({ sinContexto: true });
    const createElementOriginal = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return canvasSinContexto;
      }
      return createElementOriginal(tag);
    });

    const archivoOriginal = new File([new Uint8Array(26 * 1024)], 'scan.jpg', { type: 'image/jpeg' });

    await procesarImagenOCR({ archivoImagen: archivoOriginal, totalPreguntas: 2 });

    expect(Tesseract.recognize).toHaveBeenCalledWith(
      archivoOriginal,
      'spa+eng',
      expect.objectContaining({ logger: expect.any(Function) })
    );
  });
});
