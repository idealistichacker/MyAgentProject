import { ExecuteCommandTool, FileWriteTool, FileReadTool } from './src/agents/tools.js';

async function testTools() {
  const execTool = new ExecuteCommandTool();
  console.log("ExecuteCommandTool test:");
  console.log(await execTool.execute({ command: "node -v" }));

  const writeTool = new FileWriteTool();
  console.log("\nFileWriteTool test:");
  console.log(await writeTool.execute({ filePath: "./test_tool.txt", content: "hello world" }));

  const readTool = new FileReadTool();
  console.log("\nFileReadTool test:");
  console.log(await readTool.execute({ filePath: "./test_tool.txt" }));
}

testTools();
