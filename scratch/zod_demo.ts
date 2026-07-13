import { z } from 'zod';

// 1. 定义课程单元的 Zod Schema 校验器 (Schema Validation Validator)
const UnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['unit', 'project']),
  objectives: z.array(z.string()),
});

// 2. 模拟从大模型 (LLM) 获得的 JSON 字符串
const llmRawResponse = JSON.stringify({
  id: "typescript-introduction",
  title: "Taming the TypeScript Beast! 🦖",
  type: "unit",
  objectives: ["Understand basic typing", "Use interfaces", "Run TS compiler"]
});

console.log("=== 正在解析并校验 AI 产出的课件结构 ===");

try {
  // 使用 MDN 规范的 JSON.parse 进行反序列化
  const parsedData = JSON.parse(llmRawResponse);
  
  // 使用 Zod 进行严苛的结构校验
  const validatedData = UnitSchema.parse(parsedData);
  
  console.log("🟢 [SUCCESS] 课件数据校验成功，可以直接发布！");
  console.log(JSON.stringify(validatedData, null, 2));
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("🔴 [ERROR] 课件 Schema 验证失败，需要自动修复:", error.errors);
  } else {
    console.error("🔴 [ERROR] JSON 解析出错:", error);
  }
}
