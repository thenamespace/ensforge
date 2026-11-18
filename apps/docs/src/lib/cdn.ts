/**
 * Assets that are not part of the build (blog covers, avatars, post images) live on the
 * bucket behind cdn.ensforge.com (not provisioned yet). Content stores keys such as `blog/<slug>/cover.webp`, never
 * full URLs, so the host can change in one place.
 */
export const cdnOrigin = "https://cdn.ensforge.com";

/** Public URL for a key on the CDN. */
export const cdn = (key: string) => `${cdnOrigin}/${key.replace(/^\/+/, "")}`;
