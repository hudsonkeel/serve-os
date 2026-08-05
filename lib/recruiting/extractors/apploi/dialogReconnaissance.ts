import type { Locator } from "playwright";

// Enhanced, dialog-scoped structural reconnaissance. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md and the
// follow-up decisions that added nesting/heading/container/occurrence/
// structural-path capture, plus a bounded plain-text pass. Read-only —
// this only ever queries the DOM (querySelectorAll, textContent,
// getAttribute, parentElement/previousElementSibling walks); it never
// mutates anything.
//
// Deliberately does NOT capture raw HTML, full messages, full page text,
// or unrelated personal data — every preview is bounded, and the
// plain-text pass only considers leaf elements (no element children)
// under a small length cap, capturing what's needed to identify a
// label/value structure, never a document dump.

export interface StructuralAnchor {
  readonly kind: "data-attribute" | "aria" | "heading" | "text";
  readonly attribute: string;
  readonly tag: string;
  readonly preview: string;
  readonly nearestHeading: string | null;
  readonly nearestLabeledContainer: string | null;
  readonly occurrenceCount: number;
  readonly structuralPath: string;
}

export interface DialogStructuralCapture {
  readonly tabLabel: string;
  readonly anchors: readonly StructuralAnchor[];
}

const MAX_PREVIEW_LENGTH = 80;
const MAX_TEXT_ENTRIES = 150;
const MAX_TEXT_CANDIDATE_LENGTH = 120;
const MAX_PATH_DEPTH = 6;

export async function captureDialogStructure(dialog: Locator, tabLabel: string): Promise<DialogStructuralCapture> {
  const anchors = await dialog.evaluate(
    (dialogEl: Element, args: { maxPreview: number; maxTextEntries: number; maxTextLen: number; maxDepth: number }) => {
      function preview(text: string | null): string {
        const trimmed = (text ?? "").trim().replace(/\s+/g, " ");
        return trimmed.length > args.maxPreview ? trimmed.slice(0, args.maxPreview) + "…" : trimmed;
      }

      function structuralPath(el: Element, root: Element): string {
        const parts: string[] = [];
        let current: Element | null = el;
        let depth = 0;
        while (current && current !== root && depth < args.maxDepth) {
          const parent: Element | null = current.parentElement;
          let part = current.tagName.toLowerCase();
          if (parent) {
            const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
            if (siblings.length > 1) {
              part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }
          parts.unshift(part);
          current = parent;
          depth++;
        }
        const truncated = current !== root && current !== null;
        return (truncated ? "… > " : "") + parts.join(" > ");
      }

      function nearestHeading(el: Element, root: Element): string | null {
        let current: Element | null = el;
        while (current && current !== root) {
          let sibling: Element | null = current.previousElementSibling;
          while (sibling) {
            if (/^H[1-6]$/.test(sibling.tagName)) return preview(sibling.textContent);
            sibling = sibling.previousElementSibling;
          }
          current = current.parentElement;
        }
        return null;
      }

      function nearestLabeledContainer(el: Element, root: Element): string | null {
        let current: Element | null = el.parentElement;
        while (current && current !== root) {
          const testIdAttr = ["data-testid", "data-test", "data-qa"].find((a) => current!.hasAttribute(a));
          if (testIdAttr) return `${current.tagName.toLowerCase()}[${testIdAttr}="${current.getAttribute(testIdAttr)}"]`;
          const role = current.getAttribute("role");
          if (role) return `${current.tagName.toLowerCase()}[role="${role}"]`;
          const ariaLabel = current.getAttribute("aria-label");
          if (ariaLabel) return `${current.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
          current = current.parentElement;
        }
        return null;
      }

      interface Raw {
        kind: "data-attribute" | "aria" | "heading" | "text";
        attribute: string;
        tag: string;
        preview: string;
        nearestHeading: string | null;
        nearestLabeledContainer: string | null;
        structuralPath: string;
      }

      const results: Raw[] = [];

      for (const el of Array.from(dialogEl.querySelectorAll("[data-testid], [data-test], [data-qa]"))) {
        const attrName = ["data-testid", "data-test", "data-qa"].find((a) => el.hasAttribute(a))!;
        results.push({
          kind: "data-attribute",
          attribute: `${attrName}="${el.getAttribute(attrName)}"`,
          tag: el.tagName.toLowerCase(),
          preview: preview(el.textContent),
          nearestHeading: nearestHeading(el, dialogEl),
          nearestLabeledContainer: nearestLabeledContainer(el, dialogEl),
          structuralPath: structuralPath(el, dialogEl),
        });
      }

      for (const el of Array.from(dialogEl.querySelectorAll("[role], [aria-label]"))) {
        const role = el.getAttribute("role");
        const label = el.getAttribute("aria-label");
        results.push({
          kind: "aria",
          attribute: [role ? `role="${role}"` : null, label ? `aria-label="${label}"` : null].filter(Boolean).join(" "),
          tag: el.tagName.toLowerCase(),
          preview: preview(el.textContent),
          nearestHeading: nearestHeading(el, dialogEl),
          nearestLabeledContainer: nearestLabeledContainer(el, dialogEl),
          structuralPath: structuralPath(el, dialogEl),
        });
      }

      for (const el of Array.from(dialogEl.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
        results.push({
          kind: "heading",
          attribute: "",
          tag: el.tagName.toLowerCase(),
          preview: preview(el.textContent),
          nearestHeading: null,
          nearestLabeledContainer: nearestLabeledContainer(el, dialogEl),
          structuralPath: structuralPath(el, dialogEl),
        });
      }

      // Plain-text pass — leaf elements only (no element children), not
      // already carrying a semantic marker, bounded length, capped count.
      // This is what finds "Applied Jul 4"-style fields with no
      // data-testid/role/heading — deliberately narrow, not a page dump.
      const alreadyMarked = new Set(
        Array.from(dialogEl.querySelectorAll("[data-testid], [data-test], [data-qa], [role], [aria-label]"))
      );
      let textEntries = 0;
      for (const el of Array.from(dialogEl.querySelectorAll("*"))) {
        if (textEntries >= args.maxTextEntries) break;
        if (el.children.length !== 0) continue; // only true leaves
        if (alreadyMarked.has(el)) continue;
        if (/^H[1-6]$/.test(el.tagName)) continue; // already covered above
        const text = (el.textContent ?? "").trim();
        if (text.length === 0 || text.length > args.maxTextLen) continue;
        results.push({
          kind: "text",
          attribute: "",
          tag: el.tagName.toLowerCase(),
          preview: preview(text),
          nearestHeading: nearestHeading(el, dialogEl),
          nearestLabeledContainer: nearestLabeledContainer(el, dialogEl),
          structuralPath: structuralPath(el, dialogEl),
        });
        textEntries++;
      }

      // Occurrence counting — how many other captured anchors share this
      // one's identifying signature, within this same dialog capture.
      const signatureOf = (r: Raw) => (r.kind === "text" ? `text::${r.tag}::${r.preview}` : `${r.kind}::${r.attribute}::${r.tag}`);
      const counts = new Map<string, number>();
      for (const r of results) {
        const sig = signatureOf(r);
        counts.set(sig, (counts.get(sig) ?? 0) + 1);
      }

      return results.map((r) => ({ ...r, occurrenceCount: counts.get(signatureOf(r)) ?? 1 }));
    },
    { maxPreview: MAX_PREVIEW_LENGTH, maxTextEntries: MAX_TEXT_ENTRIES, maxTextLen: MAX_TEXT_CANDIDATE_LENGTH, maxDepth: MAX_PATH_DEPTH }
  );

  return { tabLabel, anchors };
}
