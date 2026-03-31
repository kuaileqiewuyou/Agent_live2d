import type { Message } from '@/types'

export const mockMessages: Message[] = [
  // ============================================================
  // conv-1: 关于量子物理的讨论（小雪）
  // ============================================================
  {
    id: 'msg-1-1',
    conversationId: 'conv-1',
    role: 'system',
    content: '你是一位温柔体贴的学习伙伴「小雪」，擅长用通俗易懂的方式讲解知识。请用中文回复。',
    status: 'done',
    senderType: 'system',
    createdAt: '2026-03-29T10:00:00Z',
  },
  {
    id: 'msg-1-2',
    conversationId: 'conv-1',
    role: 'user',
    content: '小雪，你能给我讲讲量子纠缠是什么吗？我一直觉得这个概念很神奇但是不太理解。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-29T10:01:00Z',
  },
  {
    id: 'msg-1-3',
    conversationId: 'conv-1',
    role: 'assistant',
    content:
      '当然可以呀！量子纠缠确实是量子力学里最迷人的现象之一呢。\n\n简单来说，量子纠缠就像是两个粒子之间建立了一种**神秘的联系**。一旦两个粒子「纠缠」在一起，无论它们相隔多远——哪怕是宇宙的两端——当你测量其中一个粒子的状态时，另一个粒子的状态也会**瞬间**确定下来。\n\n打个比喻吧：想象你有一双手套，你把它们分别放进两个盒子里，然后把一个盒子寄到北京，一个寄到纽约。当纽约的人打开盒子发现是左手手套时，他立刻就知道北京那个盒子里一定是右手手套。\n\n不过量子纠缠比手套的例子更「魔幻」——因为在打开盒子之前，粒子的状态是**真的不确定的**，而不是我们不知道而已。这就是爱因斯坦当年所说的「鬼魅般的超距作用」。',
    status: 'done',
    senderType: 'assistant',
    senderName: '小雪',
    reasoning:
      '用户对量子纠缠感兴趣但觉得难以理解，需要用通俗易懂的比喻来解释。先给出核心概念，再用手套的类比帮助理解，最后点出量子纠缠与经典物理的本质区别。注意保持温和的语气。',
    createdAt: '2026-03-29T10:01:30Z',
  },
  {
    id: 'msg-1-4',
    conversationId: 'conv-1',
    role: 'user',
    content: '那量子纠缠能不能用来传递信息呢？比如超光速通信什么的？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-29T10:05:00Z',
  },
  {
    id: 'msg-1-5',
    conversationId: 'conv-1',
    role: 'assistant',
    content:
      '这是一个非常好的问题！很多人第一次听到量子纠缠时都会有这样的想法。\n\n答案是：**不能直接用量子纠缠来超光速传递信息**。原因如下：\n\n1. **测量结果是随机的**：当你测量纠缠粒子时，得到的结果是随机的，你无法控制让它变成某个特定的值\n2. **需要经典通信辅助**：要利用纠缠做有意义的事情（比如量子密钥分发），双方还是需要通过经典通道（比如电话、光纤）来比对结果\n3. **不违反相对论**：这一点是和爱因斯坦的狭义相对论一致的，信息传递速度不能超过光速\n\n不过，量子纠缠在**量子通信**和**量子计算**中有非常重要的应用价值：\n\n- **量子密钥分发（QKD）**：可以实现理论上绝对安全的通信加密\n- **量子隐形传态**：可以传输量子态的信息\n- **量子计算**：纠缠是量子计算机实现并行计算的核心资源\n\n中国的「墨子号」卫星就是在量子通信领域的重要突破哦！',
    status: 'done',
    senderType: 'assistant',
    senderName: '小雪',
    createdAt: '2026-03-29T10:05:45Z',
  },
  {
    id: 'msg-1-6',
    conversationId: 'conv-1',
    role: 'user',
    content: '哇，原来如此！那量子计算机和普通计算机到底有什么根本区别呢？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-30T08:20:00Z',
  },
  {
    id: 'msg-1-7',
    conversationId: 'conv-1',
    role: 'assistant',
    content:
      '好问题！让我来好好说说量子计算机和经典计算机的区别吧。\n\n### 核心区别\n\n| 特性 | 经典计算机 | 量子计算机 |\n|------|----------|----------|\n| 基本单位 | 比特（0 或 1） | 量子比特（0 和 1 的叠加态） |\n| 计算方式 | 串行或有限并行 | 天然的量子并行 |\n| 擅长领域 | 日常计算任务 | 特定的复杂优化问题 |\n\n简单说，经典计算机的比特就像一个开关，要么开要么关。而量子比特就像一个旋转的硬币——在你观察它之前，它**同时处于正面和反面的叠加态**。\n\n这意味着：\n- **n 个经典比特**可以表示 2^n 个状态中的**一个**\n- **n 个量子比特**可以同时表示 2^n 个状态的**叠加**\n\n这就是量子计算机在某些问题上拥有指数级优势的根本原因。不过要注意，量子计算机并不是在所有任务上都比经典计算机快，它在密码破解、药物分子模拟、优化问题等特定领域才有明显优势哦～',
    status: 'done',
    senderType: 'assistant',
    senderName: '小雪',
    createdAt: '2026-03-30T08:21:00Z',
  },

  // ============================================================
  // conv-2: 帮我写一个 React 组件（代码大师）
  // ============================================================
  {
    id: 'msg-2-1',
    conversationId: 'conv-2',
    role: 'user',
    content:
      '我需要一个 React 组件，要求是一个可拖拽排序的列表。每个列表项有标题、描述和一个删除按钮。用 TypeScript 写，样式用 Tailwind CSS。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-28T14:20:00Z',
  },
  {
    id: 'msg-2-2',
    conversationId: 'conv-2',
    role: 'assistant',
    content:
      '好的，我来帮你实现这个可拖拽排序列表组件。这里使用 `@dnd-kit/core` 库来实现拖拽功能。\n\n首先安装依赖：\n\n```bash\nnpm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities\n```\n\n然后是组件代码：\n\n```tsx\nimport { useState } from \'react\'\nimport {\n  DndContext,\n  closestCenter,\n  KeyboardSensor,\n  PointerSensor,\n  useSensor,\n  useSensors,\n  type DragEndEvent,\n} from \'@dnd-kit/core\'\nimport {\n  arrayMove,\n  SortableContext,\n  sortableKeyboardCoordinates,\n  useSortable,\n  verticalListSortingStrategy,\n} from \'@dnd-kit/sortable\'\nimport { CSS } from \'@dnd-kit/utilities\'\n\ninterface ListItem {\n  id: string\n  title: string\n  description: string\n}\n\ninterface SortableItemProps {\n  item: ListItem\n  onDelete: (id: string) => void\n}\n\nfunction SortableItem({ item, onDelete }: SortableItemProps) {\n  const { attributes, listeners, setNodeRef, transform, transition } =\n    useSortable({ id: item.id })\n\n  const style = {\n    transform: CSS.Transform.toString(transform),\n    transition,\n  }\n\n  return (\n    <div\n      ref={setNodeRef}\n      style={style}\n      className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm"\n    >\n      <div {...attributes} {...listeners} className="cursor-grab text-gray-400">\n        ::::\n      </div>\n      <div className="flex-1">\n        <h3 className="font-medium text-gray-900">{item.title}</h3>\n        <p className="text-sm text-gray-500">{item.description}</p>\n      </div>\n      <button\n        onClick={() => onDelete(item.id)}\n        className="text-red-500 hover:text-red-700"\n      >\n        删除\n      </button>\n    </div>\n  )\n}\n```\n\n这个组件包含以下功能：\n- 拖拽排序（使用 dnd-kit 实现）\n- 键盘无障碍支持\n- 每个列表项包含拖拽手柄、标题、描述和删除按钮\n- 使用 Tailwind CSS 样式\n- 完整的 TypeScript 类型定义',
    status: 'done',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-28T14:21:00Z',
  },
  {
    id: 'msg-2-3',
    conversationId: 'conv-2',
    role: 'user',
    content: '不错！能不能加上拖拽时的动画效果？另外我想在拖拽的时候显示一个半透明的占位符。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-28T14:30:00Z',
  },
  {
    id: 'msg-2-4',
    conversationId: 'conv-2',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "code_execution",\n  "input": {\n    "language": "typescript",\n    "code": "// 验证 @dnd-kit/sortable 的 DragOverlay 组件 API\\nconsole.log(\'DragOverlay 组件可用，支持 dropAnimation 属性\')\\nconsole.log(\'支持的动画参数：duration, easing, dragSourceOpacity\')"\n  },\n  "output": "DragOverlay 组件可用，支持 dropAnimation 属性\\n支持的动画参数：duration, easing, dragSourceOpacity"\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'code_execution',
    toolStatus: 'success',
    createdAt: '2026-03-28T14:30:30Z',
  },
  {
    id: 'msg-2-5',
    conversationId: 'conv-2',
    role: 'assistant',
    content:
      '当然可以。使用 `DragOverlay` 组件就能实现拖拽时的占位符效果。关键改动如下：\n\n```tsx\nimport { DragOverlay } from \'@dnd-kit/core\'\n\n// 在 DndContext 内部添加：\n<DragOverlay\n  dropAnimation={{\n    duration: 250,\n    easing: \'cubic-bezier(0.18, 0.67, 0.6, 1.22)\',\n  }}\n>\n  {activeItem ? (\n    <div className="rounded-lg border-2 border-blue-400 bg-blue-50/90 p-4 shadow-lg">\n      <h3 className="font-medium text-gray-900">{activeItem.title}</h3>\n      <p className="text-sm text-gray-500">{activeItem.description}</p>\n    </div>\n  ) : null}\n</DragOverlay>\n```\n\n同时在原位置的元素上添加拖拽时的样式：\n\n```tsx\nconst { isDragging } = useSortable({ id: item.id })\n\n// className 中添加条件样式\nclassName={`... ${isDragging ? \'opacity-30 border-dashed\' : \'\'}`}\n```\n\n这样拖拽时原位置会显示为半透明的虚线框，跟随鼠标的元素会有蓝色边框和阴影效果。',
    status: 'done',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-28T14:31:00Z',
  },
  {
    id: 'msg-2-6',
    conversationId: 'conv-2',
    role: 'user',
    content: '这个组件能不能做成响应式的？在手机端变成单列，电脑端可以显示两列。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-30T07:10:00Z',
  },
  {
    id: 'msg-2-7',
    conversationId: 'conv-2',
    role: 'assistant',
    content:
      '这个组件已经实现了响应式布局，你可以试试看效果。核心是用 Tailwind 的响应式断点控制网格列数：\n\n```tsx\n<div className="grid grid-cols-1 gap-4 md:grid-cols-2">\n  <SortableContext items={items} strategy={rectSortingStrategy}>\n    {items.map((item) => (\n      <SortableItem key={item.id} item={item} onDelete={handleDelete} />\n    ))}\n  </SortableContext>\n</div>\n```\n\n注意两点：\n1. 排序策略需要从 `verticalListSortingStrategy` 改为 `rectSortingStrategy`，这样才能正确处理网格布局下的拖拽排序\n2. `gap-4` 控制间距在手机和电脑端都保持一致\n\n在 `md` 断点（768px）以上会显示两列，以下则自动变为单列。',
    status: 'done',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-30T07:11:00Z',
  },

  // ============================================================
  // conv-3: 今天的新闻摘要（小雪 + 网络搜索）
  // ============================================================
  {
    id: 'msg-3-1',
    conversationId: 'conv-3',
    role: 'user',
    content: '帮我看看今天有什么重要新闻，科技和经济方面的都可以。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-30T06:00:00Z',
  },
  {
    id: 'msg-3-2',
    conversationId: 'conv-3',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "web_search",\n  "input": { "query": "2026年3月30日 科技 经济 重要新闻" },\n  "output": [\n    { "title": "全球首个百万量子比特路线图发布", "source": "科技日报" },\n    { "title": "央行宣布下调中期借贷便利利率", "source": "经济观察报" },\n    { "title": "国产大飞机 C919 累计交付突破百架", "source": "新华社" },\n    { "title": "新一代人工智能治理准则正式实施", "source": "人民日报" }\n  ]\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'web_search',
    toolStatus: 'success',
    createdAt: '2026-03-30T06:00:30Z',
  },
  {
    id: 'msg-3-3',
    conversationId: 'conv-3',
    role: 'assistant',
    content:
      '以下是今天的热门新闻摘要，涵盖科技、经济和国际动态：\n\n### 科技\n\n1. **全球首个百万量子比特路线图发布**\n   多国科研团队联合发布了迈向百万量子比特量子计算机的技术路线图，预计在 2030 年前实现这一目标。这将大幅推进药物设计、材料科学等领域的研究。\n\n2. **国产大飞机 C919 累计交付突破百架**\n   中国商飞宣布 C919 大型客机累计交付量突破 100 架，目前已服务于国内多条主要航线，运营表现稳定。\n\n### 经济\n\n3. **央行下调中期借贷便利利率**\n   中国人民银行宣布下调一年期中期借贷便利（MLF）利率 10 个基点，旨在进一步降低实体经济融资成本，支持经济稳步回升。\n\n### 政策\n\n4. **新一代人工智能治理准则正式实施**\n   涵盖数据安全、算法透明度和伦理规范的《新一代人工智能治理准则》今日正式生效，对 AI 企业的合规要求更加细化。\n\n有哪条新闻你想深入了解吗？',
    status: 'done',
    senderType: 'assistant',
    senderName: '小雪',
    createdAt: '2026-03-30T06:01:00Z',
  },
  {
    id: 'msg-3-4',
    conversationId: 'conv-3',
    role: 'user',
    content: '量子计算那个路线图详细说说？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-30T06:10:00Z',
  },
  {
    id: 'msg-3-5',
    conversationId: 'conv-3',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "web_search",\n  "input": { "query": "百万量子比特 路线图 2026 详情" },\n  "output": [\n    { "title": "百万量子比特路线图：三步走战略详解", "source": "量子前沿" },\n    { "title": "超导、离子阱、光量子——三条技术路线并行推进", "source": "科技日报" }\n  ]\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'web_search',
    toolStatus: 'success',
    createdAt: '2026-03-30T06:10:20Z',
  },
  {
    id: 'msg-3-6',
    conversationId: 'conv-3',
    role: 'assistant',
    content:
      '来详细说说这个百万量子比特路线图吧！\n\n根据今天发布的报告，这个路线图采用了**三步走战略**：\n\n**第一阶段（2026-2027）：万级量子比特**\n- 实现 1 万个物理量子比特的稳定操控\n- 量子纠错码达到可用水平\n- 专注于超导和离子阱两条主要技术路线\n\n**第二阶段（2027-2029）：十万级量子比特**\n- 通过模块化架构将量子处理器扩展到 10 万量子比特\n- 实现跨模块的量子纠缠分发\n- 首批实用化量子算法投入商业应用\n\n**第三阶段（2029-2030）：百万级量子比特**\n- 集成百万个物理量子比特\n- 实现足够数量的逻辑量子比特来解决经典计算机无法处理的问题\n- 在密码学、药物分子模拟、金融优化等领域实现「量子优势」\n\n目前参与这项计划的包括中国、美国、欧盟和日本的研究团队，总投入预计超过 200 亿美元。这可以说是全球量子计算领域有史以来最具雄心的合作计划了。',
    status: 'done',
    senderType: 'assistant',
    senderName: '小雪',
    createdAt: '2026-03-30T06:11:00Z',
  },

  // ============================================================
  // conv-4: 日语学习笔记整理（語桥）
  // ============================================================
  {
    id: 'msg-4-1',
    conversationId: 'conv-4',
    role: 'user',
    content: '語桥，我在学日语动词变形，总是搞混一段动词和五段动词的区别，能帮我整理一下吗？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-27T09:00:00Z',
  },
  {
    id: 'msg-4-2',
    conversationId: 'conv-4',
    role: 'assistant',
    content:
      '没问题！动词变形确实是日语学习的一大关卡，很多同学都在这里栽过跟头。让我帮你好好梳理一下。\n\n### 一段动词 vs 五段动词\n\n**一段动词**（也叫「る動詞」）：\n- 词尾一定是「る」\n- 「る」前面的假名在**い段**或**え段**\n- 变形时直接去掉「る」即可\n\n| 原形 | ます形 | て形 | ない形 |\n|------|--------|------|--------|\n| 食べる | 食べます | 食べて | 食べない |\n| 見る | 見ます | 見て | 見ない |\n| 起きる | 起きます | 起きて | 起きない |\n\n**五段动词**（也叫「う動詞」）：\n- 词尾在う段（う、く、す、つ、ぬ、ぶ、む、る、ぐ）\n- 变形规则根据词尾不同而变化\n\n| 原形 | ます形 | て形 | ない形 |\n|------|--------|------|--------|\n| 書く | 書きます | 書いて | 書かない |\n| 話す | 話します | 話して | 話さない |\n| 飲む | 飲みます | 飲んで | 飲まない |\n\n### 容易搞混的「陷阱词」\n\n有些词虽然以「る」结尾，但其实是五段动词：\n- **帰る**（かえる）-> 帰ります（不是 帰ます）\n- **走る**（はしる）-> 走ります\n- **知る**（しる）-> 知ります\n\n记忆小技巧：这些「例外词」数量不多，建议做成卡片单独背诵！',
    status: 'done',
    senderType: 'assistant',
    senderName: '語桥',
    createdAt: '2026-03-27T09:01:30Z',
  },
  {
    id: 'msg-4-3',
    conversationId: 'conv-4',
    role: 'user',
    content: '那て形的变形规则能不能再详细说说？五段动词的て形变化好多种，总记不住。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-29T19:50:00Z',
  },
  {
    id: 'msg-4-4',
    conversationId: 'conv-4',
    role: 'assistant',
    content:
      '「食べる」是一段动词，变形时去掉「る」再加相应的词尾就可以了。不过五段动词的て形确实变化比较多，我来教你一个**口诀记忆法**吧！\n\n### 五段动词て形变形口诀\n\n> **「いちりって、にびみんで、きいて、ぎいで、して」**\n\n翻译成规则就是：\n\n| 词尾 | て形变化 | 例子 |\n|------|----------|------|\n| う、つ、る | -> **って** | 買う->買って、待つ->待って、帰る->帰って |\n| ぬ、ぶ、む | -> **んで** | 死ぬ->死んで、飛ぶ->飛んで、飲む->飲んで |\n| く | -> **いて** | 書く->書いて、歩く->歩いて |\n| ぐ | -> **いで** | 泳ぐ->泳いで、脱ぐ->脱いで |\n| す | -> **して** | 話す->話して、消す->消して |\n\n### 唯一的例外\n\n**行く**（いく）-> 行**って**（不是行いて）\n\n这是唯一一个不遵守规则的常用词，单独记住就好。\n\n建议你用这个口诀多读几遍，然后找几个动词练习变形，很快就能记住了！要不要我出几道练习题？',
    status: 'done',
    senderType: 'assistant',
    senderName: '語桥',
    createdAt: '2026-03-29T19:51:00Z',
  },
  {
    id: 'msg-4-5',
    conversationId: 'conv-4',
    role: 'user',
    content: '好的，出几道题让我练练吧！',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-29T20:00:00Z',
  },
  {
    id: 'msg-4-6',
    conversationId: 'conv-4',
    role: 'assistant',
    content:
      '好，来试试吧！把下面这些动词变成て形：\n\n1. 読む（よむ）——读\n2. 遊ぶ（あそぶ）——玩\n3. 作る（つくる）——做/制作\n4. 急ぐ（いそぐ）——赶紧\n5. 立つ（たつ）——站立\n6. 食べる（たべる）——吃\n7. 話す（はなす）——说话\n8. 泳ぐ（およぐ）——游泳\n\n想好了就告诉我答案，我来帮你批改～\n\n> 提示：先判断是一段动词还是五段动词，再套用对应的规则哦！',
    status: 'done',
    senderType: 'assistant',
    senderName: '語桥',
    createdAt: '2026-03-29T20:01:00Z',
  },

  // ============================================================
  // conv-5: 旅行计划：云南七日游（星辰）
  // ============================================================
  {
    id: 'msg-5-1',
    conversationId: 'conv-5',
    role: 'user',
    content: '星辰，我打算五月份去云南玩一周，你能帮我规划一下行程吗？主要想去昆明、大理和丽江。',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-25T18:30:00Z',
  },
  {
    id: 'msg-5-2',
    conversationId: 'conv-5',
    role: 'assistant',
    content:
      '五月的云南简直太美了！那时候天气温和，雨季还没来，是最适合旅行的季节。我来帮你规划一个昆明-大理-丽江的七日游路线吧！\n\n### 云南七日游行程规划\n\n**Day 1 - 昆明：春城初印象**\n- 上午：抵达昆明长水机场，入住酒店\n- 下午：翠湖公园 -> 云南大学（看银杏大道）\n- 晚上：南屏步行街品尝过桥米线\n\n**Day 2 - 昆明 -> 大理**\n- 上午：石林风景区（世界自然遗产）\n- 下午：乘高铁前往大理（约2小时）\n- 晚上：大理古城夜游，人民路逛吃\n\n**Day 3 - 大理**\n- 上午：租电动车环洱海（东线）\n- 下午：双廊古镇，在海景咖啡馆发呆\n- 晚上：回古城，体验白族特色餐饮\n\n**Day 4 - 大理**\n- 上午：苍山感通索道，远眺洱海全景\n- 下午：喜洲古镇，看白族民居，吃喜洲粑粑\n- 晚上：大理古城酒吧街\n\n**Day 5 - 大理 -> 丽江**\n- 上午：出发去丽江（大巴约2.5小时）\n- 下午：丽江古城，漫步四方街\n- 晚上：听纳西古乐演出\n\n**Day 6 - 丽江**\n- 全天：玉龙雪山一日游（蓝月谷是必去的！）\n- 晚上：束河古镇，比大研古城更安静\n\n**Day 7 - 丽江 -> 返程**\n- 上午：黑龙潭公园，拍玉龙雪山倒影\n- 下午：采购伴手礼，前往机场\n\n预算的话，不含机票大概 **4000-6000 元/人**，你觉得这个安排怎么样？',
    status: 'done',
    senderType: 'assistant',
    senderName: '星辰',
    createdAt: '2026-03-25T18:32:00Z',
  },
  {
    id: 'msg-5-3',
    conversationId: 'conv-5',
    role: 'user',
    content: '太棒了！第五天从大理出发去丽江路上需要多久？有什么推荐的交通方式吗？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-28T14:50:00Z',
  },
  {
    id: 'msg-5-4',
    conversationId: 'conv-5',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "web_search",\n  "input": { "query": "大理到丽江 交通方式 2026 推荐" },\n  "output": [\n    { "title": "大理到丽江交通全攻略", "source": "马蜂窝" },\n    { "title": "大理丽江城际列车时刻表", "source": "铁路12306" }\n  ]\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'web_search',
    toolStatus: 'success',
    createdAt: '2026-03-28T14:50:20Z',
  },
  {
    id: 'msg-5-5',
    conversationId: 'conv-5',
    role: 'assistant',
    content:
      '第三天建议从大理出发去丽江，路上大概需要两个半小时。具体的交通方式有这几种选择：\n\n### 交通方式对比\n\n| 方式 | 时间 | 价格 | 推荐度 |\n|------|------|------|--------|\n| 火车（动车） | 约 2 小时 | 60-90 元 | 强烈推荐 |\n| 大巴 | 约 2.5-3 小时 | 60-80 元 | 一般 |\n| 包车/拼车 | 约 2.5 小时 | 150-300 元 | 推荐 |\n\n**我最推荐坐动车**，原因是：\n1. 速度最快、最准时\n2. 价格实惠\n3. 大理站和丽江站交通都很方便\n4. 车次很多，每天有十几趟\n\n建议买上午 9-10 点的车次，这样到了丽江正好吃午饭，下午就能开始逛古城了。\n\n如果你想沿途看风景，也可以考虑**包车走大丽高速**，沿途能看到洱海和雪山的壮丽景色，不过价格会贵一些。\n\n要我帮你调整一下行程安排吗？',
    status: 'done',
    senderType: 'assistant',
    senderName: '星辰',
    createdAt: '2026-03-28T14:51:00Z',
  },

  // ============================================================
  // conv-6: 数据库优化方案讨论（代码大师）
  // ============================================================
  {
    id: 'msg-6-1',
    conversationId: 'conv-6',
    role: 'user',
    content:
      '我们有一张用户订单表，数据量大概 500 万行，最近查询变得越来越慢了。主要是按用户 ID 和下单时间范围来查询。你能帮我分析一下怎么优化吗？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-26T11:00:00Z',
  },
  {
    id: 'msg-6-2',
    conversationId: 'conv-6',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "execute_query",\n  "input": {\n    "query": "EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 12345 AND created_at BETWEEN \'2026-01-01\' AND \'2026-03-31\' ORDER BY created_at DESC LIMIT 20"\n  },\n  "output": "Seq Scan on orders  (cost=0.00..185432.00 rows=4821 width=256) (actual time=2345.123..3456.789 rows=47 loops=1)\\n  Filter: ((user_id = 12345) AND (created_at >= \'2026-01-01\') AND (created_at <= \'2026-03-31\'))\\n  Rows Removed by Filter: 4999953\\nPlanning Time: 0.234 ms\\nExecution Time: 3457.012 ms"\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'execute_query',
    toolStatus: 'success',
    createdAt: '2026-03-26T11:00:30Z',
  },
  {
    id: 'msg-6-3',
    conversationId: 'conv-6',
    role: 'assistant',
    content:
      '从 EXPLAIN 结果可以看出问题很明显——数据库在做**全表扫描**（Seq Scan），过滤掉了将近 500 万行数据才找到 47 条匹配的记录，耗时 3.4 秒。\n\n### 问题分析\n\n当前的查询模式是 `WHERE user_id = ? AND created_at BETWEEN ? AND ?`，但表上缺少合适的索引。\n\n### 优化方案\n\n#### 1. 添加复合索引（最关键）\n\n```sql\nCREATE INDEX CONCURRENTLY idx_orders_user_created\nON orders (user_id, created_at DESC);\n```\n\n把 `user_id` 放在前面（等值查询），`created_at` 放在后面（范围查询），这样索引的利用率最高。\n\n#### 2. 考虑分区表\n\n如果数据增长很快，可以按月份做分区：\n\n```sql\nCREATE TABLE orders (\n  id BIGSERIAL,\n  user_id BIGINT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL,\n  -- 其他字段...\n) PARTITION BY RANGE (created_at);\n\nCREATE TABLE orders_2026_q1 PARTITION OF orders\n  FOR VALUES FROM (\'2026-01-01\') TO (\'2026-04-01\');\n```\n\n#### 3. 其他优化建议\n\n- 确保 `user_id` 和 `created_at` 的统计信息是最新的（`ANALYZE orders`）\n- 如果只需要部分字段，避免 `SELECT *`，改用具体字段名\n- 考虑使用覆盖索引（INCLUDE）减少回表查询\n\n预计添加复合索引后查询时间可以从 3.4 秒降到 **10 毫秒以内**。要不要试一下？',
    status: 'done',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-26T11:02:00Z',
  },
  {
    id: 'msg-6-4',
    conversationId: 'conv-6',
    role: 'user',
    content: '我加了复合索引试了一下，确实快了很多！你能再帮我看看加索引之后的执行计划吗？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-27T16:00:00Z',
  },
  {
    id: 'msg-6-5',
    conversationId: 'conv-6',
    role: 'tool',
    content:
      '```json\n{\n  "tool": "execute_query",\n  "input": {\n    "query": "EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 12345 AND created_at BETWEEN \'2026-01-01\' AND \'2026-03-31\' ORDER BY created_at DESC LIMIT 20"\n  },\n  "output": "Limit  (cost=0.56..12.34 rows=20 width=256) (actual time=0.045..0.089 rows=20 loops=1)\\n  ->  Index Scan using idx_orders_user_created on orders  (cost=0.56..28.90 rows=47 width=256) (actual time=0.043..0.082 rows=20 loops=1)\\n        Index Cond: ((user_id = 12345) AND (created_at >= \'2026-01-01\') AND (created_at <= \'2026-03-31\'))\\nPlanning Time: 0.156 ms\\nExecution Time: 0.112 ms"\n}\n```',
    status: 'done',
    senderType: 'tool',
    toolName: 'execute_query',
    toolStatus: 'success',
    createdAt: '2026-03-27T16:00:30Z',
  },
  {
    id: 'msg-6-6',
    conversationId: 'conv-6',
    role: 'assistant',
    content:
      '添加复合索引之后，查询性能提升了大约 40%，效果还是很明显的。来看具体的对比：\n\n### 优化前后对比\n\n| 指标 | 优化前 | 优化后 | 提升 |\n|------|--------|--------|------|\n| 扫描方式 | 全表扫描 | 索引扫描 | - |\n| 扫描行数 | ~500 万 | 47 | 99.999% |\n| 执行时间 | 3457 ms | 0.112 ms | 30000 倍 |\n| 规划时间 | 0.234 ms | 0.156 ms | 33% |\n\n现在查询已经走了 `idx_orders_user_created` 索引，直接通过索引定位到目标数据，不需要再扫描无关行了。\n\n0.112 毫秒的执行时间已经非常理想了。后续如果数据量继续增长到千万级别，可以再考虑我之前提到的分区表方案。目前这个索引足够应对了。',
    status: 'done',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-27T16:01:00Z',
  },
  {
    id: 'msg-6-7',
    conversationId: 'conv-6',
    role: 'user',
    content: '还有一个问题，我们有一些统计报表查询也很慢，涉及到多表 JOIN 和聚合操作，有什么通用的优化思路吗？',
    status: 'done',
    senderType: 'user',
    senderName: '用户',
    createdAt: '2026-03-27T16:15:00Z',
  },
  {
    id: 'msg-6-8',
    conversationId: 'conv-6',
    role: 'assistant',
    content: '',
    status: 'streaming',
    senderType: 'assistant',
    senderName: '代码大师',
    createdAt: '2026-03-27T16:15:30Z',
  },
]
