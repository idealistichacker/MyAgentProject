export function extractRequiredSection(text: string, heading: string): string {
  const section = extractOptionalSection(text, heading);
  if (!section?.trim()) {
    throw new Error(`Missing ${heading} section.`);
  }
  return section.trim();
}

export function extractOptionalSection(text: string, heading: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\n)###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+[A-Z_]+\\s*\\n|$)`, 'i');
  return text.match(pattern)?.[1]?.trim();
}

export function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim();
}

export function parseJsonFromText<T = unknown>(text: string): T {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return JSON.parse(sanitizeJsonString(candidate)) as T;
  }
}

export function extractJsonCandidate(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstArray = text.indexOf('[');
  const firstObject = text.indexOf('{');
  const starts = [firstArray, firstObject].filter((idx) => idx !== -1);
  if (starts.length === 0) {
    throw new Error('No JSON candidate found.');
  }

  const startIdx = Math.min(...starts);
  const opensWithArray = text[startIdx] === '[';
  const endIdx = opensWithArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
  if (endIdx <= startIdx) {
    throw new Error('Incomplete JSON candidate.');
  }

  return text.slice(startIdx, endIdx + 1).trim();
}

export function normalizeQuizText(value: string): string {
  return value.trim().replace(/[.)。]/g, '').toLowerCase();
}

export function sanitizeJsonString(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      if (inString) {
        escapeNext = true;
      }
      continue;
    }

    if (char === '"') {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        let nextNonWhitespace = '';
        for (let j = i + 1; j < jsonStr.length; j++) {
          if (!/\\s/.test(jsonStr[j])) {
            nextNonWhitespace = jsonStr[j];
            break;
          }
        }

        if (nextNonWhitespace === ':' || nextNonWhitespace === ',' || nextNonWhitespace === '}' || nextNonWhitespace === ']') {
          inString = false;
          result += char;
        } else {
          result += '\\\\"';
        }
      }
      continue;
    }

    result += char;
  }

  return result;
}
