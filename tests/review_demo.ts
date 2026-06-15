import { select, intro, outro, isCancel, cancel } from '@clack/prompts';
import color from 'picocolors';

async function main() {
  intro(color.inverse(' 📚 逃课复习面板演示 (Review Interactive Demo) '));
  
  // 模拟的系统状态数据
  const state = {
    currentUnitId: 'unit-03-kubernetes-architecture',
    skippedUnitIds: [
      'unit-01-cloud-native-docker-basics',
      'unit-02-docker-deep-dive-compose',
      'unit-03-kubernetes-architecture'
    ]
  };

  if (state.skippedUnitIds.length === 0) {
    outro(color.green('🎉 太棒了，你没有任何跳过的关卡！'));
    return;
  }

  const selectedUnit = await select({
    message: '选择你要重新挑战的关卡：',
    options: state.skippedUnitIds.map(id => ({
      value: id,
      label: id === state.currentUnitId ? `${id} (当前激活)` : id
    })),
  });

  if (isCancel(selectedUnit)) {
    cancel('已取消选择');
    return;
  }

  // 模拟切换状态的副作用
  state.currentUnitId = selectedUnit as string;
  // 从跳过列表中移除
  state.skippedUnitIds = state.skippedUnitIds.filter(id => id !== selectedUnit);

  outro(color.green(`✔ 成功激活关卡: ${color.bold(selectedUnit as string)}！请运行 \`fc start\` 开始重新挑战！`));
  console.log(color.gray('\n【模拟持久化状态】更新后的 state.json 逻辑为:'), JSON.stringify(state, null, 2));
}

main().catch(console.error);
