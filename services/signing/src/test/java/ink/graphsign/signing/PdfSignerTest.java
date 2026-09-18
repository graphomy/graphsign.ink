package ink.graphsign.signing;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class PdfSignerTest {
  @TempDir Path keys;
  private byte[] document() throws Exception {
    try (PDDocument doc = new PDDocument()) {
      doc.addPage(new PDPage()); doc.addPage(new PDPage());
      ByteArrayOutputStream output = new ByteArrayOutputStream(); doc.save(output); return output.toByteArray();
    }
  }
  private Map<String, Object> sign(byte[] source) throws Exception {
    return new PdfSigner(keys, "test-password-for-custody".toCharArray()).sign(source,
      new ObjectMapper().valueToTree(Map.of("organisationId", "tenant-a", "certificateId", "cert-a",
        "selfSigned", true, "verificationToken", "GS-test")));
  }
  @Test void signsRealMultiPagePdfAndDetectsAppendedContent() throws Exception {
    Map<String, Object> result = sign(document());
    byte[] signed = Base64.getDecoder().decode((String) result.get("pdfBase64"));
    assertEquals(true, PdfSigner.verify(signed).get("valid"));
    try (PDDocument doc = Loader.loadPDF(signed)) {
      assertEquals(2, doc.getNumberOfPages()); assertEquals(1, doc.getSignatureDictionaries().size());
    }
    assertEquals("B_B", result.get("padesLevel")); assertNull(result.get("timestamp"));
    byte[] tampered = signed.clone();
    int marker = new String(signed, java.nio.charset.StandardCharsets.ISO_8859_1).indexOf("GS-test");
    assertTrue(marker >= 0); tampered[marker + 6] = 'u';
    assertEquals(false, PdfSigner.verify(tampered).get("valid"));
    byte[] changed = Arrays.copyOf(signed, signed.length + 1);
    assertEquals(false, PdfSigner.verify(changed).get("valid"));
  }
  @Test void preservesPriorSignaturesAndUsesDurableCertificate() throws Exception {
    Map<String, Object> first = sign(document());
    byte[] bytes = Base64.getDecoder().decode((String) first.get("pdfBase64"));
    Map<String, Object> second = sign(bytes);
    assertEquals(first.get("certificatePem"), second.get("certificatePem"));
    byte[] result = Base64.getDecoder().decode((String) second.get("pdfBase64"));
    assertEquals(true, PdfSigner.verify(result).get("valid"));
    try (PDDocument doc = Loader.loadPDF(result)) { assertEquals(2, doc.getSignatureDictionaries().size()); }
  }
  @Test void signsHashUsingTheProvisionedCredential() throws Exception {
    Map<String, Object> profile = sign(document());
    byte[] message = "CSC signing proof".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(message);
    Map<String, Object> result = new PdfSigner(keys, "test-password-for-custody".toCharArray()).signHash(new ObjectMapper().valueToTree(Map.of("organisationId", "tenant-a", "certificateId", "cert-a", "hashBase64", Base64.getEncoder().encodeToString(hash))));
    java.security.cert.X509Certificate cert = (java.security.cert.X509Certificate) java.security.cert.CertificateFactory.getInstance("X.509").generateCertificate(new java.io.ByteArrayInputStream(((String) profile.get("certificatePem")).getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
    java.security.Signature verifier = java.security.Signature.getInstance("SHA256withRSA"); verifier.initVerify(cert); verifier.update(message);
    assertTrue(verifier.verify(Base64.getDecoder().decode((String) result.get("signature"))));
  }
  @Test void rejectsUnsignedPdf() throws Exception { assertEquals(false, PdfSigner.verify(document()).get("valid")); }
}
