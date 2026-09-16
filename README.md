# RealmFlow

RealmFlow 是一个本地优先的软件研发全流程桌面工作区，用于组织需求、研发阶段、模板、定时任务及各阶段交付产物。

当前版本为 `0.1.0`，重点完成了桌面客户端基础框架、空间与需求管理，以及需求本地目录中的 Markdown、HTML 和代码产物浏览与编辑能力。

## 当前能力

- 可折叠、可调整宽度的左侧导航。
- 新对话 Composer、提示词模板创建、标签筛选和变量替换。
- 定时任务列表及对话式新建任务弹窗。
- 空间和需求的创建、重命名、折叠与强确认删除。
- 需求详情及六阶段研发流程：
  - 需求分析
  - 技术方案
  - 开发实现
  - 测试验证
  - 发布上线
  - 迭代复盘
- 每个需求可绑定一个独立的本地工作目录。
- 通过清单将本地文件关联到对应研发阶段。
- 应用级右侧工作区默认收起，由页面内容按需触发：
  - 点击页面中的本地文件或文件夹入口后打开对应资源。
  - 点击页面中的 `HTTP/HTTPS` 链接后在隔离网页视图中打开。
  - 需求阶段节点可直接打开对应阶段产物。
  - 页面切换时保持工作区打开，并保留宽度、标签与未保存内容。
  - 存在已打开内容时提供单一全局恢复入口。
- 本地文件工作区支持：
  - 懒加载目录树和多文件标签页。
  - Monaco Editor 代码编辑与语法高亮。
  - Markdown 编辑和安全预览。
  - HTML 编辑和沙箱预览。
  - 图片只读预览。
  - 保存按钮及 `Command/Ctrl + S`。
  - 文件外部修改冲突检测。
  - Finder 中定位文件。

## 技术架构

```mermaid
flowchart LR
  UI[React Renderer] -->|类型化 API| Preload[Context-isolated Preload]
  Preload -->|共享 Channel Registry| Validate[IPC Runtime Validators]
  Validate --> Main[Electron Main Process]
  Main --> FS[本地需求目录]
  Main --> Protocol[realmflow-artifact 协议]
  Protocol --> Preview[HTML / 图片沙箱预览]
  Main --> WebView[隔离 WebContentsView]
  WebView --> Web[HTTP / HTTPS 网页]
  Main --> Client[Typed Sidecar Client]
  Client --> Sidecar[Python FastAPI Sidecar]
```

| 层级 | 技术与职责 |
| --- | --- |
| 领域层 | 纯 TypeScript 业务模型与校验，不依赖 React、页面或存储实现 |
| 应用层 | Workspace / Workbench reducer 与用例控制器 |
| 展示层 | React 页面、功能组件、路由与纯视图布局 |
| 基础设施层 | 版本化浏览器仓储、Preload IPC 适配和 Electron 服务 |
| 桌面容器 | Electron 30，负责窗口、生命周期、IPC 和本地文件访问 |
| 编辑器 | Monaco Editor，本地加载编辑器和语言 Worker |
| 文档预览 | React Markdown、GFM、HTML 沙箱 iframe |
| Preload | 类型化、白名单化的 IPC 桥接，共享 channel registry |
| IPC 边界 | 对所有 privileged command 做运行时 payload 校验 |
| Sidecar | Python 3.11、FastAPI、Uvicorn |
| 测试 | Vitest、Testing Library、Pytest |
| 构建 | electron-vite、electron-builder、PyInstaller |

渲染进程保持：

```text
sandbox: true
contextIsolation: true
nodeIntegration: false
webSecurity: true
```

React 不直接访问 Node.js 或文件系统。目录选择、文件读取、保存、清单操作和 Finder 定位均由主进程校验后执行。

详细依赖规则、状态归属和运行时边界见
[`docs/architecture.md`](docs/architecture.md)。

## 需求产物清单

每个需求绑定一个本地目录。目录内的 `.realmflow/requirement.json` 用于记录各阶段关联的产物：

```json
{
  "version": 1,
  "requirementId": "test-requirement",
  "stages": {
    "analysis": {
      "artifacts": [
        {
          "path": "docs/requirement.md",
          "primary": true
        }
      ]
    },
    "implementation": {
      "artifacts": [
        {
          "path": "src/main.ts",
          "primary": true
        }
      ]
    }
  }
}
```

阶段标识为：

| 标识 | 阶段 |
| --- | --- |
| `analysis` | 需求分析 |
| `design` | 技术方案 |
| `implementation` | 开发实现 |
| `testing` | 测试验证 |
| `release` | 发布上线 |
| `retrospective` | 迭代复盘 |

文件路径必须相对于绑定目录。主进程会拒绝绝对路径、目录穿越和指向目录外部的符号链接。

## 环境要求

- macOS Apple Silicon，用于当前安装包构建。
- Node.js 20 或更高版本。
- npm。
- Python 3.11。
- Xcode Command Line Tools，用于 `codesign`、`pkgbuild` 和 `ditto`。

## 本地开发

安装 Node.js 依赖：

```bash
npm install
```

创建 Python 虚拟环境并安装 Sidecar 依赖：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r python-service/requirements.txt
pip install pytest httpx pyinstaller
```

启动 Electron 开发环境：

```bash
npm run dev
```

开发模式优先使用 `.venv/bin/python` 启动 Sidecar，也可以显式指定：

```bash
REALMFLOW_PYTHON=/path/to/python npm run dev
```

Sidecar 启动时会自动选择可用的本地端口，并通过 typed client 校验健康响应。若 Sidecar 不可用，桌面窗口仍可打开，侧栏底部会显示异常状态。

## 常用命令

```bash
# TypeScript 类型检查
npm run typecheck

# 前端及 Electron 测试
npm test

# 监听模式运行测试
npm run test:watch

# Python Sidecar 测试
python3.11 -m pytest python-service/tests

# 生产构建，不生成安装包
npm run build
```

## macOS 打包

生成 Apple Silicon 安装包：

```bash
npm run dist:mac
```

产物位于 `release/`：

```text
release/RealmFlow-0.1.0-arm64.pkg
release/RealmFlow-0.1.0-arm64.zip
```

PKG 默认安装到 `/Applications/RealmFlow.app`。当前构建使用本地临时签名，尚未接入 Apple Developer ID 和公证流程，首次运行可能出现未知开发者提示。

## 项目结构

```text
.
├── electron/
│   └── src/
│       ├── main.ts                 # Electron 主进程
│       ├── preload.ts              # 类型化 IPC 桥接
│       ├── ipc/                     # Channel 注册与运行时参数校验
│       ├── sidecar/                # FastAPI Sidecar 生命周期管理
│       ├── workbench/              # 隔离网页视图和导航控制
│       └── workspace/              # 安全文件服务、IPC 和预览协议
├── python-service/
│   ├── app/                        # FastAPI 应用
│   ├── tests/                      # Sidecar 测试
│   └── main.py                     # Sidecar 入口
├── shared/
│   ├── ipc-contract.ts             # Preload / Main channel 单一注册表
│   ├── types.ts                    # Renderer / Electron 公共类型
│   ├── workbench.ts                # 网页工作区数据契约
│   └── workspace.ts                # 文件工作区数据契约
├── src/
│   ├── app/                        # 页面路由装配
│   ├── application/                # 用例控制器与纯状态机
│   ├── components/                 # 通用 UI 组件
│   ├── domain/                     # 空间、会话和资源领域模型
│   ├── features/artifacts/         # 文件树、预览和代码编辑器
│   ├── features/workbench/         # 工作台 Provider 与纯视图
│   ├── infrastructure/storage/     # 版本化本地仓储
│   ├── pages/                      # 新对话、定时任务、需求详情
│   ├── App.tsx                     # 全局 Provider、侧栏和应用壳
│   └── styles.css                  # 全局界面样式
├── scripts/
│   ├── build-mac-installer.sh      # macOS PKG/ZIP 打包
│   ├── build-python.sh             # PyInstaller Sidecar 构建
│   └── dev.mjs                     # 开发启动入口
└── build/electron-builder.yml      # Electron 打包配置
```

## 安全边界

- 需求产物只允许访问需求已绑定的本地目录。
- 用户临时选择的文件或文件夹使用会话级授权，退出应用后失效。
- 读取前会解析真实路径，阻止目录穿越和越界符号链接。
- 文本编辑文件默认限制为 2 MB。
- 保存时校验文件版本，避免覆盖外部程序产生的新修改。
- 写入使用临时文件和原子替换。
- HTML 预览禁用脚本、网络连接、表单、弹窗和 Node.js 能力。
- 网页视图仅允许 `HTTP/HTTPS`，使用隔离会话并拒绝权限、弹窗和下载。
- Renderer 不暴露任意文件系统、Shell 或通用 IPC 调用。
- IPC handler 在调用主进程服务前校验字符串、枚举、尺寸和嵌套对象。
- Preload 与 Main 的 channel 集合由自动化契约测试保持一致。

## 当前限制

- 空间、需求、会话和空间知识库使用版本化浏览器仓储；定时任务仍为运行时状态。
- 需求与本地目录的绑定保存在 Electron 用户数据目录中。
- Python Sidecar 当前只提供健康检查与服务信息，尚未承载 AI/RAG 业务。
- 产物工作区暂不提供文件创建、重命名和删除操作。
- HTML 预览以安全性优先，不运行 JavaScript，也不访问外部网络。
- 当前安装包流程仅验证 macOS Apple Silicon。

## License

[MIT](LICENSE)
