# 生成式优质课程自学工具——FuckColloge

## 你要实现一个什么样的项目

你要从零构建一个AI Native的自学工具FuckColloge。它的核心是一个从零构建的学习Agent——FCAgent。
该工具要根据使用者提供的自身知识水平和掌握情况，帮助使用者以最优路径学习他想要学习的技能。

目前该工具只专注于CS、编程领域的学习，后续会扩展到其它领域。
该工具的逻辑是利用FCAgent生成最适合自学者的学习路线，根据该路线参考筛选网络中的公开的优质学习资源(文档、教程、博客、视频、讨论等)生成独一无二的逻辑连贯丝滑的最佳学习内容（以可交互式互动的文档教程形式）。可以不用一次性生成学习路线中的所有学习内容，可以每次只生成一小部分比如一个章节，再根据学习者的反馈动态生成后续的学习内容。

你要尤其注意检验自学者的学习成果是否有效。你需要设计有效可靠的评测方法。

**FCAgent主要用 Rust TypeScript Python构建**

你目前的主要任务如下:

1.从零构建FCAgent

2.利用FCAgent构建该FuckColloge工具

## 你实现该agent项目必须仔细参考的agent项目如下:

https://github.com/shareAI-lab/learn-claude-code

https://github.com/openai/codex

https://github.com/datawhalechina/hello-agents

以上三个必须仔细研究，其它的可以只参考

---

https://github.com/datawhalechina/Agent-Learning-Hub

https://github.com/claude-code-best/claude-code

https://github.com/datawhalechina/hello-agents

https://github.com/sediman-agent/OpenSkynet

## 你实现该agent项目必须仔细参考的优质学习教程如下:（文档、博客、视频等）

https://cs61a.org/

https://sp26.datastructur.es/

https://fullstackopen.com/en/

https://www.freecodecamp.org/learn/front-end-development-libraries/#bootstrap/

以上四个资源的课程设计你必须研究透彻，尤其是它们的lab、homework、test环节。你生成的学习路线和课程内容一定是高度定制化的，是根据自学者知识水平的最优、最高效的学习路径。

---

这些学习资源的设计和内容可只参考:

https://www.theodinproject.com/

https://www.typescriptlang.org/docs/

https://reactjs.org/tutorial/tutorial.html