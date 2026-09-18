package ink.graphsign.signing;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.*;
import java.math.BigInteger;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.time.Duration;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.*;
import org.bouncycastle.asn1.*;
import org.bouncycastle.asn1.cms.*;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.asn1.pkcs.PKCSObjectIdentifiers;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.X500NameBuilder;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.PEMKeyPair;
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter;
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo;
import org.bouncycastle.asn1.x509.*;
import org.bouncycastle.asn1.ess.*;
import org.bouncycastle.cert.*;
import org.bouncycastle.cert.jcajce.*;
import org.bouncycastle.cms.*;
import org.bouncycastle.cms.jcajce.*;
import org.bouncycastle.operator.jcajce.*;
import org.bouncycastle.tsp.*;

/** Standards-based PDFBox/CMS signer with durable encrypted key custody. */
public final class PdfSigner {
  private final Path keyDirectory;
  private final char[] password;
  public PdfSigner() {
    keyDirectory = Path.of(Optional.ofNullable(System.getenv("KEYSTORE_DIR")).orElse("/keys"));
    String secret = System.getenv("KEYSTORE_PASSWORD");
    if (secret == null || secret.length() < 16) throw new IllegalStateException("Key store password required");
    password = secret.toCharArray();
  }
  PdfSigner(Path directory, char[] secret) { keyDirectory = directory; password = secret; }

  public synchronized Map<String, Object> sign(byte[] bytes, JsonNode body) throws Exception {
    String organisation = body.path("organisationId").asText();
    String certId = body.path("certificateId").asText();
    if (!organisation.matches("[A-Za-z0-9_-]{1,100}") || !certId.matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("Invalid certificate identity");
    KeyStore store = loadStore(organisation, certId, body);
    PrivateKey key = (PrivateKey) store.getKey("signing", password);
    X509Certificate cert = (X509Certificate) store.getCertificate("signing");
    cert.checkValidity();
    String pem = pem(cert);
    if (body.path("selfSigned").asBoolean() && !body.path("certificatePem").asText().isBlank() && !pem.replaceAll("\\s", "").equals(body.path("certificatePem").asText().replaceAll("\\s", ""))) throw new GeneralSecurityException("Certificate custody mismatch");
    // BYO profiles must refer to the exact certificate provisioned in custody.
    if (!body.path("selfSigned").asBoolean() && !pem.replaceAll("\\s", "")
        .equals(body.path("certificatePem").asText().replaceAll("\\s", "")))
      throw new IllegalArgumentException("Certificate does not match custody profile");
    String tsaUrl = body.path("tsaUrl").asText("");
    if (tsaUrl.isBlank()) tsaUrl = System.getenv("TSA_URL");
    final String timestampUrl = tsaUrl;
    final String[] timestamp = { null };
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (PDDocument document = Loader.loadPDF(bytes); SignatureOptions options = new SignatureOptions()) {
      PDSignature signature = new PDSignature();
      signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
      signature.setSubFilter(PDSignature.SUBFILTER_ETSI_CADES_DETACHED);
      signature.setName(cert.getSubjectX500Principal().getName());
      signature.setReason("graphsign.ink verification " + body.path("verificationToken").asText());
      signature.setSignDate(Calendar.getInstance());
      options.setPreferredSignatureSize(32768);
      document.addSignature(signature, content -> {
        try {
          byte[] signedBytes = content.readAllBytes();
          CMSSignedDataGenerator generator = new CMSSignedDataGenerator();
          String algorithm = key.getAlgorithm().equals("EC") ? "SHA256withECDSA" : "SHA256withRSA";
          ASN1EncodableVector signedAttributes = new ASN1EncodableVector();
          signedAttributes.add(new Attribute(PKCSObjectIdentifiers.id_aa_signingCertificateV2,
            new DERSet(new SigningCertificateV2(new ESSCertIDv2(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()))))));
          generator.addSignerInfoGenerator(new JcaSignerInfoGeneratorBuilder(
            new JcaDigestCalculatorProviderBuilder().build()).setSignedAttributeGenerator(
              new DefaultSignedAttributeTableGenerator(new AttributeTable(signedAttributes))).build(
              new JcaContentSignerBuilder(algorithm).build(key), cert));
          generator.addCertificates(new JcaCertStore(Arrays.asList(store.getCertificateChain("signing"))));
          CMSSignedData cms = generator.generate(new CMSProcessableByteArray(signedBytes), false);
          if (timestampUrl != null && !timestampUrl.isBlank()) {
            SignerInformation signer = cms.getSignerInfos().getSigners().iterator().next();
            TimeStampToken token = timestamp(signer.getSignature(), timestampUrl);
            timestamp[0] = token.getTimeStampInfo().getGenTime().toInstant().toString();
            ASN1EncodableVector attributes = new ASN1EncodableVector();
            attributes.add(new Attribute(PKCSObjectIdentifiers.id_aa_signatureTimeStampToken,
              new DERSet(token.toCMSSignedData().toASN1Structure())));
            SignerInformation stamped = SignerInformation.replaceUnsignedAttributes(signer, new AttributeTable(attributes));
            cms = CMSSignedData.replaceSigners(cms, new SignerInformationStore(List.of(stamped)));
          }
          return cms.getEncoded();
        } catch (Exception error) { throw new IOException("CMS signing failed", error); }
      }, options);
      document.saveIncremental(output);
    }
    byte[] pdf = output.toByteArray();
    if (!Boolean.TRUE.equals(verify(pdf).get("valid"))) throw new GeneralSecurityException("Output failed verification");
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("pdfBase64", Base64.getEncoder().encodeToString(pdf));
    result.put("certificatePem", pem);
    result.put("timestamp", timestamp[0]);
    result.put("padesLevel", timestamp[0] == null ? "B_B" : "B_T");
    result.putAll(certificateMetadata(cert));
    return result;
  }

  public synchronized Map<String, Object> certificate(JsonNode body) throws Exception {
    String organisation = body.path("organisationId").asText();
    String certId = body.path("certificateId").asText();
    if (!organisation.matches("[A-Za-z0-9_-]{1,100}") || !certId.matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("Invalid identity");
    if (!body.path("selfSigned").asBoolean() && body.path("privateKeyPem").asText().isBlank()) {
      X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(
        new ByteArrayInputStream(body.path("certificatePem").asText().getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
      cert.checkValidity();
      return certificateMetadata(cert);
    }
    return certificateMetadata((X509Certificate) loadStore(organisation, certId, body).getCertificate("signing"));
  }

  private static Map<String, Object> certificateMetadata(X509Certificate cert) throws Exception {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("certificatePem", pem(cert));
    result.put("subjectDn", cert.getSubjectX500Principal().getName());
    result.put("issuerDn", cert.getIssuerX500Principal().getName());
    result.put("validFrom", cert.getNotBefore().toInstant().toString());
    result.put("validTo", cert.getNotAfter().toInstant().toString());
    result.put("serialNumber", cert.getSerialNumber().toString(16));
    if (cert.getPublicKey() instanceof java.security.interfaces.RSAPublicKey rsa)
      result.put("algorithm", rsa.getModulus().bitLength() > 2048 ? "RSA_4096" : "RSA_2048");
    else result.put("algorithm", ((java.security.interfaces.ECPublicKey) cert.getPublicKey()).getParams().getCurve().getField().getFieldSize() > 256 ? "ECDSA_P384" : "ECDSA_P256");
    return result;
  }

  private KeyStore loadStore(String organisation, String certId, JsonNode body) throws Exception {
    if (!organisation.matches("[A-Za-z0-9_-]{1,100}") || !certId.matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("Invalid identity");
    Files.createDirectories(keyDirectory);
    Path file = keyDirectory.resolve(organisation + "_" + certId + ".p12");
    KeyStore store = KeyStore.getInstance("PKCS12");
    if (Files.exists(file)) {
      try (InputStream input = Files.newInputStream(file)) { store.load(input, password); }
      return store;
    }
    store.load(null, password);
    if (!body.path("selfSigned").asBoolean()) {
      X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(
        new ByteArrayInputStream(body.path("certificatePem").asText().getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
      PrivateKey key;
      try (PEMParser parser = new PEMParser(new StringReader(body.path("privateKeyPem").asText()))) {
        Object parsed = parser.readObject();
        PrivateKeyInfo info = parsed instanceof PEMKeyPair pair ? pair.getPrivateKeyInfo() : (PrivateKeyInfo) parsed;
        key = new JcaPEMKeyConverter().getPrivateKey(info);
      }
      Signature proof = Signature.getInstance(key.getAlgorithm().equals("EC") ? "SHA256withECDSA" : "SHA256withRSA");
      byte[] challenge = new byte[32]; new SecureRandom().nextBytes(challenge);
      proof.initSign(key); proof.update(challenge); byte[] signature = proof.sign();
      proof.initVerify(cert.getPublicKey()); proof.update(challenge);
      if (!proof.verify(signature)) throw new GeneralSecurityException("Certificate and private key mismatch");
      cert.checkValidity();
      List<java.security.cert.Certificate> chain = new ArrayList<>(); chain.add(cert);
      if (!body.path("chainPem").asText().isBlank()) chain.addAll(CertificateFactory.getInstance("X.509").generateCertificates(
        new ByteArrayInputStream(body.path("chainPem").asText().getBytes(java.nio.charset.StandardCharsets.US_ASCII))));
      store.setKeyEntry("signing", key, password, chain.toArray(java.security.cert.Certificate[]::new));
    } else {
    String algorithm = body.path("algorithm").asText("RSA_2048");
    KeyPairGenerator generator = KeyPairGenerator.getInstance(algorithm.startsWith("ECDSA") ? "EC" : "RSA");
    if (algorithm.startsWith("ECDSA")) generator.initialize(new java.security.spec.ECGenParameterSpec(algorithm.equals("ECDSA_P384") ? "secp384r1" : "secp256r1"));
    else generator.initialize(algorithm.equals("RSA_4096") ? 4096 : 2048);
    KeyPair pair = generator.generateKeyPair();
    Date now = new Date();
    X500NameBuilder name = new X500NameBuilder(BCStyle.INSTANCE).addRDN(BCStyle.CN, body.path("commonName").asText("graphsign.ink Document Signing"));
    String[] fields = {"organization", "organizationUnit", "country", "state", "locality", "email"};
    ASN1ObjectIdentifier[] identifiers = {BCStyle.O, BCStyle.OU, BCStyle.C, BCStyle.ST, BCStyle.L, BCStyle.EmailAddress};
    for (int i = 0; i < fields.length; i++) if (!body.path(fields[i]).asText().isBlank()) name.addRDN(identifiers[i], body.path(fields[i]).asText());
    X500Name subject = name.build();
    X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(subject,
      new BigInteger(160, new SecureRandom()), new Date(now.getTime() - 60000),
      new Date(now.getTime() + Math.min(3650, Math.max(1, body.path("validityDays").asInt(730))) * 86400000L), subject, pair.getPublic());
    builder.addExtension(org.bouncycastle.asn1.x509.Extension.keyUsage, true,
      new KeyUsage(KeyUsage.digitalSignature | KeyUsage.nonRepudiation));
    X509Certificate cert = new JcaX509CertificateConverter().getCertificate(builder.build(
      new JcaContentSignerBuilder(algorithm.startsWith("ECDSA") ? "SHA256withECDSA" : "SHA256withRSA").build(pair.getPrivate())));
    cert.verify(pair.getPublic());
    store.setKeyEntry("signing", pair.getPrivate(), password, new java.security.cert.Certificate[] { cert });
    }
    Path temporary = Files.createTempFile(keyDirectory, "custody-", ".p12");
    try {
      try (OutputStream output = Files.newOutputStream(temporary)) { store.store(output, password); }
      Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE);
    } finally { Files.deleteIfExists(temporary); }
    return store;
  }

  private static TimeStampToken timestamp(byte[] signature, String url) throws Exception {
    return timestamp(signature, url, false);
  }
  private static TimeStampToken timestamp(byte[] signature, String url, boolean prehashed) throws Exception {
    URI uri = URI.create(url);
    if (!"https".equals(uri.getScheme())) throw new GeneralSecurityException("HTTPS TSA required");
    String allowed = System.getenv("TSA_ALLOWED_HOSTS");
    if (allowed == null || !Arrays.asList(allowed.split(",")).contains(uri.getHost()))
      throw new GeneralSecurityException("TSA host is not configured");
    for (InetAddress address : InetAddress.getAllByName(uri.getHost()))
      if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
          || address.isSiteLocalAddress()) throw new GeneralSecurityException("Restricted TSA address");
    byte[] digest = prehashed ? signature : MessageDigest.getInstance("SHA-256").digest(signature);
    TimeStampRequestGenerator generator = new TimeStampRequestGenerator();
    generator.setCertReq(true);
    TimeStampRequest request = generator.generate(TSPAlgorithms.SHA256, digest, new BigInteger(128, new SecureRandom()));
    HttpRequest http = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(15))
      .header("Content-Type", "application/timestamp-query").POST(HttpRequest.BodyPublishers.ofByteArray(request.getEncoded())).build();
    HttpResponse<byte[]> response = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
      .connectTimeout(Duration.ofSeconds(5)).build().send(http, HttpResponse.BodyHandlers.ofByteArray());
    if (response.statusCode() != 200) throw new GeneralSecurityException("TSA unavailable");
    TimeStampResponse parsed = new TimeStampResponse(response.body());
    parsed.validate(request);
    TimeStampToken token = parsed.getTimeStampToken();
    if (token == null) throw new GeneralSecurityException("TSA rejected request");
    validateTimestamp(token, signature, true, prehashed);
    return token;
  }

  private static void validateTimestamp(TimeStampToken token, byte[] signature, boolean requireTrust) throws Exception {
    validateTimestamp(token, signature, requireTrust, false);
  }
  private static void validateTimestamp(TimeStampToken token, byte[] signature, boolean requireTrust, boolean prehashed) throws Exception {
    String digestName = token.getTimeStampInfo().getMessageImprintAlgOID().equals(TSPAlgorithms.SHA256) ? "SHA-256" : "SHA-512";
    if (!MessageDigest.isEqual(token.getTimeStampInfo().getMessageImprintDigest(),
        prehashed ? signature : MessageDigest.getInstance(digestName).digest(signature))) throw new GeneralSecurityException("Timestamp digest mismatch");
    X509CertificateHolder holder = (X509CertificateHolder) token.getCertificates().getMatches(token.getSID()).iterator().next();
    token.validate(new JcaSimpleSignerInfoVerifierBuilder().build(holder));
    X509Certificate cert = new JcaX509CertificateConverter().getCertificate(holder);
    cert.checkValidity(token.getTimeStampInfo().getGenTime());
    String expected = System.getenv("TSA_CERT_SHA256");
    if (requireTrust && (expected == null || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
        .digest(cert.getEncoded())).equalsIgnoreCase(expected))) throw new GeneralSecurityException("TSA certificate is not trusted");
  }

  public synchronized Map<String, Object> signHash(JsonNode body) throws Exception {
    // Raw signatures use only a previously provisioned tenant credential.
    KeyStore store = loadStore(body.path("organisationId").asText(), body.path("certificateId").asText(), body);
    PrivateKey key = (PrivateKey) store.getKey("signing", password);
    byte[] digest = Base64.getDecoder().decode(body.path("hashBase64").asText());
    if (digest.length != 32) throw new IllegalArgumentException("SHA-256 digest required");
    Signature signer = Signature.getInstance(key.getAlgorithm().equals("EC") ? "NONEwithECDSA" : "NONEwithRSA");
    signer.initSign(key);
    if (key.getAlgorithm().equals("EC")) signer.update(digest);
    else signer.update(new DigestInfo(new AlgorithmIdentifier(TSPAlgorithms.SHA256, DERNull.INSTANCE), digest).getEncoded());
    return Map.of("signature", Base64.getEncoder().encodeToString(signer.sign()));
  }

  public static Map<String, Object> timestampDigest(JsonNode body) throws Exception {
    String url = body.path("tsaUrl").asText("");
    if (url.isBlank()) url = System.getenv("TSA_URL");
    if (url == null) throw new GeneralSecurityException("TSA is not configured");
    byte[] digest = Base64.getDecoder().decode(body.path("digestBase64").asText());
    if (digest.length != 32) throw new IllegalArgumentException("SHA-256 digest required");
    TimeStampToken token = timestamp(digest, url, true);
    return Map.of("tokenBase64", Base64.getEncoder().encodeToString(token.getEncoded()),
      "timestamp", token.getTimeStampInfo().getGenTime().toInstant().toString(), "tsaUrl", url);
  }

  public static Map<String, Object> verify(byte[] bytes) throws Exception {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("valid", false); result.put("subject", ""); result.put("signingTime", null);
    result.put("timestamp", null); result.put("padesLevel", "B_B");
    try (PDDocument document = Loader.loadPDF(bytes)) {
      List<PDSignature> signatures = document.getSignatureDictionaries();
      if (signatures.isEmpty()) return result;
      for (int index = 0; index < signatures.size(); index++) {
        PDSignature signature = signatures.get(index);
        int[] range = signature.getByteRange();
        if (range.length != 4 || range[0] != 0 || range[1] <= 0 || range[2] <= range[1]
            || range[3] <= 0 || (long) range[2] + range[3] > bytes.length) return result;
        if (index == signatures.size() - 1 && (long) range[2] + range[3] != bytes.length) return result;
        String excluded = new String(bytes, range[1], range[2] - range[1], java.nio.charset.StandardCharsets.US_ASCII);
        if (!excluded.matches("<[0-9A-Fa-f\\s]+>")) return result;
        CMSSignedData cms = new CMSSignedData(new CMSProcessableByteArray(signature.getSignedContent(bytes)), signature.getContents(bytes));
        if (cms.getSignerInfos().size() != 1) return result;
        SignerInformation signer = cms.getSignerInfos().getSigners().iterator().next();
        X509CertificateHolder holder = (X509CertificateHolder) cms.getCertificates().getMatches(signer.getSID()).iterator().next();
        if (!signer.verify(new JcaSimpleSignerInfoVerifierBuilder().build(holder))) return result;
        result.put("subject", holder.getSubject().toString());
        if (signature.getSignDate() != null) result.put("signingTime", signature.getSignDate().toInstant().toString());
        AttributeTable attributes = signer.getUnsignedAttributes();
        Attribute attribute = attributes == null ? null : attributes.get(PKCSObjectIdentifiers.id_aa_signatureTimeStampToken);
        if (attribute != null) {
          TimeStampToken token = new TimeStampToken(ContentInfo.getInstance(attribute.getAttrValues().getObjectAt(0)));
          validateTimestamp(token, signer.getSignature(), true);
          result.put("timestamp", token.getTimeStampInfo().getGenTime().toInstant().toString());
          result.put("padesLevel", "B_T");
        }
      }
      result.put("valid", true);
    } catch (Exception invalidSignature) {
      result.put("valid", false);
    }
    return result;
  }

  private static String pem(X509Certificate cert) throws CertificateEncodingException {
    return "-----BEGIN CERTIFICATE-----\n" + Base64.getMimeEncoder(64, new byte[] { '\n' }).encodeToString(cert.getEncoded()) + "\n-----END CERTIFICATE-----";
  }
}
