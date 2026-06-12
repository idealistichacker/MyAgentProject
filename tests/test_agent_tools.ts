import fs from 'fs/promises';
import path from 'path';
import { createProvider } from './src/providers/types.js';
import { generatePlan } from './src/agents/pipeline.js';
import type { LearnerProfile } from './src/types.js';

async function testTools() {
  try {
    const configPath = path.join(process.cwd(), '.fuckcolloge', 'config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    const provider = createProvider(config);
    console.log('🤖 LLM Provider 成功加载:', config.model);

    // 构建一个需要搜索特定新概念的画像
    const mockProfile: LearnerProfile = {
      target: '学习最新的 React 19 并发渲染特性',
      jsLevel: 'advanced',
      dsaLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'example-first',
      pace: 'fast',
      summary: '需要深入了解 React 19 最新特性'
    };

    console.log('\n🧠 FCAgent 正在呼叫具备 Tool Calling 能力的大模型 (CurriculumPlanner)...');
    console.log('⚠️ 留意终端是否会打印出大模型调用 search_web 工具的日志！');
    
    const plan = await generatePlan(mockProfile, provider);
    
    console.log('\n✨ 成功获得个性化课程规划方案 (LearningPlan)：');
    console.log(`- 规划创建时间: ${plan.createdAt}`);
    console.log(`- 包含单元数量: ${plan.units.length} 个`);
    plan.units.forEach((unit, index) => {
      console.log(`  [单元 ${index + 1}] ID: ${unit.id}`);
      console.log(`    标题: ${unit.title}`);
      console.log(`    描述: ${unit.description}`);
      console.log(`    知识点要求: ${unit.objectives.join(', ')}`);
    });
  } catch (error) {
    console.error('❌ 执行测试失败:', error);
  }
}

testTools();
