export interface Author {
  readonly name: string;
  /** Short role under the name. */
  readonly role: string;
  /** CDN key of a square avatar. Without one, initials are shown. */
  readonly avatar?: string;
  readonly url: string;
  /** X handle without the `@`; becomes `twitter:creator`. */
  readonly x?: string;
  readonly github?: string;
}

export const authors = {
  vedant: {
    name: "Vedant Chainani",
    role: "Maintainer",
    url: "https://envoy1084.xyz",
    x: "envoy1084",
    github: "envoy1084",
  },
} as const satisfies Record<string, Author>;

export type AuthorId = keyof typeof authors;

export function getAuthor(id: string): (Author & { readonly id: string }) | undefined {
  const author = (authors as Record<string, Author>)[id];

  return author ? { id, ...author } : undefined;
}
