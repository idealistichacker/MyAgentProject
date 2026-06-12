/**
 * Applies one JSON task command to immutable task state.
 *
 * This function is a pure model of an Express route: parse input, validate
 * the contract, enforce ownership, and return a JSON API response. Do not
 * mutate `command.state.tasks`; build new arrays/objects instead.
 *
 * Command shape:
 *   {
 *     action: "list" | "create" | "update" | "toggle" | "delete",
 *     user: { id: number },
 *     body?: { id?: number, title?: string, done?: boolean },
 *     state: { tasks: Task[], nextId: number, clock: string }
 *   }
 *
 * Response shape:
 *   { status: 200, body: ... }
 *   { status: 201, body: task }
 *   { status: 400, error: "invalid json" | "invalid action" | "invalid title" | "invalid id" }
 *   { status: 403, error: "forbidden" }
 *   { status: 404, error: "task not found" }
 *
 * Examples:
 * >>> applyTaskCommand(JSON.stringify({ action: "list", user: { id: 1 }, state: { tasks: [{ id: 1, ownerId: 1, title: "A", done: false, createdAt: "t1" }], nextId: 2, clock: "t2" } }))
 * "{\"status\":200,\"body\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"}]}"
 * >>> applyTaskCommand(JSON.stringify({ action: "create", user: { id: 2 }, body: { title: "  Write tests  " }, state: { tasks: [], nextId: 4, clock: "t0" } }))
 * "{\"status\":201,\"body\":{\"id\":4,\"ownerId\":2,\"title\":\"Write tests\",\"done\":false,\"createdAt\":\"t0\"}}"
 *
 * TODO:
 *   // Step 1: Parse the JSON input safely and return { status: 400, error: "invalid json" } on failure.
 *   // Step 2: Validate `action`, `user.id`, and optional `body`.
 *   // Step 3: For task-specific actions, find the task by id and check `ownerId`.
 *   // Step 4: Build a new state using immutable updates.
 *   // Step 5: Return `JSON.stringify(response)` with the status/body/error contract above.
 */
export type TaskAction = "list" | "create" | "update" | "toggle" | "delete";

export interface User {
  id: number;
}

export interface Task {
  id: number;
  ownerId: number;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface CommandState {
  tasks: Task[];
  nextId: number;
  clock: string;
}

export interface Command {
  action: TaskAction;
  user: User;
  body?: {
    id?: number;
    title?: string;
    done?: boolean;
  };
  state: CommandState;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
  error?: string;
}

function jsonResponse(status: number, body?: unknown, error?: string): string {
  const response: ApiResponse = error ? { status, error } : { status, body };
  return JSON.stringify(response);
}

function isTaskForUser(task: Task | undefined, userId: number): boolean {
  return task !== undefined && task.ownerId === userId;
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0;
}

export function applyTaskCommand(input: string): string {
  // TODO: Step 1 - Parse `input` with `JSON.parse` inside a try/catch.
  //         On failure, return a 400 JSON response with error "invalid json".

  // TODO: Step 2 - Check that the parsed command has a supported action,
  //         a valid user id, and a valid state object.
  //         Return 400 for invalid action, invalid user, or invalid state.

  // TODO: Step 3 - For actions that target a task (`update`, `toggle`, `delete`),
  //         read `body.id`, validate it, find the task, and reject:
  //           - missing/non-integer id with { status: 400, error: "invalid id" }
  //           - task exists but ownerId !== user.id with { status: 403, error: "forbidden" }
  //           - task does not exist with { status: 404, error: "task not found" }

  // TODO: Step 4 - For `create` and `update`, validate title when present:
  //         it must be a string, trim to non-empty, and have length <= 120.
  //         Return { status: 400, error: "invalid title" } on failure.

  // TODO: Step 5 - Apply the action using immutable updates:
  //         - list: return the current user's tasks sorted by id ascending.
  //         - create: append a new task with id = state.nextId and done = false.
  //         - update: replace only the fields present in body.
  //         - toggle: flip `done`.
  //         - delete: remove the task.
  //         Do not mutate `command.state.tasks` directly.

  // TODO: Step 6 - Return the JSON response with the correct HTTP-like status:
  //         200 for list/update/toggle/delete, 201 for create.

  return jsonResponse(500, undefined, "not implemented");
}