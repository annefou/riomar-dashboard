/**
 * Nanopublications attached to an FDO: collect them from the RO-Crate,
 * look up their template (which says what kind of nanopub they are) and
 * build the Science Live embed style chosen by the dashboard creator.
 */
import templatesQuery from "@/lib/data/queries/nanopub-templates.rq?raw";

const NANOPUB_SPARQL_ENDPOINT = "https://query.knowledgepixels.com/repo/full";

// Trusty URI artifact code: "RA" + 43 base64url characters
const ARTIFACT_CODE = /\/(RA[A-Za-z0-9_-]{43})(?:[/#?]|$)/;

export function nanopubArtifactCode(url?: string | null): string | null {
  return url?.match(ARTIFACT_CODE)?.[1] ?? null;
}

// Science Live mints nanopubs under w3id.org/sciencelive/np/, which does not
// serve RDF; the same nanopub is served as RDF under w3id.org/np/.
export function resolvableNanopubUri(uri: string): string {
  const code = nanopubArtifactCode(uri);
  return code ? `https://w3id.org/np/${code}` : uri;
}

export interface NanopubItem {
  code: string;
  uri: string;
  // Short name from the RO-Crate (resource name or claim text)
  name?: string;
  label?: string;
  template?: string;
  templateLabel?: string;
}

/**
 * Merge the nanopubs referenced by the crate (claims and nanopub resources),
 * one entry per artifact code.
 */
export function collectNanopubs(
  claims: { text: string; nanopubURI?: string }[],
  resources: { name: string; url: string }[]
): NanopubItem[] {
  const items = new Map<string, NanopubItem>();
  for (const r of resources) {
    const code = nanopubArtifactCode(r.url);
    if (code) {
      items.set(code, { code, uri: r.url, name: r.name });
    }
  }
  for (const c of claims) {
    const code = nanopubArtifactCode(c.nanopubURI);
    if (code && !items.has(code)) {
      items.set(code, { code, uri: c.nanopubURI!, name: c.text });
    }
  }
  return [...items.values()];
}

/**
 * Add label and template (with its label) to each nanopub, in one query.
 * Nanopubs not found keep their crate name and no template.
 */
export async function fetchNanopubTemplates(
  items: NanopubItem[]
): Promise<NanopubItem[]> {
  if (items.length === 0) {
    return items;
  }
  const values = items.map((i) => `"${i.code}"`).join(" ");
  const resp = await fetch(NANOPUB_SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    },
    body: new URLSearchParams({
      query: templatesQuery.replace("VALUES_CODES", values),
    }),
  });
  if (!resp.ok) {
    throw new Error(`Nanopub template query failed: ${resp.status}`);
  }
  const data = await resp.json();
  const byCode = new Map<string, Record<string, { value: string }>>();
  for (const b of data.results.bindings) {
    byCode.set(b.code.value, b);
  }
  return items.map((i) => {
    const b = byCode.get(i.code);
    return b
      ? {
          ...i,
          label: b.label?.value,
          template: b.template?.value,
          templateLabel: b.templateLabel?.value,
        }
      : i;
  });
}

/** Science Live embed style options (see docs/for-organizations/embed.md). */
export interface NanopubEmbedStyle {
  theme?: string;
  primaryColor?: string;
  bgColor?: string;
  cardColor?: string;
  fgColor?: string;
  borderRadius?: string;
}

// Dashboard URL parameters (::npTheme=dark::npPrimaryColor=0f4e8a ...)
const STYLE_PARAMS: Record<string, keyof NanopubEmbedStyle> = {
  npTheme: "theme",
  npPrimaryColor: "primaryColor",
  npBgColor: "bgColor",
  npCardColor: "cardColor",
  npFgColor: "fgColor",
  npBorderRadius: "borderRadius",
};

/** Style chosen by the dashboard creator; empty means Science Live defaults. */
export function embedStyleFromParams(
  params: Record<string, string>
): NanopubEmbedStyle {
  const style: NanopubEmbedStyle = {};
  for (const [param, key] of Object.entries(STYLE_PARAMS)) {
    if (params[param]) {
      style[key] = params[param].replace("#", "");
    }
  }
  return style;
}
