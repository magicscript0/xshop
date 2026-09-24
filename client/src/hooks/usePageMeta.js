import { useEffect } from 'react';

const upsertMeta = (attribute, key, content) => {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!content) {
    if (tag?.dataset.xshopManaged === 'true') tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    tag.dataset.xshopManaged = 'true';
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const upsertCanonical = (href) => {
  let tag = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    if (tag?.dataset.xshopManaged === 'true') tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', 'canonical');
    tag.dataset.xshopManaged = 'true';
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
};

const DEFAULT_TITLE = 'XSHOP — Digital Storefront';
const DEFAULT_DESCRIPTION = 'XSHOP — a premium storefront for legitimate digital products.';

/**
 * Declarative document metadata for public SEO and private noindex pages.
 * Restores the defaults on unmount so navigation never leaks stale tags.
 */
const usePageMeta = ({ title, description, noindex = false, canonicalPath } = {}) => {
  useEffect(() => {
    const fullTitle = title ? `${title} · XSHOP` : DEFAULT_TITLE;
    document.title = fullTitle;
    upsertMeta('name', 'description', description || DEFAULT_DESCRIPTION);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description || DEFAULT_DESCRIPTION);
    upsertMeta('property', 'og:type', 'website');
    upsertCanonical(!noindex && canonicalPath ? `${window.location.origin}${canonicalPath}` : null);

    return () => {
      document.title = DEFAULT_TITLE;
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertMeta('name', 'robots', null);
      upsertMeta('property', 'og:title', null);
      upsertMeta('property', 'og:description', null);
      upsertMeta('property', 'og:type', null);
      upsertCanonical(null);
    };
  }, [title, description, noindex, canonicalPath]);
};

export default usePageMeta;
