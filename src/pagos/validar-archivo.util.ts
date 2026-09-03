// Corrección 2026-09-03 (auditoría de seguridad, segunda ronda): la
// validación existente del comprobante de pago (fileFilter en
// pagos.controller.ts) solo revisa `file.mimetype` -- un valor que el
// propio navegador/cliente declara en la petición, y que es trivial de
// falsificar (basta con renombrar cualquier archivo y declarar el tipo
// que se quiera). Esta función revisa en cambio los primeros bytes
// REALES del archivo -- la "firma" binaria que cada formato tiene al
// inicio, imposible de falsificar sin corromper el archivo -- para
// confirmar que el contenido de verdad corresponde a una imagen JPG,
// PNG, o un PDF real.
//
// Se implementa a mano, sin una librería externa, deliberadamente: son
// solo 3 formatos a reconocer, con firmas simples y estables desde
// hace décadas -- no vale la pena la complejidad adicional (ni el
// riesgo de una dependencia más) por algo tan acotado.
export type TipoArchivoDetectado = 'image/jpeg' | 'image/png' | 'application/pdf' | null;

export function detectarTipoArchivoReal(buffer: Buffer): TipoArchivoDetectado {
  if (buffer.length < 8) return null;

  // JPEG: siempre empieza con estos 3 bytes.
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: firma fija de 8 bytes.
  const firmaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (firmaPng.every((byte, i) => buffer[i] === byte)) {
    return 'image/png';
  }

  // PDF: empieza con el texto "%PDF-" en ASCII.
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  return null;
}
