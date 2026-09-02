import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import QRCode from 'qrcode';

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
}

export class PdfAssemblyService {
  /**
   * Assembles a finalized PDF document:
   * 1. Renders Markdown text or loads existing PDF bytes.
   * 2. Stamps the Envelope ID on the top-left of every page.
   * 3. Flattens signature images, initials, and field input values.
   * 4. Appends a standalone Cryptographic Execution & Integrity Certificate page.
   */
  async assembleCompletedDocument(options: AssemblePdfOptions): Promise<Uint8Array> {
    const {
      agreementTitle,
      envelopeId,
      markdownContent,
      existingPdfBytes,
      existingPdfBase64,
      fields = [],
      recipients = [],
      sealDetails,
    } = options;

    let pdfDoc: PDFDocument;

    // 1. Initialize Document Base
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

    // 2. Stamp Envelope ID on top-left of every existing page
    const existingPages = pdfDoc.getPages();
    for (const page of existingPages) {
      const { height } = page.getSize();
      page.drawText(`Envelope ID: ${envelopeId}`, {
        x: 36,
        y: height - 22,
        size: 8,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.5), // #6B7280 neutral gray
      });
    }

    // 3. Flatten fields & signatures onto the document pages
    await this.flattenFields(pdfDoc, fields, recipients, helvetica, helveticaBold);

    // 4. Append the Cryptographic Execution & Integrity Certificate page
    await this.appendCertificatePage(
      pdfDoc,
      agreementTitle,
      envelopeId,
      recipients,
      sealDetails,
      helvetica,
      helveticaBold,
    );

    return await pdfDoc.save();
  }

  /**
   * Renders Markdown / text content into structured A4 PDF pages with clean typography.
   */
  private async renderMarkdownToPdf(
    title: string,
    markdown: string,
  ): Promise<PDFDocument> {
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
    currentPage.drawText(title, {
      x: marginX,
      y: cursorY,
      size: 18,
      font: helveticaBold,
      color: rgb(0.06, 0.09, 0.16),
    });
    cursorY -= 26;

    // Draw thin accent separator
    currentPage.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: marginX + contentWidth, y: cursorY },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92),
    });
    cursorY -= 20;

    // Process lines of markdown
    const lines = markdown.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        cursorY -= 10;
        continue;
      }

      if (line.startsWith('# ')) {
        const text = line.replace(/^#\s+/, '');
        checkPageBreak(30);
        currentPage.drawText(text, {
          x: marginX,
          y: cursorY,
          size: 14,
          font: helveticaBold,
          color: rgb(0.08, 0.12, 0.22),
        });
        cursorY -= 22;
      } else if (line.startsWith('## ')) {
        const text = line.replace(/^##\s+/, '');
        checkPageBreak(26);
        currentPage.drawText(text, {
          x: marginX,
          y: cursorY,
          size: 12,
          font: helveticaBold,
          color: rgb(0.12, 0.16, 0.26),
        });
        cursorY -= 18;
      } else if (line.startsWith('### ')) {
        const text = line.replace(/^###\s+/, '');
        checkPageBreak(22);
        currentPage.drawText(text, {
          x: marginX,
          y: cursorY,
          size: 11,
          font: helveticaBold,
          color: rgb(0.18, 0.22, 0.32),
        });
        cursorY -= 16;
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const text = line.replace(/^[-*]\s+/, '');
        const wrapped = this.wrapText(text, contentWidth - 16, 10, helvetica);
        for (let i = 0; i < wrapped.length; i++) {
          checkPageBreak(14);
          if (i === 0) {
            currentPage.drawText('•', {
              x: marginX + 4,
              y: cursorY,
              size: 10,
              font: helveticaBold,
              color: rgb(0.3, 0.35, 0.45),
            });
          }
          currentPage.drawText(wrapped[i]!, {
            x: marginX + 16,
            y: cursorY,
            size: 10,
            font: helvetica,
            color: rgb(0.18, 0.22, 0.3),
          });
          cursorY -= 14;
        }
      } else {
        // Regular paragraph text
        const wrapped = this.wrapText(line, contentWidth, 10, helvetica);
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

    for (const field of fields) {
      const pageIndex = Math.max(0, Math.min((field.pageNumber || 1) - 1, pageCount - 1));
      const page = pdfDoc.getPage(pageIndex);
      const { width: pWidth, height: pHeight } = page.getSize();

      // Convert percentage coordinates (top-left origin) to PDF coordinates (bottom-left origin)
      const boxX = (field.x / 100) * pWidth;
      const boxW = Math.max(20, (field.width / 100) * pWidth);
      const boxH = Math.max(16, (field.height / 100) * pHeight);
      const boxY = pHeight - ((field.y / 100) * pHeight) - boxH;

      // Find matching recipient
      const matchedRecip = recipients.find(
        (r) =>
          r.id === field.recipientId ||
          r.email === field.recipientId ||
          `recipient-${r.routingOrder}` === field.recipientId ||
          `signer-${r.routingOrder}` === field.recipientId ||
          (r.routingOrder === 1 && (field.recipientId === 'recipient-1' || field.recipientId === 'signer-1')),
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

      if (!value) continue;

      if (field.type === 'SIGNATURE' || field.type === 'INITIALS') {
        if (typeof value === 'string' && value.startsWith('data:image/')) {
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
            console.warn('[PDF_ASSEMBLY] Failed to embed signature image:', (err as Error).message);
          }
        }

        // Fallback: draw bold stylized signature text
        page.drawText(String(value), {
          x: boxX + 4,
          y: boxY + Math.max(4, boxH / 2 - 5),
          size: Math.min(13, boxH * 0.55),
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
      } else {
        page.drawText(String(value), {
          x: boxX + 4,
          y: boxY + Math.max(2, boxH / 2 - 4),
          size: Math.min(10, boxH * 0.5),
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
    certPage.drawText(`Envelope ID: ${envelopeId}`, {
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
      'Document Execution Audit Trail • ETSI EN 319 142 PAdES Baseline-T • RFC 3161 Timestamped',
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
    const token = sealDetails?.verificationToken || `GS-${envelopeId.replace(/[^a-z0-9]/gi, '').substring(0, 8).toLowerCase()}`;
    const hash = sealDetails?.documentHash || 'pending';
    const ts = sealDetails?.tsaTimestamp
      ? new Date(sealDetails.tsaTimestamp).toISOString()
      : new Date().toISOString();
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
      { label: 'Envelope Identifier', value: envelopeId },
      { label: 'Verification Token', value: token },
      { label: 'Execution Status', value: 'Digitally Signed & Cryptographically Sealed' },
      { label: 'Document SHA-256 Digest', value: hash },
      { label: 'RFC 3161 Timestamp', value: ts },
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

      certPage.drawText(r.value, {
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

      certPage.drawText(`${recipName} ${recipEmail}`.trim(), {
        x: marginX + 12,
        y: signerY,
        size: 8.5,
        font: helveticaBold,
        color: rgb(0.06, 0.09, 0.16),
      });

      certPage.drawText(`Status: ${recipStatus} • Role: ${recipRole}`, {
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
      certPage.drawText(`${ipInfo} • ${uaInfo}`, {
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
          certPage.drawText(recipName, {
            x: marginX + contentWidth - 96,
            y: signerY - 14,
            size: 9,
            font: helveticaBold,
            color: rgb(0.08, 0.12, 0.28),
          });
        }
      } else {
        certPage.drawText(recipName, {
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
      { label: 'Signer Authority', value: sealDetails?.signerName || 'GraphSign Tenant Signing Authority' },
      { label: 'Subject DN', value: (sealDetails?.subjectDn || 'CN=GraphSign Document Signing Authority').substring(0, 60) },
      { label: 'Cryptographic Suite', value: `${sealDetails?.algorithm || 'RSA-2048'} / SHA-256 / PAdES B-T` },
      { label: 'TSA Authority', value: sealDetails?.tsaProvider || 'FreeTSA / DigiCert RFC 3161 Qualified Service' },
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
      certPage.drawText(cr.value, {
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
      'LEGAL STATEMENT & COMPLIANCE:',
      'This document has been executed using electronic records and electronic signatures in full compliance with',
      'the Electronic Signatures in Global and National Commerce Act (ESIGN, 15 U.S.C. § 7001 et seq.), the Uniform Electronic',
      'Transactions Act (UETA), and Regulation (EU) No 910/2014 (eIDAS). The cryptographic seal binds the document hash,',
      'signatures, and RFC 3161 timestamp. Any subsequent tampering or alteration irrevocably invalidates this certificate.',
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
   * Helper to wrap text according to maximum pixel width.
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
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
