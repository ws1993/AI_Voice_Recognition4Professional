# AI Voice Recognition For Professional Safety

移动端 H5 语音识别与《企业安全检查整改通知单》生成系统，基于 Next.js App Router。

## 功能概览

- 实时录音自动静音分段，段落完成后自动识别
- 多文件音频上传（次入口）
- 识别流水线：ASR -> 术语修正 -> 文本优化
- 后台无登录（`X-Admin-Key`）管理：
  - 模型配置与 Prompt
  - 专业术语库 CRUD
  - 标准条目库 CSV/XLSX 导入 + 重建向量索引
- 提交后生成结构化通知单，并导出 PDF
- 音频不落盘，仅保存识别文本与通知单

## 技术栈

- Next.js (App Router) + TypeScript
- Drizzle ORM + Postgres（Vercel Postgres）
- OpenAI-compatible API（ASR/LLM/Embedding）
- `@react-pdf/renderer` 生成 PDF
- `@vercel/blob` 存储 PDF（可选）

## 目录

- `app/` 页面与 API 路由
- `lib/` 识别流水线、存储、鉴权、配置
- `config/runtime/defaults.example.json` 默认运行时配置模板
- `drizzle/0000_initial.sql` 初始化 SQL
- `data/clauses.template.csv` 条目库导入模板

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 准备环境变量

```bash
cp .env.example .env.local
```

至少配置：

- `ADMIN_KEY`: 后台 API 访问密钥
- `DATABASE_URL`: Postgres 连接（不填则使用内存存储）
- `OPENAI_API_KEY`: 默认 OpenAI-compatible key（可选）
- `BLOB_READ_WRITE_TOKEN`: 启用 PDF 上传到 Vercel Blob（可选）

3. 启动

```bash
npm run dev
```

## 配置策略

- 可提交：`config/runtime/defaults.example.json`
- 私有本地：`config/runtime/local.json`（已 gitignore）
- 最终优先级：数据库动态配置 > 环境/本地配置 > 默认模板

## 后台调用安全

- 所有 `/api/admin/**` 需要 Header: `x-admin-key: <ADMIN_KEY>`
- 后台页面通过浏览器本地保存密钥，仅用于调用管理 API

## 主要 API

- `POST /api/session`
- `POST /api/recognize/segment`
- `POST /api/submit/report`
- `GET /api/report/:noticeId`
- `GET /api/report/:noticeId/pdf`
- `GET|PUT /api/admin/settings`
- `GET|POST /api/admin/terms`
- `PUT|DELETE /api/admin/terms/:id`
- `GET /api/admin/clauses`
- `POST /api/admin/clauses/import`
- `POST /api/admin/clauses/reindex`

## Vercel 部署建议

1. 创建 Vercel 项目并连接仓库
2. 绑定 Vercel Postgres 与 Blob
3. 配置环境变量：`ADMIN_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, 各模型 API key
4. 在数据库执行 `drizzle/0000_initial.sql`
5. 访问 `/admin/clauses` 导入 `data/clauses.template.csv`
6. 执行“重建向量索引”

## 测试

```bash
npm run test
```

包含：

- 术语替换规则测试
- 语义匹配降级策略测试
- 条目导入解析测试
