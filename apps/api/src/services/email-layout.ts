function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

/** Shared, email-safe branding for every application notification. */
export function renderEmailLayout(subject: string, content: string, webUrl: string) {
  const base = (webUrl.split(',')[0] || 'https://graphsign.ink').trim().replace(/\/+$/, '');
  const title = escapeHtml(subject);
  const body = content
    .trim()
    .replace(/^<div[^>]*>/, '')
    .replace(/<\/div>\s*$/, '')
    .replace(/font-family:\s*sans-serif/g, 'font-family: Arial, Helvetica, sans-serif')
    .replace(/#[0-9a-f]{6}/gi, (color) =>
      ['#ba0000', '#2563eb', '#007bff', '#1a73e8', '#dc2626'].includes(color.toLowerCase())
        ? '#c2101f'
        : color,
    );
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f8fa;color:#16181d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">
<div style="display:none;max-height:0;overflow:hidden">${title}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fa"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e7ec;border-radius:8px">
<tr><td style="padding:28px 32px;border-bottom:1px solid #e3e7ec"><a href="${escapeHtml(base)}"><img src="${escapeHtml(base)}/graphsign-email-logo.png" width="220" alt="graphsign.ink" style="display:block;width:220px;max-width:100%;height:auto;border:0"></a></td></tr>
<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#16181d">${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e3e7ec;font-size:12px;color:#6b7280">Sent by graphsign.ink<br><a href="${escapeHtml(base)}" style="color:#c2101f;text-decoration:underline">Open graphsign.ink</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = content
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|h[1-6])>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return { html, text };
}
