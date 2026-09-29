import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PublicVerificationReport } from './verification-service.js';

/** Produces a paginated audit certificate without modifying the signed artifact. */
export async function createAuditCertificatePdf(
  report: PublicVerificationReport,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 785;
  const line = (text: string, heading = false) => {
    const clean = text.replace(/[^\x20-\x7e]/g, '?');
    const words = clean.split(' ');
    let row = '';
    const rows: string[] = [];
    for (const word of words) {
      // Hashes and long tokens must also wrap within the printable width.
      for (const part of word.match(/.{1,65}/g) || ['']) {
        if ((row + part).length > 75) {
          rows.push(row);
          row = '';
        }
        row += (row ? ' ' : '') + part;
      }
    }
    rows.push(row);
    for (const value of rows) {
      if (y < 60) {
        page = pdf.addPage([595.28, 841.89]);
        y = 785;
      }
      page.drawText(value, {
        x: 48,
        y,
        size: heading ? 16 : 10,
        font: heading ? bold : font,
        color: heading ? rgb(0.76, 0.06, 0.12) : rgb(0.09, 0.1, 0.12),
      });
      y -= heading ? 28 : 17;
    }
    y -= 7;
  };
  line('graphsign.ink', true);
  line('Document audit certificate', true);
  line(`Agreement: ${report.documentTitle}`);
  line(`Organisation: ${report.organisationName}`);
  line(`Verification reference: ${report.verificationToken}`);
  line(`Verification status: ${report.status}`);
  if (report.message) line(report.message);
  line(`Completed: ${report.completedAt || 'Not recorded'}`);
  line(`Participants signed: ${report.signedSigners}/${report.totalSigners}`);
  for (const participant of report.participants || []) {
    line(`Participant: ${participant.name} (${participant.email})`);
    line(`Status: ${participant.status}. Signed: ${participant.signedAt || 'Not recorded'}`);
  }
  if (report.signerDetails) {
    line(`Signer: ${report.signerDetails.name || 'Not recorded'}`);
    line(`Signer email: ${report.signerDetails.email || 'Not recorded'}`);
    line(`Signed: ${report.signerDetails.timestamp || 'Not recorded'}`);
  }
  line(`Document SHA-256: ${report.documentHash}`);
  line(`Signature profile: ${report.sealDetails.padesLevel}`);
  line(`Certificate: ${report.sealDetails.certificateSubject || 'Not recorded'}`);
  line(`Timestamp: ${report.sealDetails.tsaTimestamp || 'Not verified'}`);
  line(`Verify: ${report.verificationUrl || 'Use the verification reference on graphsign.ink'}`);
  line(
    'This audit certificate is separate from the signed PDF. Its status reflects the verification evidence available at generation time.',
  );
  return pdf.save();
}
