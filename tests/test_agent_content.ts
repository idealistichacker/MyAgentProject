import fs from 'fs/promises';
import path from 'path';
import { createProvider } from './src/providers/types.js';
import { generateUnitContent } from './src/agents/pipeline.js';
import type { LearnerProfile, SeedUnit } from './src/types.js';

async function testContentGeneration() {
  try {
    const configPath = path.join(process.cwd(), '.fuckcolloge', 'config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    const provider = createProvider(config);
    console.log('🤖 LLM Provider loaded:', config.model);

    const mockProfile: LearnerProfile = {
      target: '深入掌握前端状态管理机制',
      jsLevel: 'advanced',
      dsaLevel: 'intermediate',
      weeklyHours: '10+',
      learningStyle: 'project-first',
      codePractice: 'yes',
      pace: 'fast',
      nearTermGoal: '',
      rawAnswers: {},
      summary: '需要深入学习 React 状态管理底层原理与架构'
    };

    // Create a mock unit WITHOUT content, quiz, and exercise
    const mockUnit: SeedUnit = {
      id: 'unit-01-react-state',
      title: 'React 状态管理底层原理',
      description: '深入探讨 useState 和 useEffect 的内部实现机制。',
      prerequisites: ['React 基础', '闭包'],
      objectives: ['理解 Hook 的闭包陷阱', '理解 Fiber 树中状态的存储']
    };

    console.log('\n🧠 FCAgent is generating unit content using the 3-pass loop...');
    const generatedUnit = await generateUnitContent(mockUnit, mockProfile, provider);
    
    console.log('\n✨ Generation completed!');
    console.log(`\n=== CONTENT ===\n${(generatedUnit.content || '').substring(0, 300)}...\n`);
    console.log(`=== QUIZ ===\n${JSON.stringify(generatedUnit.quiz || [], null, 2)}\n`);
    console.log(`=== EXERCISE STARTER ===\n${generatedUnit.exercise?.starterCode || 'No starter code'}\n`);

  } catch (error) {
    console.error('❌ Execution failed:', error);
  }
}

testContentGeneration();
