package ink.graphsign.signing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.Executors;

/** Private API for PDF signing and independent signature validation. */
public final class SigningServer {
  private static final ObjectMapper JSON = new ObjectMapper();
  public static void main(String[] args) throws Exception {
    String token = System.getenv("SIGNING_SERVICE_TOKEN");
    if (token == null || token.length() < 32) throw new IllegalStateException("A strong service token is required");
    PdfSigner signer = new PdfSigner();
    HttpServer server = HttpServer.create(new InetSocketAddress(8080), 32);
    server.setExecutor(Executors.newFixedThreadPool(4));
    server.createContext("/", exchange -> {
      int status = 200;
      Object result;
      try {
        String auth = exchange.getRequestHeaders().getFirst("Authorization");
        if (auth == null || !MessageDigest.isEqual(auth.getBytes(StandardCharsets.UTF_8),
            ("Bearer " + token).getBytes(StandardCharsets.UTF_8))) {
          status = 401; result = Map.of("error", "Unauthorized");
        } else if (!exchange.getRequestMethod().equals("POST")) {
          status = 405; result = Map.of("error", "POST required");
        } else {
          byte[] request = exchange.getRequestBody().readNBytes(24 * 1024 * 1024 + 1);
          if (request.length > 24 * 1024 * 1024) throw new IllegalArgumentException("Request too large");
          JsonNode body = JSON.readTree(request);
          result = switch (exchange.getRequestURI().getPath()) {
            case "/sign" -> signer.sign(Base64.getDecoder().decode(body.path("pdfBase64").asText()), body);
            case "/verify" -> PdfSigner.verify(Base64.getDecoder().decode(body.path("pdfBase64").asText()));
            case "/certificate" -> signer.certificate(body);
            case "/sign-hash" -> signer.signHash(body);
            case "/timestamp" -> PdfSigner.timestampDigest(body);
            default -> { status = 404; yield Map.of("error", "Not found"); }
          };
        }
      } catch (Exception error) {
        status = 422; result = Map.of("error", "Signature processing failed");
        // Customer PDF content, certificates, and credentials must never enter logs.
        System.err.println("Signature processing failed: " + error.getClass().getSimpleName());
      }
      byte[] output = JSON.writeValueAsBytes(result);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.getResponseHeaders().set("Cache-Control", "no-store");
      exchange.sendResponseHeaders(status, output.length);
      exchange.getResponseBody().write(output);
      exchange.close();
    });
    server.start();
  }
}
