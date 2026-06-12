type Role = "student" | "mentor" | "admin";

type User = {
  id: number;
  name: string;
  email: string;
  tags: string[];
  role: Role;
};

type ParseIssue = {
  index: number;
  path: string;
  message: string;
};

type ParseResult = {
  users: User[];
  errors: ParseIssue[];
};

export function parseRoster(input: string): ParseResult {
  const users: User[] = [];
  const errors: ParseIssue[] = [];

  // Step 1: Parse JSON inside a try/catch.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    errors.push({ index: -1, path: "$", message: "input must be valid JSON" });
    return { users, errors };
  }

  // Step 2: Require the decoded value to be an array.
  if (!Array.isArray(parsed)) {
    errors.push({ index: -1, path: "$", message: "input must be a JSON array" });
    return { users, errors };
  }

  // Step 3: Iterate through each record.
  for (let index = 0; index < parsed.length; index++) {
    const raw = parsed[index];
    const recordErrors: ParseIssue[] = [];

    // Step 4: Require each record to be a non-null object.
    if (!isObject(raw)) {
      errors.push({ index, path: "$", message: "record must be an object" });
      continue;
    }

    // Step 5: Validate id.
    if (!isValidId(raw.id)) {
      recordErrors.push({ index, path: "id", message: "id must be a positive integer" });
    }

    // Step 6: Validate name.
    if (typeof raw.name !== "string" || raw.name.trim() === "") {
      recordErrors.push({ index, path: "name", message: "name must be a non-empty string" });
    }

    // Step 7: Validate email.
    if (typeof raw.email !== "string" || raw.email.trim() === "") {
      recordErrors.push({ index, path: "email", message: "email must be a non-empty string" });
    }

    // Step 8: Validate optional tags.
    let tags: string[] = [];
    if (raw.tags !== undefined) {
      const normalizedTags = normalizeTags(raw.tags);
      if (normalizedTags === undefined) {
        recordErrors.push({ index, path: "tags", message: "tags must be an array of non-empty strings" });
      } else {
        tags = normalizedTags;
      }
    }

    // Step 9: Validate optional role.
    let role: Role = "student";
    if (raw.role !== undefined) {
      if (isRole(raw.role)) {
        role = raw.role;
      } else {
        recordErrors.push({ index, path: "role", message: "role must be one of: student, mentor, admin" });
      }
    }

    // Step 10: Only push a User when the record has no validation errors.
    if (recordErrors.length === 0) {
      users.push({
        id: raw.id as number,
        name: (raw.name as string).trim(),
        email: (raw.email as string).trim().toLowerCase(),
        tags,
        role,
      });
    } else {
      errors.push(...recordErrors);
    }
  }

  return { users, errors };
}

function isObject(value: unknown): value is Record<string, unknown> {
  // 必须是非空对象，且不能是数组
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is number {
  // 必须是数字、有限数、整数，且大于 0
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isRole(value: unknown): value is Role {
  // 严格限制在三个字面量类型中
  return value === "student" || value === "mentor" || value === "admin";
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const trimmedTags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      return undefined;
    }
    trimmedTags.push(item.trim());
  }

  // 利用 Set 快速去重，并按照字母序排序
  return Array.from(new Set(trimmedTags)).sort();
}