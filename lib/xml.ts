import { XMLParser } from "fast-xml-parser";

export type Xml = string | number | boolean | null | Xml[] | { [key: string]: Xml };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
});

export function parseXml(xml: string): Xml {
  return parser.parse(xml) as Xml;
}

export function asArray(value: Xml | undefined): Xml[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(value: Xml | undefined): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === "object" && "#text" in value) return textOf(value["#text"]);
  return "";
}

export function attr(value: Xml | undefined, name: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const raw = value[`@_${name}`];
  return textOf(raw);
}

export function decodeHtml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function linkOf(node: Xml | undefined): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const items = asArray(node);
  const alt = items.find((item) => attr(item, "rel") === "alternate") ?? items[0];
  return attr(alt, "href") || textOf(alt);
}
