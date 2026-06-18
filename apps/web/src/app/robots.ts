import type { MetadataRoute } from 'next';

/**
 * Huddle is a private, invite-only group app — there is nothing to
 * index, and crawling it is pure attack surface. Disallow everything
 * (the X-Robots-Tag: noindex header in next.config is the belt to this
 * suspenders). If a public marketing surface is ever added, carve it
 * out here explicitly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
