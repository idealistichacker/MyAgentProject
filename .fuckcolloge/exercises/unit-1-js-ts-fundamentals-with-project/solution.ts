export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

export type Filter = "all" | "active" | "done";

export type TaskManagerState = {
  tasks: Task[];
  filter: Filter;
};

export type AddTaskAction = {
  type: "add";
  id: string;
  title: string;
  done?: boolean;
  createdAt: number;
};

export type ToggleTaskAction = {
  type: "toggle";
  id: string;
};

export type DeleteTaskAction = {
  type: "delete";
  id: string;
};

export type SetFilterAction = {
  type: "setFilter";
  filter: Filter;
};

export type ClearDoneAction = {
  type: "clearDone";
};

export type TaskAction =
  | AddTaskAction
  | ToggleTaskAction
  | DeleteTaskAction
  | SetFilterAction
  | ClearDoneAction;

const VALID_FILTERS = ["all", "active", "done"] as const;

function isFilter(value: string): value is Filter {
  // TODO: Step 1 - Validate that value is one of the allowed filters.
  return (VALID_FILTERS as readonly string[]).includes(value);
}

function hasTask(tasks: Task[], id: string): boolean {
  // TODO: Step 2 - Return true if any task has the given id.
  return tasks.some((task) => task.id === id);
}

function normalizeTask(task: Task): Task | null {
  // TODO: Step 3 - Trim task.title; if it becomes empty, return null.
  const title = task.title.trim();
  if (title === "") {
    return null;
  }

  // TODO: Step 4 - Return a new task object with the trimmed title.
  return { ...task, title };
}

/**
 * Run a sequence of Task Manager actions and return a new immutable state.
 *
 * This function models the core frontend data flow without touching the DOM:
 * user event -> action -> state update -> render. Implement it as a pure
 * reducer: do not mutate `state`, `state.tasks`, or any action object.
 *
 * Supported actions:
 * - add: insert a task if its id is non-empty, its title is non-empty after trim(),
 *   and the id is not already present.
 * - toggle: flip done for the matching task, or leave state unchanged.
 * - delete: remove the matching task, or leave state unchanged.
 * - setFilter: change the filter only when it is "all", "active", or "done".
 * - clearDone: remove every completed task.
 *
 * Examples:
 *  * >>> runTaskActions({ tasks: [{ id: "t1", title: "Read", done: false, createdAt: 1 }], filter: "all" }, [{ type: "toggle", id: "t1" }])
 * { tasks: [{ id: "t1", title: "Read", done: true, createdAt: 1 }], filter: "all" }
 * >>> runTaskActions({ tasks: [{ id: "t1", title: "Read", done: false, createdAt: 1 }, { id: "t2", title: "Write", done: true, createdAt: 2 }], filter: "all" }, [{ type: "clearDone" }])
 * { tasks: [{ id: "t1", title: "Read", done: false, createdAt: 1 }], filter: "all" }
 *  */
export function runTaskActions(state: TaskManagerState, actions: TaskAction[]): TaskManagerState {
  // TODO: Step 5 - Create local nextTasks from state.tasks, normalizing each task.
  let nextTasks = state.tasks
    .map(normalizeTask)
    .filter((task): task is Task => task !== null);

  // TODO: Step 6 - Create local nextFilter; if the initial filter is invalid, use "all".
  let nextFilter = isFilter(state.filter) ? state.filter : "all";

  for (const action of actions) {
    switch (action.type) {
      case "add": {
        const id = action.id.trim();
        const title = action.title.trim();

        // TODO: Step 7 - If id or title is empty, break.
        // TODO: Step 8 - If id already exists, break.
        // TODO: Step 9 - Append a new task object; do not mutate nextTasks in place.
        // Hint: nextTasks = [...nextTasks, { id, title, done: Boolean(action.done), createdAt: action.createdAt }];
        break;
      }

      case "toggle": {
        // TODO: Step 10 - Use map to return a copied toggled task only when ids match.
        break;
      }

      case "delete": {
        // TODO: Step 11 - Use filter to remove the task with action.id.
        break;
      }

      case "setFilter": {
        // TODO: Step 12 - Validate action.filter before assigning nextFilter.
        break;
      }

      case "clearDone": {
        // TODO: Step 13 - Use filter to remove completed tasks.
        break;
      }
    }
  }

  // TODO: Step 14 - Return a new state object.
  return { tasks: nextTasks, filter: nextFilter };
}