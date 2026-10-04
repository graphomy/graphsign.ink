import { describe, it, expect } from 'vitest';
import { extractDocxText, convertDocxToPdf } from './docx-converter.js';
import { PDFDocument } from 'pdf-lib';

describe('DOCX Converter Unit Tests (INK-316)', () => {
  function createMockDocxZip(xmlContent: string): Buffer {
    const filename = 'word/document.xml';
    const fnBytes = Buffer.from(filename, 'utf-8');
    const dataBytes = Buffer.from(xmlContent, 'utf-8');

    // Local file header (30 bytes + fnLen + extraLen)
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    header.writeUInt16LE(20, 4); // version
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // compMethod = 0 (stored)
    header.writeUInt32LE(0, 10); // mod time
    header.writeUInt32LE(0, 14); // crc
    header.writeUInt32LE(dataBytes.length, 18); // compSize
    header.writeUInt32LE(dataBytes.length, 22); // uncompSize
    header.writeUInt16LE(fnBytes.length, 26); // fnLen
    header.writeUInt16LE(0, 28); // extraLen

    return Buffer.concat([header, fnBytes, dataBytes]);
  }

  it('extracts paragraphs, headings, and decodes entities from OpenXML document.xml', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:t>Service Agreement</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>This is a legally binding contract &amp; agreement between parties.</w:t>
        <w:br/>
        <w:t>Section A continues here with &quot;quoted&quot; text.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const docxZip = createMockDocxZip(xml);
    const markdown = extractDocxText(docxZip);

    expect(markdown).toContain('# Service Agreement');
    expect(markdown).toContain('This is a legally binding contract & agreement between parties.');
    expect(markdown).toContain('Section A continues here with "quoted" text.');
  });

  it('safely handles non-ZIP buffer fallback', () => {
    const plainText = Buffer.from('Plain text content that is not a zip archive.');
    const result = extractDocxText(plainText);
    expect(result).toBe('Plain text content that is not a zip archive.');
  });

  it('converts DOCX buffer to a valid PDF document with clean WinAnsi encoding', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>Master Service Agreement\r\n</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Terms and conditions with special characters: \u2013 \u2018single\u2019 \u201Cdouble\u201D \r\n and carriage returns \r</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const docxZip = createMockDocxZip(xml);
    const result = await convertDocxToPdf(docxZip, 'Master Service Agreement', 'ENV-DOCX-1');

    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.pdfBytes.length).toBeGreaterThan(100);

    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
