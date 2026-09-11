import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BadRequestError } from '../utils/errors.js';
import type { VerificationService, PublicVerificationReport, VerifyContext } from './verification-service.js';
import type { AuditService } from './audit-service.js';

export interface BatchItemInput {
  token?: string;
  hash?: string;
  fileData?: string; // base64 or text
  filename?: string;
}

export interface BatchVerificationResult {
  totalDocuments: number;
  validSignatures: number;
  invalidSignatures: number;
  errors: Array<{
    index: number;
    filename?: string;
    token?: string;
    error: string;
    status: string;
  }>;
  results: Array<PublicVerificationReport & { filename?: string }>;
}

/**
 * Service for batch verification of multiple signed documents (INK-136).
 * Supports up to 100 documents per job with summary reporting and CSV/PDF export.
 */
export class BatchVerificationService {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Processes a batch of up to 100 verification requests.
   */
  async processBatch(
    items: BatchItemInput[],
    options?: { organisationId?: string; context?: VerifyContext },
  ): Promise<BatchVerificationResult> {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Error: No documents selected.');
    }

    if (items.length > 100) {
      throw new BadRequestError('Batch verification exceeds maximum limit of 100 documents per job.');
    }

    const results: Array<PublicVerificationReport & { filename?: string }> = [];
    const errors: BatchVerificationResult['errors'] = [];

    let validSignatures = 0;
    let invalidSignatures = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      try {
        let report: PublicVerificationReport;

        if (item.fileData) {
          report = await this.verificationService.verifyUploadedFile(item.fileData, {
            expectedToken: item.token,
            context: options?.context,
          });
        } else if (item.token) {
          report = await this.verificationService.verifyByToken(item.token, options?.context);
        } else if (item.hash) {
          report = await this.verificationService.verifyByHash(item.hash, options?.context);
        } else {
          throw new BadRequestError('Missing fileData, token, or hash in batch item.');
        }

        results.push({ ...report, filename: item.filename });

        if (report.isValid) {
          validSignatures++;
        } else {
          invalidSignatures++;
          errors.push({
            index: i,
            filename: item.filename,
            token: item.token || report.verificationToken,
            error: report.message || `Verification status: ${report.status}`,
            status: report.status,
          });
        }
      } catch (err: any) {
        invalidSignatures++;
        const errorMessage = err?.message || 'Verification failed';
        errors.push({
          index: i,
          filename: item.filename,
          token: item.token,
          error: errorMessage,
          status: 'ERROR',
        });

        results.push({
          isValid: false,
          status: 'NOT_FOUND',
          message: errorMessage,
          verificationToken: item.token || 'N/A',
          documentTitle: item.filename || `Document ${i + 1}`,
          documentHash: item.hash || '',
          completedAt: null,
          totalSigners: 0,
          signedSigners: 0,
          sealDetails: {
            algorithm: 'NONE',
            padesLevel: 'NONE',
            tsaUrl: null,
            tsaTimestamp: null,
          },
          organisationName: 'Unknown',
          sealedAt: new Date().toISOString(),
          filename: item.filename,
        });
      }
    }

    // Audit log batch execution and failed verifications (INK-136 AC)
    if (this.auditService) {
      try {
        await this.auditService.log({
          organisationId: options?.organisationId || '00000000-0000-0000-0000-000000000000',
          action: 'BATCH_VERIFICATION_COMPLETED',
          resourceType: 'verification_batch',
          resourceId: 'batch-' + Date.now(),
          metadata: {
            outcome: errors.length === 0 ? 'SUCCESS' : 'FAILURE',
            totalDocuments: items.length,
            validSignatures,
            invalidSignatures,
            failedCount: errors.length,
            errors: errors.slice(0, 10), // Record sample of failures
          },
          ipAddress: options?.context?.ipAddress,
          userAgent: options?.context?.userAgent,
        });
      } catch {
        // Safe execution
      }
    }

    return {
      totalDocuments: items.length,
      validSignatures,
      invalidSignatures,
      errors,
      results,
    };
  }

  /**
   * Generates a downloadable CSV summary report for a batch verification run (INK-136).
   */
  generateCsvReport(batchResult: BatchVerificationResult): string {
    const headers = [
      'Index',
      'Filename',
      'Verification Token',
      'Status',
      'Is Valid',
      'Signer Name',
      'Signer Email',
      'Signing Timestamp',
      'Algorithm',
      'TSA Provider',
      'Document Hash',
      'Error Message',
    ];

    const sanitize = (val: any): string => {
      if (val === undefined || val === null) return '';
      let str = String(val);
      // CWE-1236 CSV injection protection
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = batchResult.results.map((r, idx) => [
      sanitize(idx + 1),
      sanitize(r.filename || r.documentTitle),
      sanitize(r.verificationToken),
      sanitize(r.status),
      sanitize(r.isValid ? 'YES' : 'NO'),
      sanitize(r.signerDetails?.name || 'N/A'),
      sanitize(r.signerDetails?.email || 'N/A'),
      sanitize(r.signerDetails?.timestamp || r.completedAt || 'N/A'),
      sanitize(r.sealDetails?.algorithm || 'N/A'),
      sanitize(r.sealDetails?.tsaProvider || 'N/A'),
      sanitize(r.documentHash),
      sanitize(r.message || ''),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Generates a downloadable PDF summary report for a batch verification run (INK-136).
   */
  async generatePdfReport(batchResult: BatchVerificationResult): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    let y = height - 50;

    // Header
    page.drawText('Batch Signature Verification Report', {
      x: 50,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.2),
    });
    y -= 25;

    page.drawText(`Generated on: ${new Date().toUTCString()} | graphsign.ink Trust Authority`, {
      x: 50,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 30;

    // Summary Metrics Box
    page.drawRectangle({
      x: 50,
      y: y - 50,
      width: width - 100,
      height: 55,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page.drawText(`Total Documents: ${batchResult.totalDocuments}`, {
      x: 70,
      y: y - 25,
      size: 12,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });
    page.drawText(`Valid Signatures: ${batchResult.validSignatures}`, {
      x: 230,
      y: y - 25,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.6, 0.2),
    });
    page.drawText(`Invalid / Errors: ${batchResult.invalidSignatures}`, {
      x: 390,
      y: y - 25,
      size: 12,
      font: fontBold,
      color: rgb(0.8, 0.2, 0.2),
    });
    y -= 80;

    // Table Header
    page.drawText('Document / Filename', { x: 50, y, size: 9, font: fontBold });
    page.drawText('Token', { x: 230, y, size: 9, font: fontBold });
    page.drawText('Status', { x: 340, y, size: 9, font: fontBold });
    page.drawText('Signer', { x: 430, y, size: 9, font: fontBold });
    y -= 15;

    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 15;

    // Rows (first 25 rows on summary page)
    const displayRows = batchResult.results.slice(0, 25);
    for (const r of displayRows) {
      if (y < 60) break;

      const name = (r.filename || r.documentTitle).substring(0, 30);
      const token = (r.verificationToken || 'N/A').substring(0, 15);
      const statusColor = r.isValid ? rgb(0.1, 0.6, 0.2) : rgb(0.8, 0.2, 0.2);
      const signer = (r.signerDetails?.name || 'N/A').substring(0, 18);

      page.drawText(name, { x: 50, y, size: 8, font });
      page.drawText(token, { x: 230, y, size: 8, font });
      page.drawText(r.status, { x: 340, y, size: 8, font: fontBold, color: statusColor });
      page.drawText(signer, { x: 430, y, size: 8, font });

      y -= 18;
    }

    if (batchResult.results.length > 25) {
      page.drawText(`...and ${batchResult.results.length - 25} more items. See CSV export for complete list.`, {
        x: 50,
        y: 40,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    return await pdfDoc.save();
  }
}
