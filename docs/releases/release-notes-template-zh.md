# vX.Y.Z Release Notes（中文模板）

发布日期：YYYY-MM-DD  
版本：`vX.Y.Z`

## 本版本概览
- 一句话说明本版本目标与范围。
- 适用场景：本地开发 / 演示 / 发布候选。

## 重点更新
- 模块 A：
  - 关键能力 1
  - 关键能力 2
- 模块 B：
  - 关键能力 1
  - 关键能力 2
- 模块 C：
  - 关键能力 1
  - 关键能力 2

## 质量与验证
- 后端测试：`python -m pytest -q`（结果：XX passed）
- 前端单测：`npm run test:unit`（结果：XX passed）
- 前端 E2E：`npm run test:e2e`（结果：XX passed）
- 发布 smoke：`npm run smoke:release`（结果：passed / failed）
- Docker 健康检查：`curl.exe -sS http://127.0.0.1:8001/api/health`（success=true / false）

## 兼容性与升级说明
- 兼容性说明：
  - 配置字段变更：
  - API 兼容性：
- 升级步骤：
  1. `npm install`
  2. `docker compose up --build -d app qdrant`
  3. `npm run local:web` 或 `npm run local:desktop`

## 已知事项
- 非阻塞问题 1（影响范围 + 临时规避方案）
- 非阻塞问题 2（影响范围 + 临时规避方案）

## 回滚建议
- 回滚目标：上一已通过 `smoke:release` 的提交点。
- 回滚后验证：
  1. `npm run test:unit`
  2. `npm run smoke:release`

## 相关文档
- 发布执行包：`docs/releases/vX.Y.Z-release-execution.md`
- 发布票据：`docs/releases/vX.Y.Z-release-ticket.md`
- 手动验收清单：`docs/releases/vX.Y.Z-manual-acceptance-checklist.md`
