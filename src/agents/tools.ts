import type { ToolDefinition } from '../providers/types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);
export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute(args: Record<string, any>): Promise<string>;
}

export class ToolManager {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  getToolsDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }
    }));
  }

  async executeToolCall(name: string, argsStr: string): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: Tool ${name} not found.`;
    }
    try {
      const args = JSON.parse(argsStr);
      return await tool.execute(args);
    } catch (err: any) {
      return `Error executing tool ${name}: ${err.message}`;
    }
  }
}

export class WebSearchTool implements Tool {
  name = 'search_web';
  description = 'Searches the web (Wikipedia) for a given query to gather latest educational resources or concepts. Always prioritize this to gather real-world info.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The topic or term to search for.' }
    },
    required: ['query']
  };

  async execute(args: Record<string, any>): Promise<string> {
    const query = args.query;
    if (!query) return 'Error: Missing query parameter.';

    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
      const response = await fetch(url);
      if (!response.ok) {
        return `Search failed with status ${response.status}`;
      }
      const data = await response.json() as any;
      const results = data.query?.search;
      if (!results || results.length === 0) {
        return 'No results found.';
      }

      // Convert search results to text
      const output = results.slice(0, 5).map((r: any) => {
        const snippet = r.snippet.replace(/<[^>]*>?/gm, ''); // Remove HTML tags
        return `Title: ${r.title}\nSnippet: ${snippet}\n`;
      }).join('\n');

      return `Search results for "${query}":\n\n${output}`;
    } catch (err: any) {
      return `Search error: ${err.message}`;
    }
  }
}

export class TimeTool implements Tool {
  name = 'get_current_time';
  description = 'Gets the current system time in ISO format.';
  parameters = {
    type: 'object',
    properties: {},
    required: []
  };

  async execute(): Promise<string> {
    return new Date().toISOString();
  }
}

export class ExecuteCommandTool implements Tool {
  name = 'execute_command';
  description = 'Executes a shell command on the local system. Useful for diagnostics, compiling code, or checking system state. Returns stdout and stderr.';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute.' },
      cwd: { type: 'string', description: 'Optional. The working directory to execute the command in.' }
    },
    required: ['command']
  };

  async execute(args: Record<string, any>): Promise<string> {
    const command = args.command;
    const cwd = args.cwd || process.cwd();
    if (!command) return 'Error: Missing command parameter.';

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout: 10000 });
      let output = '';
      if (stdout) output += `STDOUT:\n${stdout}\n`;
      if (stderr) output += `STDERR:\n${stderr}\n`;
      if (!output) output = 'Command executed successfully with no output.';
      return output;
    } catch (err: any) {
      return `Execution Error:\n${err.message}\nSTDOUT:\n${err.stdout || ''}\nSTDERR:\n${err.stderr || ''}`;
    }
  }
}

export class FileReadTool implements Tool {
  name = 'read_file';
  description = 'Reads the content of a file on the local file system. Useful for reading user code or configuration files.';
  parameters = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The path to the file to read.' }
    },
    required: ['filePath']
  };

  async execute(args: Record<string, any>): Promise<string> {
    const filePath = args.filePath;
    if (!filePath) return 'Error: Missing filePath parameter.';

    try {
      const content = await fs.readFile(path.resolve(filePath), 'utf-8');
      return content;
    } catch (err: any) {
      return `Read Error: ${err.message}`;
    }
  }
}

export class FileWriteTool implements Tool {
  name = 'write_file';
  description = 'Writes content to a file on the local file system. Will overwrite if the file exists.';
  parameters = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The path to the file to write.' },
      content: { type: 'string', description: 'The content to write to the file.' }
    },
    required: ['filePath', 'content']
  };

  async execute(args: Record<string, any>): Promise<string> {
    const { filePath, content } = args;
    if (!filePath || content === undefined) return 'Error: Missing filePath or content parameter.';

    try {
      await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
      await fs.writeFile(path.resolve(filePath), content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (err: any) {
      return `Write Error: ${err.message}`;
    }
  }
}
