import { String as Str, Array as Arr } from "effect";
export type Example = { readonly code: string; readonly extension: "ts" | "tsx" };

/** The ```ts and ```tsx fences of every doc comment in `text`. */
export const examplesOf = (text: string): Example[] => {
  const examples: Example[] = [];
  for (const comment of Str.matchAll(/\/\*\*[\s\S]*?\*\//g)(text)) {
    const lines = Arr.map(Str.split(comment[0], "\n"), (line) =>
      Str.replace(/^\s*\*( |$)/, "")(line),
    );
    let fence: string[] | undefined;
    let extension: Example["extension"] = "ts";
    for (const line of lines) {
      const trimmed = Str.trim(line);
      if (fence === undefined && (trimmed === "```ts" || trimmed === "```tsx")) {
        fence = [];
        extension = trimmed === "```tsx" ? "tsx" : "ts";
      } else if (fence !== undefined && trimmed === "```") {
        examples.push({ code: Arr.join(fence, "\n"), extension });
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
  for (const line of Str.split(example, "\n")) {
    if (open || /^import\s/.test(line)) {
      imports.push(line);
      open = !/from\s+["'][^"']+["'];?\s*$/.test(line) && !/^import\s+["']/.test(line);
    } else body.push(Str.replace(/^export (default )?(?=(async )?function|const|class)/, "")(line));
  }
  return `${Arr.join(imports, "\n")}\n\nexport async function* example() {\n${Arr.join(body, "\n")}\n}\n`;
};
