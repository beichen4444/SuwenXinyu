# 素问新雨 — 临床思维知识库

PBL 案例「宝宝对不起」知识库网站，由 DeepSeek V3 驱动的临床思维 AI 助手。

## 功能

- **知识库**：预置病例摘要 + 33 个 PBL 提问，支持搜索、分类浏览、自定义文档管理
- **新雨 AI**：基于知识库的智能问答，支持图片识别、文件分析
- **密码保护**：访问需输入密码

## 在线访问

GitHub Pages: [https://beichen4444.github.io/SuwenXinyu/](https://beichen4444.github.io/SuwenXinyu/)

密码：`1133`

> 注意：GitHub Pages 部署时，DeepSeek API 可能因 CORS 限制不可用。如需完整 AI 功能，请使用下方的本地运行方式。

## 本地运行

```bash
python server.py
```

浏览器访问 `http://localhost:8800`，输入密码 `1133`。

也可双击 `启动.bat` 一键启动。本地运行通过代理服务器完美解决 CORS，AI 问答、识图、文件分析全部可用。

## 技术栈

- 纯前端：HTML + CSS + JavaScript
- AI 引擎：DeepSeek V3
- 代理服务器：Python http.server

## 目录结构

```
SuwenXinyu/
├── index.html          # 主页面
├── app.js              # 应用逻辑
├── knowledge-data.js   # 知识库数据
├── server.py           # 本地代理服务器
├── 启动.bat             # 一键启动
└── README.md
```