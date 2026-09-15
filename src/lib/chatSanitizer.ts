// src/lib/chatSanitizer.ts

/**
 * Escapes HTML control characters to prevent Stored and DOM-based Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safely formats chat messages:
 * - Sanitizes and escapes all raw HTML input
 * - Supports bold (**text**)
 * - Supports strikethrough (~~text~~)
 * - Supports markdown links ([title](https://...)) strictly requiring http/https protocols
 * - Supports auto-linking raw http/https URLs with rel="noopener noreferrer nofollow"
 */
export function safeFormatChatMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';

  // 1. Mandatory First Step: Escape all HTML characters
  const escaped = escapeHtml(text);

  // 2. Markdown Links: [Title](https://...) strictly requiring http or https
  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s<>"')]+)\)/g;
  let formatted = escaped.replace(mdLinkRegex, (_, title, rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `${title} (${rawUrl})`;
      }
      const safeHref = encodeURI(rawUrl);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer nofollow" class="font-semibold underline text-primary hover:text-primary/80 transition-colors">${title}</a>`;
    } catch {
      return `${title} (${rawUrl})`;
    }
  });

  // 3. Markdown Bold: **text**
  formatted = formatted.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  // 4. Strikethrough: ~~text~~
  formatted = formatted.replace(/~~([^~\n]+)~~/g, '<del class="opacity-75">$1</del>');

  // 5. Line breaks: \n -> <br />
  formatted = formatted.replace(/\n/g, '<br />');

  // 6. Auto-link remaining bare URLs (only http/https) not already in href
  const bareUrlRegex = /(?<!href=")(https?:\/\/[^\s<>"'()]+)/gi;
  formatted = formatted.replace(bareUrlRegex, (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return rawUrl;
      }
      const safeHref = encodeURI(rawUrl);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer nofollow" class="font-medium underline text-primary hover:text-primary/80 transition-colors">${safeHref}</a>`;
    } catch {
      return rawUrl;
    }
  });

  return formatted;
}
