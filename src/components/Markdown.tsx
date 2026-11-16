/**
 * Rendu Markdown minimal et sûr (aucun HTML injecté) pour les réponses IA :
 * titres, listes, tableaux, citations, blocs de code, gras, code en ligne.
 */
import type { ReactNode } from "react";

export function renderInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    return <span key={i}>{part}</span>;
  });
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let tableRows: string[][] = [];
  let code: string[] | null = null;
  let key = 0;

  const flushTable = () => {
    if (!tableRows.length) return;
    const header = tableRows[0];
    const body = tableRows.slice(1).filter((r) => !r.every((c) => /^\s*:?-{2,}:?\s*$/.test(c)));
    elements.push(
      <div key={`t${key++}`} className="my-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {header.map((h, i) => (
                <th
                  key={i}
                  className="text-left py-1.5 px-2 border-b border-border font-medium text-muted-foreground text-xs"
                >
                  {renderInline(h.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1.5 px-2 border-b border-border/50 align-top">
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (code) {
        elements.push(
          <pre
            key={`c${key++}`}
            className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono leading-relaxed"
          >
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        flushTable();
        code = [];
      }
      return;
    }
    if (code) {
      code.push(line);
      return;
    }
    if (line.trim().startsWith("|") && line.includes("|", line.indexOf("|") + 1)) {
      tableRows.push(
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|"),
      );
      return;
    }
    flushTable();
    const k = `l${key++}`;
    if (/^-{3,}\s*$/.test(line)) elements.push(<hr key={k} className="my-4 border-border/50" />);
    else if (line.startsWith("### "))
      elements.push(
        <h3 key={k} className="text-sm font-semibold mt-4 mb-1">
          {renderInline(line.slice(4))}
        </h3>,
      );
    else if (line.startsWith("## "))
      elements.push(
        <h2 key={k} className="text-base font-semibold mt-5 mb-2">
          {renderInline(line.slice(3))}
        </h2>,
      );
    else if (line.startsWith("# "))
      elements.push(
        <h1 key={k} className="text-lg font-bold mt-5 mb-2">
          {renderInline(line.slice(2))}
        </h1>,
      );
    else if (/^\s*[-*] /.test(line))
      elements.push(
        <li key={k} className="ml-4 list-disc text-sm">
          {renderInline(line.replace(/^\s*[-*] /, ""))}
        </li>,
      );
    else if (/^\d+\.\s/.test(line))
      elements.push(
        <li key={k} className="ml-4 list-decimal text-sm">
          {renderInline(line.replace(/^\d+\.\s/, ""))}
        </li>,
      );
    else if (line.startsWith("> "))
      elements.push(
        <blockquote
          key={k}
          className="border-l-2 border-brand/30 pl-3 py-1 text-sm text-muted-foreground my-2"
        >
          {renderInline(line.slice(2))}
        </blockquote>,
      );
    else if (line.trim() === "") elements.push(<div key={k} className="h-2" />);
    else
      elements.push(
        <p key={k} className="text-sm leading-relaxed whitespace-pre-wrap">
          {renderInline(line)}
        </p>,
      );
  });
  if (code)
    elements.push(
      <pre
        key={`c${key++}`}
        className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono"
      >
        <code>{(code as string[]).join("\n")}</code>
      </pre>,
    );
  flushTable();
  return <>{elements}</>;
}
