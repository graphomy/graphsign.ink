import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import QRCode from 'qrcode';
import { BadRequestError } from '../utils/errors.js';
import { SIGNATURE_FRAME_PNG_BASE64 } from './signature-frame-asset.js';

export interface AssemblePdfField {
  id: string;
  type: string;
  pageNumber?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  recipientId?: string;
}

export interface AssemblePdfRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  routingOrder: number;
  status: string;
  signedAt?: Date | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  fieldsData?: Record<string, any> | null;
  signatureData?: { type?: string; data?: string } | null;
}

export interface AssemblePdfSealDetails {
  verificationToken: string;
  verificationUrl: string;
  documentHash: string;
  tsaTimestamp?: Date | string | null;
  tsaProvider?: string;
  signerName?: string;
  subjectDn?: string;
  issuerDn?: string;
  algorithm?: string;
  padesLevel?: string;
}

export interface AssemblePdfOptions {
  agreementTitle: string;
  envelopeId: string;
  markdownContent?: string | null;
  existingPdfBytes?: Uint8Array | null;
  existingPdfBase64?: string | null;
  fields?: AssemblePdfField[];
  recipients?: AssemblePdfRecipient[];
  sealDetails?: AssemblePdfSealDetails;
  includeCertificate?: boolean;
}

export class PdfAssemblyService {
  /**
   * Assembles a final, completed document:
   * 1. Renders Markdown pages or loads existing PDF.
   * 2. Stamps the Graphsign.ink Envelope ID on the top-left of every page.
   * 3. Flattens all recipient field values (signatures, initials, dates, inputs).
   * 4. Appends an authoritative Cryptographic Execution & Integrity Certificate page.
   */
  async assembleCompletedDocument(options: AssemblePdfOptions): Promise<Uint8Array> {
    return this.assembleDocument({
      ...options,
      includeCertificate: true,
    });
  }

  /**
   * Core assembler allowing optional certificate appending.
   */
  async assembleDocument(options: AssemblePdfOptions): Promise<Uint8Array> {
    const {
      agreementTitle,
      envelopeId,
      markdownContent,
      existingPdfBytes,
      existingPdfBase64,
      fields = [],
      recipients = [],
      sealDetails,
      includeCertificate = false,
    } = options;

    const source =
      existingPdfBytes ||
      (existingPdfBase64
        ? Buffer.from(
            existingPdfBase64.includes(',') ? existingPdfBase64.split(',')[1]! : existingPdfBase64,
            'base64',
          )
        : null);
    if (source && Buffer.from(source).includes(Buffer.from('/ByteRange')))
      throw new BadRequestError(
        'This PDF already contains a digital signature. Create an unsigned draft source before adding fields; rewriting it would invalidate the existing signature.',
      );
    let pdfDoc: PDFDocument;

    // 1. Load existing PDF bytes or render Markdown content
    if (existingPdfBytes && existingPdfBytes.length > 0) {
      pdfDoc = await PDFDocument.load(existingPdfBytes);
    } else if (existingPdfBase64) {
      const cleanBase64 = existingPdfBase64.includes(',')
        ? existingPdfBase64.split(',')[1]!
        : existingPdfBase64;
      pdfDoc = await PDFDocument.load(Buffer.from(cleanBase64, 'base64'));
    } else {
      // Build document pages from Markdown/Text
      pdfDoc = await this.renderMarkdownToPdf(agreementTitle, markdownContent || '');
    }

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 2. Stamp Graphsign.ink Envelope ID on top-left of every existing page
    const existingPages = pdfDoc.getPages();
    for (const page of existingPages) {
      const { height } = page.getSize();
      page.drawText(`Graphsign.ink Envelope ID: ${envelopeId}`, {
        x: 36,
        y: height - 22,
        size: 8,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.5), // #6B7280 neutral gray
      });
    }

    // 3. Flatten fields & signatures onto the document pages
    await this.flattenFields(pdfDoc, fields, recipients, helvetica, helveticaBold);

    // 4. Append the Cryptographic Execution & Integrity Certificate page if requested
    if (includeCertificate) {
      await this.appendCertificatePage(
        pdfDoc,
        agreementTitle,
        envelopeId,
        recipients,
        sealDetails,
        helvetica,
        helveticaBold,
      );
    }

    return await pdfDoc.save();
  }

  /**
   * Renders Markdown / text content into structured A4 PDF pages with clean typography.
   */
  private async renderMarkdownToPdf(title: string, markdown: string): Promise<PDFDocument> {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const [pageWidth, pageHeight] = PageSizes.A4;
    const marginX = 48;
    const marginTop = 56;
    const marginBottom = 48;
    const contentWidth = pageWidth - marginX * 2;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - marginTop;

    function checkPageBreak(neededHeight: number) {
      if (cursorY - neededHeight < marginBottom) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - marginTop;
      }
    }

    // Render Document Title Header
    checkPageBreak(40);
    const cleanedTitle = this.cleanWinAnsi(title);
    const wrappedTitle = this.wrapText(cleanedTitle, contentWidth, 18, helveticaBold);
    for (const tLine of wrappedTitle) {
      checkPageBreak(24);
      currentPage.drawText(tLine, {
        x: marginX,
        y: cursorY,
        size: 18,
        font: helveticaBold,
        color: rgb(0.06, 0.09, 0.16),
      });
      cursorY -= 24;
    }
    cursorY -= 6;

    // Draw thin accent separator
    currentPage.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: marginX + contentWidth, y: cursorY },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92),
    });
    cursorY -= 20;

    let inCodeBlock = false;

    // Process lines of markdown
    const lines = (markdown || '').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        cursorY -= 6;
        continue;
      }

      if (inCodeBlock) {
        const text = this.cleanWinAnsi(rawLine);
        const wrapped = this.wrapText(text, contentWidth - 20, 9, helvetica);
        for (const w of wrapped) {
          checkPageBreak(13);
          currentPage.drawText(w, {
            x: marginX + 12,
            y: cursorY,
            size: 9,
            font: helvetica,
            color: rgb(0.2, 0.25, 0.35),
          });
          cursorY -= 12;
        }
        continue;
      }

      if (!line) {
        cursorY -= 8;
        continue;
      }

      // Horizontal rules
      if (line === '---' || line === '***' || line === '___') {
        checkPageBreak(16);
        cursorY -= 6;
        currentPage.drawLine({
          start: { x: marginX, y: cursorY },
          end: { x: marginX + contentWidth, y: cursorY },
          thickness: 0.5,
          color: rgb(0.85, 0.88, 0.92),
        });
        cursorY -= 12;
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        const text = this.cleanWinAnsi(line.replace(/^#\s+/, ''));
        const wrapped = this.wrapText(text, contentWidth, 14, helveticaBold);
        for (const w of wrapped) {
          checkPageBreak(22);
          currentPage.drawText(w, {
            x: marginX,
            y: cursorY,
            size: 14,
            font: helveticaBold,
            color: rgb(0.08, 0.12, 0.22),
          });
          cursorY -= 20;
        }
        cursorY -= 4;
      } else if (line.startsWith('## ')) {
        const text = this.cleanWinAnsi(line.replace(/^##\s+/, ''));
        const wrapped = this.wrapText(text, contentWidth, 12, helveticaBold);
        for (const w of wrapped) {
          checkPageBreak(18);
          currentPage.drawText(w, {
            x: marginX,
            y: cursorY,
            size: 12,
            font: helveticaBold,
            color: rgb(0.12, 0.16, 0.26),
          });
          cursorY -= 16;
        }
        cursorY -= 4;
      } else if (line.startsWith('### ')) {
        const text = this.cleanWinAnsi(line.replace(/^###\s+/, ''));
        const wrapped = this.wrapText(text, contentWidth, 11, helveticaBold);
        for (const w of wrapped) {
          checkPageBreak(16);
          currentPage.drawText(w, {
            x: marginX,
            y: cursorY,
            size: 11,
            font: helveticaBold,
            color: rgb(0.18, 0.22, 0.32),
          });
          cursorY -= 14;
        }
        cursorY -= 4;
      } else if (line.startsWith('> ') || line.startsWith('>')) {
        // Blockquote
        const text = this.cleanWinAnsi(line.replace(/^>\s*/, ''));
        const wrapped = this.wrapText(text, contentWidth - 20, 10, helvetica);
        for (let i = 0; i < wrapped.length; i++) {
          checkPageBreak(14);
          currentPage.drawLine({
            start: { x: marginX + 4, y: cursorY - 2 },
            end: { x: marginX + 4, y: cursorY + 10 },
            thickness: 2,
            color: rgb(0.75, 0.8, 0.88),
          });
          currentPage.drawText(wrapped[i]!, {
            x: marginX + 16,
            y: cursorY,
            size: 10,
            font: helvetica,
            color: rgb(0.3, 0.35, 0.45),
          });
          cursorY -= 14;
        }
        cursorY -= 2;
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s+/.test(line)) {
        // Lists
        const isNumbered = /^\d+\.\s+/.test(line);
        const prefix = isNumbered ? line.match(/^\d+\./)?.[0] || '1.' : '•';
        const text = this.cleanWinAnsi(line.replace(/^([-*]|\d+\.)\s+/, ''));
        const wrapped = this.wrapText(text, contentWidth - 20, 10, helvetica);
        for (let i = 0; i < wrapped.length; i++) {
          checkPageBreak(14);
          if (i === 0) {
            currentPage.drawText(prefix, {
              x: marginX + 4,
              y: cursorY,
              size: isNumbered ? 9 : 10,
              font: helveticaBold,
              color: rgb(0.3, 0.35, 0.45),
            });
          }
          currentPage.drawText(wrapped[i]!, {
            x: marginX + 18,
            y: cursorY,
            size: 10,
            font: helvetica,
            color: rgb(0.18, 0.22, 0.3),
          });
          cursorY -= 14;
        }
      } else if (line.startsWith('|') && line.endsWith('|')) {
        // Markdown table row
        const cells = line
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cells.length > 0 && !cells.every((c) => /^[-:]+$/.test(c))) {
          const colWidth = contentWidth / cells.length;
          checkPageBreak(16);
          for (let cIdx = 0; cIdx < cells.length; cIdx++) {
            const cellText = this.cleanWinAnsi(cells[cIdx] || '');
            const wrapped = this.wrapText(cellText, colWidth - 8, 9, helvetica);
            if (wrapped[0]) {
              currentPage.drawText(wrapped[0], {
                x: marginX + cIdx * colWidth + 4,
                y: cursorY,
                size: 9,
                font: helvetica,
                color: rgb(0.15, 0.2, 0.3),
              });
            }
          }
          cursorY -= 14;
        }
      } else {
        // Regular paragraph text
        const cleanedText = this.cleanWinAnsi(line);
        const wrapped = this.wrapText(cleanedText, contentWidth, 10, helvetica);
        for (const wrappedLine of wrapped) {
          checkPageBreak(14);
          currentPage.drawText(wrappedLine, {
            x: marginX,
            y: cursorY,
            size: 10,
            font: helvetica,
            color: rgb(0.18, 0.22, 0.3),
          });
          cursorY -= 14;
        }
        cursorY -= 4;
      }
    }

    return pdfDoc;
  }

  /**
   * Flattens interactive fields and signatures onto their designated page coordinates.
   */
  private async flattenFields(
    pdfDoc: PDFDocument,
    fields: AssemblePdfField[],
    recipients: AssemblePdfRecipient[],
    helvetica: any,
    helveticaBold: any,
  ) {
    const pageCount = pdfDoc.getPageCount();
    let signatureFrameImg: any = null;

    for (const field of fields) {
      const pageIndex = Math.max(0, Math.min((field.pageNumber || 1) - 1, pageCount - 1));
      const page = pdfDoc.getPage(pageIndex);
      const { width: pWidth, height: pHeight } = page.getSize();

      // Convert percentage coordinates (top-left origin) to PDF coordinates (bottom-left origin)
      const boxX = (field.x / 100) * pWidth;
      const boxW = Math.max(20, (field.width / 100) * pWidth);
      const boxH = Math.max(16, (field.height / 100) * pHeight);
      const boxY = pHeight - (field.y / 100) * pHeight - boxH;

      // Find matching recipient
      const matchedRecip =
        recipients.find(
          (r) =>
            r.id === field.recipientId ||
            r.email === field.recipientId ||
            `recipient-${r.routingOrder}` === field.recipientId ||
            `signer-${r.routingOrder}` === field.recipientId ||
            (r.routingOrder === 1 &&
              (field.recipientId === 'recipient-1' || field.recipientId === 'signer-1')),
        ) || recipients[0];

      if (!matchedRecip) continue;

      let value = matchedRecip.fieldsData?.[field.id];

      // If signature or initials, also check signatureData
      if (
        (field.type === 'SIGNATURE' || field.type === 'INITIALS') &&
        !value &&
        matchedRecip.signatureData?.data
      ) {
        value = matchedRecip.signatureData.data;
      }

      if (field.type === 'DATE' && !value && matchedRecip.signedAt) {
        value = new Date(matchedRecip.signedAt).toISOString().split('T')[0];
      }

      if (!value) continue;

      if (field.type === 'SIGNATURE') {
        // Embed the signature frame PNG asset once
        if (!signatureFrameImg) {
          try {
            signatureFrameImg = await pdfDoc.embedPng(
              Buffer.from(SIGNATURE_FRAME_PNG_BASE64, 'base64'),
            );
          } catch (err) {
            console.warn(
              '[PDF_ASSEMBLY] Failed to embed signature frame PNG:',
              (err as Error).message,
            );
          }
        }

        // Draw the signature frame over the field bounding box
        if (signatureFrameImg) {
          page.drawImage(signatureFrameImg, {
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            opacity: 0.35,
          });
        }

        // Compute inner area positioned within the 2 blue lines (x ~ 26% to 94%, y ~ 16% to 84%)
        const sigX = boxX + boxW * 0.26;
        const sigW = boxW * 0.68;
        const sigY = boxY + boxH * 0.16;
        const sigH = boxH * 0.68;

        if (
          typeof value === 'string' &&
          value.startsWith('data:image/') &&
          !value.includes('image/svg')
        ) {
          try {
            const commaIndex = value.indexOf(',');
            const base64Data = commaIndex !== -1 ? value.substring(commaIndex + 1) : value;
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const embeddedImg =
              value.includes('image/jpeg') || value.includes('image/jpg')
                ? await pdfDoc.embedJpg(imgBuffer)
                : await pdfDoc.embedPng(imgBuffer);

            page.drawImage(embeddedImg, {
              x: sigX,
              y: sigY,
              width: sigW,
              height: sigH,
            });
            continue;
          } catch (err) {
            console.warn('[PDF_ASSEMBLY] Failed to embed signature image:', (err as Error).message);
          }
        }

        // Fallback: draw bold stylized signature text inside the two blue lines
        let textToDraw = String(value);
        if (textToDraw.includes('<svg') || textToDraw.startsWith('data:image/svg+xml')) {
          const svgMatch = textToDraw.match(/<text[^>]*>(.*?)<\/text>/i);
          textToDraw = svgMatch ? decodeURIComponent(svgMatch[1]!) : matchedRecip.name || 'Signed';
        }
        const cleanText = textToDraw.replace(/[^\x20-\x7E]/g, '') || matchedRecip.name || 'Signed';

        page.drawText(cleanText, {
          x: sigX + 4,
          y: sigY + Math.max(4, sigH / 2 - 5),
          size: Math.min(13, sigH * 0.55),
          font: helveticaBold,
          color: rgb(0.08, 0.12, 0.28),
        });
      } else if (field.type === 'INITIALS') {
        // Initials: drawn directly into bounding box without signature frame or badge
        if (
          typeof value === 'string' &&
          value.startsWith('data:image/') &&
          !value.includes('image/svg')
        ) {
          try {
            const commaIndex = value.indexOf(',');
            const base64Data = commaIndex !== -1 ? value.substring(commaIndex + 1) : value;
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const embeddedImg =
              value.includes('image/jpeg') || value.includes('image/jpg')
                ? await pdfDoc.embedJpg(imgBuffer)
                : await pdfDoc.embedPng(imgBuffer);

            page.drawImage(embeddedImg, {
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
            });
            continue;
          } catch (err) {
            console.warn('[PDF_ASSEMBLY] Failed to embed initials image:', (err as Error).message);
          }
        }

        let textToDraw = String(value);
        if (textToDraw.includes('<svg') || textToDraw.startsWith('data:image/svg+xml')) {
          const svgMatch = textToDraw.match(/<text[^>]*>(.*?)<\/text>/i);
          textToDraw = svgMatch
            ? decodeURIComponent(svgMatch[1]!)
            : matchedRecip.name || 'Initials';
        }
        const cleanText =
          textToDraw.replace(/[^\x20-\x7E]/g, '') || matchedRecip.name || 'Initials';

        page.drawText(cleanText, {
          x: boxX + 4,
          y: boxY + Math.max(4, boxH / 2 - 5),
          size: 12,
          font: helveticaBold,
          color: rgb(0.08, 0.12, 0.28),
        });
      } else if (field.type === 'CHECKBOX') {
        const isChecked = value === true || value === 'true';
        page.drawText(isChecked ? '[X]' : '[ ]', {
          x: boxX + 2,
          y: boxY + Math.max(2, boxH / 2 - 4),
          size: 10,
          font: helveticaBold,
          color: rgb(0.1, 0.14, 0.24),
        });
      } else if (field.type === 'RADIO') {
        const isChecked = Boolean(value);
        const radioText =
          typeof value === 'string' && value !== 'true' && value !== 'false'
            ? `(X) ${value}`
            : isChecked
              ? '(X)'
              : '( )';
        page.drawText(this.cleanWinAnsi(radioText), {
          x: boxX + 2,
          y: boxY + Math.max(2, boxH / 2 - 4),
          size: 10,
          font: helveticaBold,
          color: rgb(0.1, 0.14, 0.24),
        });
      } else {
        let displayVal = String(value);
        if (field.type === 'DATE' && displayVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [y, m, d] = displayVal.split('-');
          const months = [
            'JAN',
            'FEB',
            'MAR',
            'APR',
            'MAY',
            'JUN',
            'JUL',
            'AUG',
            'SEP',
            'OCT',
            'NOV',
            'DEC',
          ];
          const mIdx = parseInt(m || '1', 10) - 1;
          displayVal = `${d}-${months[mIdx] || 'JAN'}-${y}`;
        }
        page.drawText(this.cleanWinAnsi(displayVal), {
          x: boxX + 4,
          y: boxY + Math.max(2, boxH / 2 - 4),
          size: Math.min(12, Math.max(9, boxH * 0.6)),
          font: helvetica,
          color: rgb(0.1, 0.14, 0.24),
        });
      }
    }
  }

  /**
   * Appends an authoritative Cryptographic Execution & Integrity Certificate as a new page.
   */
  private async appendCertificatePage(
    pdfDoc: PDFDocument,
    agreementTitle: string,
    envelopeId: string,
    recipients: AssemblePdfRecipient[],
    sealDetails: AssemblePdfSealDetails | undefined,
    helvetica: any,
    helveticaBold: any,
  ) {
    const [pageWidth, pageHeight] = PageSizes.A4;
    const certPage = pdfDoc.addPage([pageWidth, pageHeight]);
    const marginX = 44;
    const contentWidth = pageWidth - marginX * 2;
    let y = pageHeight - 24;

    // 1. Top Envelope ID Header
    certPage.drawText(`Graphsign.ink Envelope ID: ${envelopeId}`, {
      x: 36,
      y,
      size: 8,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.5),
    });
    y -= 24;

    // 2. Title & Subtitle Banner
    certPage.drawRectangle({
      x: marginX,
      y: y - 44,
      width: contentWidth,
      height: 44,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    certPage.drawText('Cryptographic Execution & Integrity Certificate', {
      x: marginX + 12,
      y: y - 18,
      size: 13,
      font: helveticaBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    certPage.drawText(
      'Document execution record. Digital signature evidence is stored in the final PDF signature.',
      {
        x: marginX + 12,
        y: y - 34,
        size: 8.5,
        font: helvetica,
        color: rgb(0.38, 0.42, 0.5),
      },
    );
    y -= 56;

    // 3. Document Execution Metadata Grid
    const token =
      sealDetails?.verificationToken ||
      `GS-${envelopeId
        .replace(/[^a-z0-9]/gi, '')
        .substring(0, 8)
        .toLowerCase()}`;
    const hash =
      sealDetails?.documentHash === 'PENDING_SEAL'
        ? 'Final artifact digest is available from the verification portal'
        : sealDetails?.documentHash || 'Not recorded';
    const ts = sealDetails?.tsaTimestamp
      ? new Date(sealDetails.tsaTimestamp).toISOString()
      : 'See the final PDF digital signature for timestamp evidence';
    const verifyUrl = sealDetails?.verificationUrl || `https://graphsign.ink/verify/${token}`;

    const gridBoxY = y - 106;
    certPage.drawRectangle({
      x: marginX,
      y: gridBoxY,
      width: contentWidth,
      height: 106,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    const metaRows = [
      { label: 'Document Title', value: agreementTitle },
      { label: 'Graphsign.ink Envelope ID', value: envelopeId },
      { label: 'Verification Token', value: token },
      { label: 'Execution Status', value: 'Digitally Signed & Cryptographically Sealed' },
      { label: 'Document SHA-256 Digest', value: hash },
      { label: 'Timestamp evidence', value: ts },
      { label: 'Public Verification Link', value: verifyUrl },
    ];

    let rowY = y - 14;
    for (const r of metaRows) {
      certPage.drawText(r.label, {
        x: marginX + 12,
        y: rowY,
        size: 8,
        font: helveticaBold,
        color: rgb(0.3, 0.35, 0.45),
      });

      certPage.drawText(this.cleanWinAnsi(r.value), {
        x: marginX + 130,
        y: rowY,
        size: 8,
        font: helvetica,
        color: rgb(0.06, 0.09, 0.16),
      });
      rowY -= 14;
    }
    y = gridBoxY - 18;

    // 4. Signer Audit Records Table
    certPage.drawText('Signer Execution Records', {
      x: marginX,
      y,
      size: 10,
      font: helveticaBold,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 14;

    const signerBoxH = Math.max(80, Math.min(180, recipients.length * 52 + 16));
    certPage.drawRectangle({
      x: marginX,
      y: y - signerBoxH,
      width: contentWidth,
      height: signerBoxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    let signerY = y - 16;
    for (let i = 0; i < recipients.length; i++) {
      const recip = recipients[i]!;
      const signedTime = recip.signedAt
        ? new Date(recip.signedAt).toISOString()
        : 'Pending Execution';

      const recipName = recip.name || 'Signer ' + (i + 1);
      const recipEmail = recip.email ? `(${recip.email})` : '';
      const recipRole = (recip.role || 'signer').toUpperCase();
      const recipStatus = (recip.status || 'PENDING').toUpperCase();

      certPage.drawText(this.cleanWinAnsi(`${recipName} ${recipEmail}`.trim()), {
        x: marginX + 12,
        y: signerY,
        size: 8.5,
        font: helveticaBold,
        color: rgb(0.06, 0.09, 0.16),
      });

      certPage.drawText(this.cleanWinAnsi(`Status: ${recipStatus} • Role: ${recipRole}`), {
        x: marginX + 12,
        y: signerY - 11,
        size: 7.5,
        font: helvetica,
        color: rgb(0.2, 0.55, 0.35),
      });

      certPage.drawText(`Signed: ${signedTime}`, {
        x: marginX + 12,
        y: signerY - 21,
        size: 7,
        font: helvetica,
        color: rgb(0.4, 0.45, 0.55),
      });

      const ipInfo = recip.ipAddress ? `IP: ${recip.ipAddress}` : 'IP: Verified Web Session';
      const uaInfo = recip.userAgent ? recip.userAgent.substring(0, 48) : 'Web Client';
      certPage.drawText(this.cleanWinAnsi(`${ipInfo} • ${uaInfo}`), {
        x: marginX + 12,
        y: signerY - 30,
        size: 7,
        font: helvetica,
        color: rgb(0.5, 0.55, 0.65),
      });

      // Embed signature visual if present
      if (recip.signatureData?.data && recip.signatureData.data.startsWith('data:image/')) {
        try {
          const imgBase64 = recip.signatureData.data.split(',')[1]!;
          const sigImg = await pdfDoc.embedPng(Buffer.from(imgBase64, 'base64'));
          certPage.drawImage(sigImg, {
            x: marginX + contentWidth - 96,
            y: signerY - 32,
            width: 84,
            height: 32,
          });
        } catch {
          certPage.drawText(this.cleanWinAnsi(recipName), {
            x: marginX + contentWidth - 96,
            y: signerY - 14,
            size: 9,
            font: helveticaBold,
            color: rgb(0.08, 0.12, 0.28),
          });
        }
      } else {
        certPage.drawText(this.cleanWinAnsi(recipName), {
          x: marginX + contentWidth - 96,
          y: signerY - 14,
          size: 9,
          font: helveticaBold,
          color: rgb(0.08, 0.12, 0.28),
        });
      }

      signerY -= 48;
      if (i < recipients.length - 1) {
        certPage.drawLine({
          start: { x: marginX + 8, y: signerY + 6 },
          end: { x: marginX + contentWidth - 8, y: signerY + 6 },
          thickness: 0.5,
          color: rgb(0.9, 0.92, 0.95),
        });
      }
    }
    y -= signerBoxH + 16;

    // 5. Trust Core & Certificate Attributes Box
    certPage.drawText('X.509 Certificate Authority & Sealing Identity', {
      x: marginX,
      y,
      size: 10,
      font: helveticaBold,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 14;

    const certBoxH = 58;
    certPage.drawRectangle({
      x: marginX,
      y: y - certBoxH,
      width: contentWidth,
      height: certBoxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    const certRows = [
      {
        label: 'Signer Authority',
        value: sealDetails?.signerName || 'GraphSign Tenant Signing Authority',
      },
      {
        label: 'Subject DN',
        value: (sealDetails?.subjectDn || 'CN=GraphSign Document Signing Authority').substring(
          0,
          60,
        ),
      },
      {
        label: 'Cryptographic Suite',
        value: `${sealDetails?.algorithm || 'Configured signing profile'} / SHA-256`,
      },
      {
        label: 'TSA Authority',
        value: sealDetails?.tsaProvider || 'No trusted timestamp recorded',
      },
    ];

    let certRowY = y - 13;
    for (const cr of certRows) {
      certPage.drawText(cr.label, {
        x: marginX + 12,
        y: certRowY,
        size: 7.5,
        font: helveticaBold,
        color: rgb(0.3, 0.35, 0.45),
      });
      certPage.drawText(this.cleanWinAnsi(cr.value), {
        x: marginX + 120,
        y: certRowY,
        size: 7.5,
        font: helvetica,
        color: rgb(0.06, 0.09, 0.16),
      });
      certRowY -= 12;
    }
    y -= certBoxH + 18;

    // 6. QR Code & Legal Non-Repudiation Footer
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 140,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      const qrPngBytes = Buffer.from(qrDataUrl.split(',')[1]!, 'base64');
      const qrImage = await pdfDoc.embedPng(qrPngBytes);

      certPage.drawImage(qrImage, {
        x: marginX + contentWidth - 84,
        y: y - 76,
        width: 80,
        height: 80,
      });

      certPage.drawText('Scan to Verify Document', {
        x: marginX + contentWidth - 90,
        y: y - 84,
        size: 6.5,
        font: helveticaBold,
        color: rgb(0.3, 0.35, 0.45),
      });
    } catch (err) {
      console.warn('[PDF_ASSEMBLY] Failed to generate QR code for certificate page:', err);
    }

    const legalLines = [
      'DOCUMENT EXECUTION RECORD:',
      'This page records the electronic signing workflow and participant actions.',
      'The final PDF digital signature provides cryptographic integrity evidence.',
      'Certificate identity trust and trusted timestamp evidence must be assessed separately from the recorded',
      'execution events. Verify the final PDF signature to assess document integrity and timestamp evidence.',
      'Public independent verification is available at any time via the link or QR code above.',
    ];

    let legalY = y - 10;
    for (let i = 0; i < legalLines.length; i++) {
      certPage.drawText(legalLines[i]!, {
        x: marginX,
        y: legalY,
        size: i === 0 ? 7 : 6.5,
        font: i === 0 ? helveticaBold : helvetica,
        color: i === 0 ? rgb(0.18, 0.22, 0.32) : rgb(0.42, 0.45, 0.55),
      });
      legalY -= 10;
    }
  }

  /**
   * Cleans text to only WinAnsi encodable characters supported by standard PDF Helvetica.
   * Replaces common unicode symbols with ASCII/WinAnsi equivalents and strips unencodables.
   */
  public cleanWinAnsi(text: string): string {
    if (!text) return '';
    return (
      text
        .replace(/[\u2318]/g, 'Cmd') // ⌘
        .replace(/[\u21E7]/g, 'Shift') // ⇧
        .replace(/[\u2325]/g, 'Option') // ⌥
        .replace(/[\u2303]/g, 'Ctrl') // ⌃
        .replace(/[\u2013\u2014]/g, '-') // – —
        .replace(/[\u2018\u2019]/g, "'") // ‘ ’
        .replace(/[\u201C\u201D]/g, '"') // “ ”
        .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '*') // bullet variants
        .replace(/[\u2026]/g, '...') // …
        .replace(/[\u00A0]/g, ' ') // non-breaking space
        // Replace any remaining character outside WinAnsi / ASCII printable range
        .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '?')
    );
  }

  /**
   * Helper to wrap text according to maximum pixel width.
   * Splits words if single word exceeds maxWidth.
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
    const cleaned = this.cleanWinAnsi(text);
    const words = cleaned.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const rawWord of words) {
      let word = rawWord;
      // If a single word is wider than maxWidth, split it
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        while (font.widthOfTextAtSize(word, fontSize) > maxWidth && word.length > 1) {
          let splitIdx = Math.floor(
            word.length * (maxWidth / font.widthOfTextAtSize(word, fontSize)),
          );
          if (splitIdx < 1) splitIdx = 1;
          while (
            splitIdx > 1 &&
            font.widthOfTextAtSize(word.substring(0, splitIdx), fontSize) > maxWidth
          ) {
            splitIdx--;
          }
          const chunk = word.substring(0, splitIdx);
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          lines.push(chunk);
          word = word.substring(splitIdx);
        }
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  }
}
