export type Example = { readonly code: string; readonly extension: "ts" | "tsx" };

/** The ```ts and ```tsx fences of every doc comment in `text`. */
export const examplesOf = (text: string): Example[] => {
  const examples: Example[] = [];
  for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const lines = comment[0].split("\n").map((line) => line.replace(/^\s*\*( |$)/, ""));
    let fence: string[] | undefined;
    let extension: Example["extension"] = "ts";
    for (const line of lines) {
      const trimmed = line.trim();
      if (fence === undefined && (trimmed === "```ts" || trimmed === "```tsx")) {
        fence = [];
        extension = trimmed === "```tsx" ? "tsx" : "ts";
      } else if (fence !== undefined && trimmed === "```") {
        examples.push({ code: fence.join("\n"), extension });
        fence = undefined;
      } else fence?.push(line);
    }
  }
  return examples;
};

// Imports (possibly spanning lines) move to module scope; the rest runs in an async generator,
// so both `await` and Effect's `yield*` type-check.
export const toModule = (example: string): string => {
  const imports: string[] = [];
  const body: string[] = [];
  let open = false;
  for (const line of example.split("\n")) {
    if (open || /^import\s/.test(line)) {
      imports.push(line);
      open = !/from\s+["'][^"']+["'];?\s*$/.test(line) && !/^import\s+["']/.test(line);
    } else body.push(line.replace(/^export (default )?(?=(async )?function|const|class)/, ""));
  }
  return `${imports.join("\n")}\n\nexport async function* example() {\n${body.join("\n")}\n}\n`;
};
