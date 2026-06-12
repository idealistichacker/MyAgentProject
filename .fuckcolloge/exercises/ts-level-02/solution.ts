/**
 * Parse a JSON-like shape description and return its area.
 *
 * This exercise practices TypeScript's type system as a compile-time contract:
 * - `unknown` can hold anything, but you must narrow it before reading fields.
 * - `null` means "invalid input"; do not throw for ordinary bad input.
 * - A tuple `[number, number]` can model a fixed-size point.
 * - `never` powers an exhaustive check: if a new shape is added, the compiler
 *   should complain unless you update `area`.
 *
 * Valid shapes:
 * 1. `{ kind: "circle", r: number }` with finite positive radius.
 * 2. `{ kind: "rect", w: number, h: number }` with finite positive width and height.
 * 3. `{ kind: "point", p: [number, number] }` with two finite coordinates.
 *
 * Examples:
 * >>> parseShapeArea({ kind: "circle", r: 2 })
 * 12.566370614359172
 * >>> parseShapeArea({ kind: "rect", w: 3, h: 4 })
 * 12
 * >>> parseShapeArea({ kind: "rect", w: 3 })
 * null
 * >>> parseShapeArea({ kind: "triangle", a: 1 })
 * null
 * >>> parseShapeArea({ kind: "point", p: [1, -2] })
 * 0
 */
export type Shape =
  | { kind: "circle"; r: number }
  | { kind: "rect"; w: number; h: number }
  | { kind: "point"; p: readonly [number, number] };

export function parseShapeArea(input: unknown): number | null {
  // Step 1: Parse the unknown input into a validated Shape, or null.
  const shape = parseShape(input);

  // Step 2: Invalid input should produce null, not an exception.
  if (shape === null) {
    return null;
  }

  // Step 3: Once parsed, the type system knows exactly which shape we have.
  return area(shape);
}

function parseShape(input: unknown): Shape | null {
  // Step 1: Only plain objects can be shape records.
  if (!isPlainObject(input)) {
    return null;
  }

  // Step 2: Narrow by the discriminant field `kind`.
  const kind = input.kind;

  if (kind === "circle") {
    // TODO: Check that input.r is a finite positive number.
    // TODO: Return { kind: "circle", r } if valid; otherwise return null.
    return null;
  }

  if (kind === "rect") {
    // TODO: Check that input.w and input.h are finite positive numbers.
    // TODO: Return { kind: "rect", w, h } if valid; otherwise return null.
    return null;
  }

  if (kind === "point") {
    // TODO: Check that input.p is an array-like pair.
    // TODO: Check that both coordinates are finite numbers.
    // TODO: Return { kind: "point", p: [x, y] } if valid; otherwise return null.
    return null;
  }

  // Step 3: Unknown shape kinds are invalid input.
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // TODO: Exclude primitives and null.
  // TODO: Accept only Object records, not arrays, Dates, or class instances.
  // TODO: Return a type guard: value is Record<string, unknown>.
  return false;
}

function isFiniteNumber(value: unknown): value is number {
  // TODO: Require the runtime type to be number.
  // TODO: Reject NaN and ±Infinity with Number.isFinite.
  return false;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  // TODO: Reuse the finite-number guard.
  // TODO: Add the positivity requirement.
  return false;
}

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.r * shape.r;

    case "rect":
      return shape.w * shape.h;

    case "point":
      return 0;

    default:
      // Step 4: This branch should be unreachable if Shape is exhaustive.
      return assertNever(shape);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled shape: ${JSON.stringify(value)}`);
}