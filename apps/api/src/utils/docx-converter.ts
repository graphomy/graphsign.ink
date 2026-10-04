import zlib from 'zlib';
import { PdfAssemblyService } from '../services/pdf-assembly-service.js';

export interface DocxConversionResult {
  pdfBytes: Uint8Array;
  markdownContent: string;
}

/**
 * Extracts plain text / markdown from a DOCX (OpenXML) buffer.
 * Traverses ZIP local file headers to find and inflate `word/document.xml`.
 */
export function extractDocxText(buffer: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // Check for ZIP magic bytes: PK\x03\x04
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    // If not a ZIP archive, attempt to extract readable text sequences or return empty
    const plain = buf.toString('utf-8');
    if (/[\x20-\x7E]{4,}/.test(plain)) {
      return plain
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  }

  let xmlContent: string | null = null;
  let pos = 0;

  while (pos < buf.length - 30) {
    // Look for local file header signature 0x04034b50
    if (
      buf[pos] === 0x50 &&
      buf[pos + 1] === 0x4b &&
      buf[pos + 2] === 0x03 &&
      buf[pos + 3] === 0x04
    ) {
      const compMethod = buf.readUInt16LE(pos + 8);
      const compSize = buf.readUInt32LE(pos + 18);
      const fnLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const filename = buf.subarray(pos + 30, pos + 30 + fnLen).toString('utf-8');
      const dataStart = pos + 30 + fnLen + extraLen;

      if (filename === 'word/document.xml') {
        const compData = buf.subarray(dataStart, dataStart + compSize);
        try {
          xmlContent =
            compMethod === 8
              ? Buffer.from(zlib.inflateRawSync(compData)).toString('utf-8')
              : Buffer.from(compData).toString('utf-8');
        } catch {
          // Fallback if inflate fails
          xmlContent = compData.toString('utf-8');
        }
        break;
      }
      pos = dataStart + compSize;
    } else {
      pos++;
    }
  }

  if (!xmlContent) {
    return '';
  }

  return parseDocxXmlToMarkdown(xmlContent);
}

/**
 * Converts OpenXML document.xml content into clean markdown paragraphs.
 */
function parseDocxXmlToMarkdown(xml: string): string {
  // Decode XML entities
  const decodeEntities = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

  // Normalize all line breaks and carriage returns
  const cleanXml = xml.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');

  // Split by paragraph tags <w:p ...> or </w:p>
  const rawParagraphs = cleanXml.split(/<\/w:p>/gi);
  const mdParagraphs: string[] = [];

  for (const rawP of rawParagraphs) {
    if (!rawP.trim()) continue;

    // Detect heading style
    let prefix = '';
    const styleMatch = rawP.match(/<w:pStyle[^>]+w:val=["']([^"']+)["']/i);
    if (styleMatch && styleMatch[1]) {
      const s = styleMatch[1].toLowerCase();
      if (s.includes('heading1') || s === 'title') prefix = '# ';
      else if (s.includes('heading2')) prefix = '## ';
      else if (s.includes('heading3')) prefix = '### ';
    }

    // Replace XML break/tab elements with spaces
    const normalizedP = rawP.replace(/<w:(?:br|cr|tab)[^>]*\/>/gi, ' ');

    // Extract text runs <w:t>
    const textPieces: string[] = [];
    const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/gi;
    let match: RegExpExecArray | null;
    while ((match = tRegex.exec(normalizedP)) !== null) {
      if (match[1]) {
        textPieces.push(decodeEntities(match[1]));
      }
    }

    const pText = textPieces
      .join('')
      .replace(/\r\n/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .trim();

    if (pText) {
      mdParagraphs.push(prefix + pText);
    }
  }

  return mdParagraphs.join('\n\n');
}

/**
 * Converts a DOCX buffer into a formatted PDF document using PdfAssemblyService.
 */
export async function convertDocxToPdf(
  buffer: Buffer | Uint8Array,
  title: string,
  envelopeId?: string,
): Promise<DocxConversionResult> {
  const extractedText = extractDocxText(buffer);
  const markdownContent =
    extractedText.trim() ||
    `# ${title}\n\n*This document was converted from Word (.docx) format.*\n\n${title} Agreement Terms.`;

  const pdfAssembly = new PdfAssemblyService();
  const pdfBytes = await pdfAssembly.assembleDocument({
    agreementTitle: title,
    envelopeId: envelopeId || `ENV-${Date.now().toString(16).toUpperCase()}`,
    markdownContent,
    fields: [],
    recipients: [],
    includeCertificate: false,
  });

  return {
    pdfBytes,
    markdownContent,
  };
}
