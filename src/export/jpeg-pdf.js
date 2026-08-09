/** 將等尺寸 JPEG 頁面封裝成簡單、相容性高的 PDF；不處理排版與影像產生。 */
export function buildPdfBytesFromJpegs(jpegPages, imageWidth = 1080, imageHeight = 1528) {
  if (!jpegPages.length) throw new Error('PDF 至少需要一頁。');
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objectCount = 2 + jpegPages.length * 3;
  const objects = new Array(objectCount + 1);
  objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = jpegPages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects[2] = ascii(`<< /Type /Pages /Count ${jpegPages.length} /Kids [${kids}] >>`);

  jpegPages.forEach((jpeg, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    objects[pageObject] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentObject} 0 R >>`);
    objects[imageObject] = concatBytes(
      ascii(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      ascii('\nendstream'),
    );
    const stream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    objects[contentObject] = ascii(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  });

  const chunks = [ascii('%PDF-1.4\n%SPINLEAGUE\n')];
  const offsets = new Array(objectCount + 1).fill(0);
  let position = chunks[0].length;
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = position;
    const objectChunk = concatBytes(ascii(`${objectNumber} 0 obj\n`), objects[objectNumber], ascii('\nendobj\n'));
    chunks.push(objectChunk);
    position += objectChunk.length;
  }

  const xrefOffset = position;
  const xrefRows = ['0000000000 65535 f '];
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) xrefRows.push(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n `);
  chunks.push(ascii(`xref\n0 ${objectCount + 1}\n${xrefRows.join('\n')}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return concatBytes(...chunks);
}

function ascii(value) { return new TextEncoder().encode(value); }
function concatBytes(...chunks) { const length = chunks.reduce((total, chunk) => total + chunk.length, 0); const result = new Uint8Array(length); let offset = 0; chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; }); return result; }
