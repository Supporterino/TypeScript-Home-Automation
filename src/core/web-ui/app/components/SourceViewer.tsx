/**
 * Renders an automation's source with syntax highlighting (design.md D15;
 * specs/web-ui "Automation Management Interface"; task 10.18).
 *
 * Prism (TypeScript + JavaScript grammars only) is loaded via a dynamic
 * `import()` the first time this component renders — never at first paint
 * — which is also what keeps it out of the first-paint budget (design.md
 * D24; `tests/web-ui-assets.test.ts`). No other grammar is imported: an
 * automation's source is TypeScript in development and compiled JavaScript
 * in a built package, and no other language can appear.
 */
import { useEffect, useState } from "react";

const PRISM_THEME_CSS = `
.ts-ha-source .token.comment,.ts-ha-source .token.prolog,.ts-ha-source .token.doctype,.ts-ha-source .token.cdata{color:#6a737d}
.ts-ha-source .token.keyword{color:#d73a49}
.ts-ha-source .token.string,.ts-ha-source .token.template-string{color:#032f62}
.ts-ha-source .token.function{color:#6f42c1}
.ts-ha-source .token.class-name{color:#22863a}
.ts-ha-source .token.number,.ts-ha-source .token.boolean{color:#005cc5}
.ts-ha-source .token.operator,.ts-ha-source .token.punctuation{color:#24292e}
.ts-ha-source .token.builtin{color:#e36209}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.comment{color:#8b949e}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.keyword{color:#ff7b72}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.string{color:#a5d6ff}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.function{color:#d2a8ff}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.class-name{color:#7ee787}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.number{color:#79c0ff}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.punctuation{color:#c9d1d9}
[data-mantine-color-scheme="dark"] .ts-ha-source .token.builtin{color:#ffa657}
`;

interface PrismLike {
  languages: Record<string, unknown>;
  highlight: (code: string, grammar: unknown, language: string) => string;
}

let prismModulePromise: Promise<PrismLike> | null = null;

/** Loads Prism core plus the clike → javascript → typescript grammar chain, exactly once. */
function loadPrism(): Promise<PrismLike> {
  if (!prismModulePromise) {
    prismModulePromise = (async () => {
      const mod = (await import("prismjs")) as unknown as { default?: PrismLike } & PrismLike;
      await import("prismjs/components/prism-clike.js");
      await import("prismjs/components/prism-javascript.js");
      await import("prismjs/components/prism-typescript.js");
      return mod.default ?? mod;
    })();
  }
  return prismModulePromise;
}

export function SourceViewer({ source }: { source: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPrism().then((Prism) => {
      if (cancelled) return;
      const grammar = Prism.languages.typescript ?? Prism.languages.javascript;
      setHtml(grammar ? Prism.highlight(source, grammar, "typescript") : null);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const preStyle: React.CSSProperties = {
    margin: 0,
    padding: 12,
    overflow: "auto",
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  };

  if (html === null) {
    return (
      <pre className="ts-ha-source" style={preStyle}>
        <code>{source}</code>
      </pre>
    );
  }

  return (
    <>
      <style>{PRISM_THEME_CSS}</style>
      {/* Prism's own tokenised output, not user input. */}
      <pre className="ts-ha-source" style={preStyle}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </>
  );
}
