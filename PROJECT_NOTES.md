# Project Snap — 项目笔记

## 项目目标

两条线并行赚钱：
- **Track A**：开发者 CLI 工具集（SnapKit），卖 $19 bundle / $9 单买，走 Paddle 收款
- **Track B**：闲鱼 + 小红书，卖虚拟商品/技能服务

---

## Track A：SnapKit 开发者 CLI 工具集

### 已完成

- [x] CLI 工具开发（Node.js），功能：扫描项目→生成结构化上下文供 AI agent 使用
- [x] 本地测试通过
- [x] 产品 Landing Page 上线：https://projectsnap-109083270.surge.sh
- [x] 代码推送到 GitHub：https://github.com/XL109083270/projectsnap
- [x] Paddle 注册已提交，待审核
- [x] **SnapKit v1.0.0** — 5 合 1 CLI 工具集开发完成
  - `snap project` — 项目结构分析（原有 Project Snap）
  - `snap git` — Git 变更日志生成（按 conventional commit 分组）
  - `snap env` — 环境变量安全扫描（30+ 密钥模式检测）
  - `snap api` — API 端点发现（支持 10+ 框架）
  - `snap dep` — 依赖分析（多语言、离线模式）
- [x] 网站已更新为多产品展示页面
- [x] 安装脚本已更新为 SnapKit 统一安装

### 定价

| 产品 | 价格 | 说明 |
|------|------|------|
| SnapKit Bundle（全部 5 个） | $19 | 一次性付费，终身更新 |
| 单个工具 | $9/个 | 按需购买 |

### 待办（优先级排序）

1. **[高] Paddle 审核** — 等邮件通知。审核通过后，在 Paddle 创建产品、配置 checkout 链接
2. **[高] 用户注册闲鱼** — 下载 APP，用淘宝号登录，实名认证
3. **[中] Paddle 审核通过后** — 把产品 checkout 链接放到 website/index.html 的购买按钮上
4. **[中] 完善 CLI 工具** — 在实际项目上跑一轮，修掉 edge case
5. **[低] npm publish** — npm 账号已注册（lingxiong），但 2FA 验证码收不到（QQ 邮箱过滤）。等以后解决

### 部署命令（备忘）

```bash
# 重新部署网站到 surge
npx surge /Users/zhuzhuxia/project-snap/website/ projectsnap-109083270.surge.sh
```

### 分发方式

用户安装 Project Snap：
```bash
curl -fsSL https://projectsnap-109083270.surge.sh/install.sh | sh
```
从 surge.sh 直接下载安装，不依赖 npm/GitHub，国内可访问。

---

## Track B：闲鱼 + 小红书

### 状态：尚未开始

需要用户操作：
- 闲鱼：注册账号 + 实名认证
- 小红书：注册账号

---

## 账号注册状态

| 平台 | 账号 | 状态 |
|------|------|------|
| GitHub | XL109083270 | ✅ 已注册，仓库: github.com/XL109083270/projectsnap |
| Paddle | 109083270@qq.com | ✅ 已提交审核（等邮件 1-3天） |
| Surge.sh | 109083270@qq.com | ✅ 已部署: projectsnap-109083270.surge.sh |
| npm | — | ❌ 放弃（国内打不开），改用 install.sh |
| 闲鱼 | — | ❌ 未注册（用户下一个动作） |
| 小红书 | — | ❌ 未注册 |

---

## 关键链接

| 资源 | 链接 |
|------|------|
| 产品网站 | https://projectsnap-109083270.surge.sh |
| 政策页面 | `surge.sh/terms.html` / `privacy.html` / `refund.html` |
| GitHub 仓库 | https://github.com/XL109083270/projectsnap |
| Paddle | https://vendors.paddle.com（等审核） |

---

## 项目文件结构

```
/Users/zhuzhuxia/project-snap/
├── PROJECT_NOTES.md       ← 本笔记
├── cli/                   ← CLI 工具源码（旧版 Project Snap 单文件）
│   ├── cli.js
│   ├── package.json
│   └── .git/              ← 已推送到 GitHub
├── snapkit/               ← SnapKit 5 合 1 工具集源码
│   ├── package.json
│   ├── snap.js            ← 统一 CLI 入口
│   └── lib/
│       ├── project.js     ← 项目结构分析
│       ├── git.js         ← Git 变更日志
│       ├── env.js         ← 环境变量安全
│       ├── api.js         ← API 端点发现
│       └── dep.js         ← 依赖分析
└── website/               ← 产品网站（部署到 surge.sh）
    ├── index.html         ← 多产品展示页面
    ├── terms.html
    ├── privacy.html
    ├── refund.html
    ├── install.sh          ← SnapKit 统一安装脚本
    ├── snap.js             ← 供 install.sh 下载
    └── lib/                ← 供 install.sh 下载
        ├── project.js
        ├── git.js
        ├── env.js
        ├── api.js
        └── dep.js
```

## 技术栈

- CLI 工具：Node.js，模块化架构（`snapkit/`）
- 网站：纯 HTML，部署在 Surge.sh
- 收款：Paddle（审核中）
- 代码托管：GitHub
- 部署：Surge.sh（`npx surge website/ projectsnap-109083270.surge.sh`）

---

## 完整会话记录（2026.6.24）

### 第一阶段：研究

1. 研究了闲鱼、小红书、AI开发者工具三大方向的赚钱可行性
2. 找到了可信证据：Codegraff($99/yr)、GrapeRoot($10/mo)、Upstrike($79-99) 等同类产品在收钱
3. 闲鱼有1200万人月入过万的公开数据
4. 确定了双线并行策略：Track A(开发者工具) + Track B(闲鱼/小红书)

### 第二阶段：注册踩坑

1. **Lemon Squeezy** → 大陆注册不了 ❌
2. **Paddle** → ✅ 成功注册，审核中（1-3天）
3. **surge.sh 免费域名** → Paddle 验证可能卡，看审核结果
4. **GitHub token 页面** → 国内间歇性打不开，用直链 `scopes=repo` 解决了
5. **Vercel** → 国内打不开 ❌
6. **npm** → 账号注册成功(lingxiong)，但 2FA 验证码 QQ 邮箱收不到 ❌
7. **Surge.sh** → ✅ 部署成功，国内可访问

### 第三阶段：产品开发

1. CLI 工具 `projectsnap` — 扫描项目目录，生成结构化上下文供 AI agent 使用
2. 测试通过：正确识别 809 文件、211 目录、Node.js 框架
3. 已推送到 GitHub：github.com/XL109083270/projectsnap
4. 产品网站已上线：https://projectsnap-109083270.surge.sh

### 第四阶段：分发方案

- 最终方案：`curl -fsSL https://projectsnap-109083270.surge.sh/install.sh | sh`
- CLI 源码和安装脚本都托管在 surge.sh
- 不依赖 npm/GitHub，国内可安装

### 第五阶段：SnapKit 扩展（2026.6.24 下午）

1. 决定开发 5 合 1 SnapKit 工具集，统一 `snap` CLI 入口
2. 新建 `snapkit/` 目录，模块化架构（`lib/` 下 5 个独立模块）
3. 将原有 Project Snap 迁移为 `snap project` 子命令
4. 新增 4 个工具：`snap git`（Git 变更日志生成）、`snap env`（环境变量安全扫描）、`snap api`（API 端点发现）、`snap dep`（依赖分析）
5. 每个工具支持 `--help`、`--out <file>`、`--json`（部分）、多语言/框架
6. 更新网站为多产品展示页面，定价 Bundle $19（全部 5 个）/ 单买 $9
7. 重写安装脚本 `install.sh`，统一安装所有工具
8. 部署到 Surge.sh 成功

### 关键决定

- npm publish 被 2FA 卡住（QQ邮箱收不到验证码），改用 install.sh
- Paddle 审核通过后需配置 checkout 链接
- 闲鱼/小红书 Track B 尚未启动，等用户注册
- SnapKit 采用统一 CLI 入口 `snap` + 子命令架构（`snap project/git/env/api/dep`）
- 定价策略：Bundle $19（5 合 1），单买 $9/个

---

## 已知问题 / 踩坑记录

1. **Lemon Squeezy** 中国大陆用户注册不了 → 改用 Paddle
2. **surge.sh 免费域名** Paddle 验证可能卡 → Paddle 审核中，看结果
3. **GitHub token 页面** 国内网络间歇性打不开 → 最后用 `scopes=repo` 的直链打开了
4. **npm publish** npm 2FA 验证码 QQ 邮箱收不到，改用 install.sh 脚本从 surge.sh 安装
5. **Vercel** 国内打不开，无法用 Vercel 部署
6. **npm publish --otp** npm CLI v10 的 --otp 参数处理有 BUG，无法成功发布
7. **env.js 正则 `://` 被 `/` 结尾** → 用 `new RegExp()` 代替正则字面量解决
8. **snap git 在非 git 目录报错** → 用 `git rev-parse --git-dir` 提前检测
9. **snap dep 在线检查可能超时** → 提供 `--offline` 模式兜底
10. **snap api 动态路由/变量路径解析有限** → 只扫描静态定义，动态路由标注为 `*`
