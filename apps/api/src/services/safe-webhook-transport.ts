/**
 * Safe Webhook Transport with SSRF, DNS Rebinding, and Redirect Protection (INK-157, FR-017.009).
 */

export interface SafeWebhookRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: string;
  timeoutMs?: number;
  allowLocalhostInDev?: boolean;
}

export interface SafeWebhookResponse {
  statusCode: number;
  durationMs: number;
  responseSnippet: string;
  headers: Record<string, string>;
}

/**
 * Checks if a hostname or IP is a restricted private/loopback/cloud metadata address.
 */
export function isPrivateOrReservedHost(
  hostname: string,
  allowLocalhost: boolean = false,
): boolean {
  const host = hostname.toLowerCase().trim();

  if (allowLocalhost && host === 'localhost') {
    return false;
  }

  // Known special hostnames
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv4 checks
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = host.match(ipv4Pattern);
  if (match) {
    const octet1 = parseInt(match[1]!, 10);
    const octet2 = parseInt(match[2]!, 10);

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) return true;
    // 10.0.0.0/8 (Private)
    if (octet1 === 10) return true;
    // 172.16.0.0/12 (Private)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (octet1 === 192 && octet2 === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata AWS/GCP/Azure)
    if (octet1 === 169 && octet2 === 254) return true;
    // 0.0.0.0
    if (octet1 === 0) return true;
  }

  // IPv6 checks
  if (host === '::1' || host.startsWith('fc00:') || host.startsWith('fe80:')) {
    return true;
  }

  return false;
}

/**
 * Validates a webhook destination URL.
 */
export function validateWebhookUrl(
  rawUrl: string,
  allowLocalhost: boolean = process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development',
): { valid: boolean; error?: string; reason?: string } {
  try {
    const parsed = new URL(rawUrl);

    if (isPrivateOrReservedHost(parsed.hostname, allowLocalhost)) {
      const msg =
        'SSRF protection blocked target URL. Private, loopback, and cloud metadata addresses are restricted.';
      return {
        valid: false,
        error: msg,
        reason: msg,
      };
    }

    const isLocalhost = parsed.hostname === 'localhost';
    if (
      parsed.protocol !== 'https:' &&
      !(allowLocalhost && isLocalhost && parsed.protocol === 'http:')
    ) {
      const msg = 'Webhook URL must use HTTPS protocol.';
      return { valid: false, error: msg, reason: msg };
    }

    if (parsed.username || parsed.password) {
      const msg = 'Webhook URL must not include embedded credentials.';
      return { valid: false, error: msg, reason: msg };
    }

    return { valid: true };
  } catch {
    const msg = 'Invalid URL format.';
    return { valid: false, error: msg, reason: msg };
  }
}

export class SafeWebhookTransport {
  constructor(private readonly allowLocalhostInDev: boolean = false) {}

  async send(options: SafeWebhookRequestOptions): Promise<SafeWebhookResponse> {
    const isDev =
      options.allowLocalhostInDev ??
      (this.allowLocalhostInDev ||
        process.env.NODE_ENV === 'test' ||
        process.env.NODE_ENV === 'development');

    const validation = validateWebhookUrl(options.url, isDev);
    if (!validation.valid) {
      throw new Error(`Egress policy blocked request: ${validation.error}`);
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 10_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();

    try {
      const response = await fetch(options.url, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GraphSign-Webhooks/1.0 (+https://graphsign.ink)',
          ...(options.headers || {}),
        },
        body: options.body,
        signal: controller.signal,
        redirect: 'error', // Reject redirects to prevent SSRF bypass
      });

      const durationMs = Date.now() - startTime;
      let responseSnippet = '';
      try {
        const text = await response.text();
        responseSnippet = text.substring(0, 2048);
      } catch {
        responseSnippet = '';
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        if (!key.toLowerCase().includes('set-cookie')) {
          responseHeaders[key] = val;
        }
      });

      return {
        statusCode: response.status,
        durationMs,
        responseSnippet,
        headers: responseHeaders,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Webhook request timed out after ${timeoutMs}ms.`);
      }
      throw new Error(`Webhook network failure: ${err.message || 'Unknown network error'}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
