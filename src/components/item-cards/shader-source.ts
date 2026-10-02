const SHADER_INCLUDE_PATTERN = /\{\{\{\s*([^{}]+?)\s*\}\}\}/g;
const VALID_SHADER_INCLUDE_NAME =
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export type ShaderSourceFetcher = (url: string) => Promise<string>;
export type ShaderIncludeLoader = (includeName: string) => Promise<string>;

export function resolveShaderIncludeUrl(includeName: string): string {
  const normalizedName = includeName.trim();
  if (!VALID_SHADER_INCLUDE_NAME.test(normalizedName)) {
    throw new Error(
      `Invalid shader include "${includeName}". Use letters, numbers, underscores, hyphens, and forward slashes only.`,
    );
  }

  return `/shaders/includes/${normalizedName}.glsl`;
}

export async function expandShaderIncludes(
  source: string,
  loadInclude: ShaderIncludeLoader,
): Promise<string> {
  const importedIncludes = new Set<string>();

  async function expand(currentSource: string, stack: string[]): Promise<string> {
    const matches = [...currentSource.matchAll(SHADER_INCLUDE_PATTERN)];
    if (matches.length === 0) return currentSource;

    let expandedSource = "";
    let cursor = 0;

    for (const match of matches) {
      const matchIndex = match.index;
      const includeName = match[1].trim();

      expandedSource += currentSource.slice(cursor, matchIndex);

      if (!VALID_SHADER_INCLUDE_NAME.test(includeName)) {
        throw new Error(
          `Invalid shader include "${match[1]}". Use letters, numbers, underscores, hyphens, and forward slashes only.`,
        );
      }

      if (stack.includes(includeName)) {
        throw new Error(
          `Circular shader include: ${[...stack, includeName].join(" -> ")}`,
        );
      }

      if (importedIncludes.has(includeName)) {
        expandedSource += `\n// shader include already expanded: ${includeName}\n`;
      } else {
        importedIncludes.add(includeName);
        const includedSource = await loadInclude(includeName);
        const expandedInclude = await expand(includedSource, [
          ...stack,
          includeName,
        ]);

        expandedSource += [
          `\n// begin shader include: ${includeName}`,
          expandedInclude,
          `// end shader include: ${includeName}\n`,
        ].join("\n");
      }

      cursor = matchIndex + match[0].length;
    }

    return expandedSource + currentSource.slice(cursor);
  }

  return expand(source, []);
}

async function fetchShaderSource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function loadShaderSource(
  shaderUrl: string,
  fetchSource: ShaderSourceFetcher = fetchShaderSource,
): Promise<string> {
  const sourceCache = new Map<string, Promise<string>>();

  function loadSource(url: string): Promise<string> {
    const cachedSource = sourceCache.get(url);
    if (cachedSource) return cachedSource;

    const source = fetchSource(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load shader source "${url}": ${message}`);
    });
    sourceCache.set(url, source);
    return source;
  }

  const source = await loadSource(shaderUrl);
  return expandShaderIncludes(source, (includeName) =>
    loadSource(resolveShaderIncludeUrl(includeName)),
  );
}
