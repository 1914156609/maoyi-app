# maoyi-app

面向毛衣工艺录入、针行计算、二维图纸和审批协作的 uni-app 用户端，支持 H5 与微信小程序构建。

## 项目简介

业务数据由关联的 Java 后端保存，管理与审批由管理后台处理。

- 工艺单录入与编辑、厘米/寸转换、横密和行密度校验。
- 根据尺寸计算针数、行数和收放针，生成二维工艺图，支持图纸保存与 PNG 导出。
- 草稿保存、提交审批、驳回原因和审批状态回显。
- 员工登录、个人工艺列表、服务端分享快照与二维码；分享七天有效，可由后台撤销。

毛衣模型页保留参数与空态，尚未实现真实三维模型资源生成链路。计算中的通用分配、袖片、V 领和开衫扩展仍需织样校核，不能以数值守恒代替实际工艺验证；规则与算例见 [计算说明](docs/references/calculation-video/review.json)。

## 技术栈

- 客户端：uni-app、Vue 3、JavaScript、Vite，面向 H5 与微信小程序。
- 开发环境：Node.js 22.12.0 或以上、npm。
- 配套服务：Java 后端、MySQL、Redis，管理与审批使用关联的管理后台。

## 关联仓库

| 项目 | 说明 | GitHub |
| --- | --- | --- |
| maoyi-backend | 后端服务 | [maoyi-backend](https://github.com/1914156609/maoyi-backend) |
| maoyi-admin | 管理后台 | [maoyi-admin](https://github.com/1914156609/maoyi-admin) |
| maoyi-app | 用户端 | [maoyi-app](https://github.com/1914156609/maoyi-app) |

## 快速启动

完整项目使用三个同级目录，统一脚本与部署文件依赖这些目录名：

```sh
git clone https://github.com/1914156609/maoyi-backend.git
git clone https://github.com/1914156609/maoyi-admin.git
git clone https://github.com/1914156609/maoyi-app.git
cd maoyi-app
npm ci
cp .env.example .env.local
npm run dev
```

H5 开发地址为 <http://127.0.0.1:5173>。默认使用同源 `/api`，开发代理指向 `http://127.0.0.1:8080`。保存、登录和分享等操作需要先按照 [后端说明](https://github.com/1914156609/maoyi-backend#readme) 配置 Java、MySQL、Redis，初始化专用数据库并启动服务；数据库凭据与微信 AppSecret 仅放在后端私有配置中。

如需后台审批，在兄弟目录 `maoyi-admin` 安装依赖并启动，或在本目录运行：

```sh
npm --prefix ../maoyi-admin ci
npm run dev:admin
```

后台默认地址为 <http://127.0.0.1:5176>。由管理员创建、启用员工账号并分配工艺角色后，再在用户端登录。

常用命令：

```sh
npm test                  # 客户端规则与回归测试
npm run build:h5           # H5 生产构建
npm run dev:mp-weixin      # 微信小程序开发构建
npm run build:mp-weixin    # 微信小程序预览构建
```

正常 `npm ci` 会运行 [Jimp 兼容补丁](scripts/patch-jimp-file-type.mjs)，将旧版 Jimp 的文件类型探测接入维护中的 file-type API。补丁具有版本与源码散列守卫，遇到不匹配版本会拒绝安装；不要使用 `--ignore-scripts` 跳过。依赖升级时需同步审查该补丁、Uni 定制 Vue 编译器/运行时配对与 Vite 别名，并运行兼容回归。

操作要点：新增工艺的胸宽按**单片平铺宽度**填写；横密、行密度采用页面标注的每 10cm 单位。切换厘米/寸会转换物理尺寸。修改尺寸或密度后应重新计算图纸，再保存草稿、提交审批；审批处理在管理后台进行。跨设备分享需要后端配置可访问的 HTTPS 域名。

正式微信构建需要自己的 AppID、服务器 AppSecret、HTTPS API 和微信合法域名配置：

```sh
WECHAT_APP_ID=your-appid VITE_API_BASE_URL=https://example.com/api npm run build:wechat-release
```

使用微信开发者工具导入 `dist/build/mp-weixin`。AppSecret 不得进入前端环境变量。预览构建不等于真实微信登录、真机授权或公网链路已经验证；本项目未完成这些外部环境联调。

本地账号初始化和部署凭据生成需要先构建兄弟后端的 `ruoyi-admin/target/maoyi-backend.jar`，并安装 JDK 17 或以上的 `java`、`jar` 命令。工具从该 Jar 提取实际密码散列依赖，使用后清理私有临时目录，无需旧 Maven 缓存。

Docker Compose 使用三个工程的共同父目录作为构建上下文。在 `maoyi-app` 下先复制安全忽略模板，再按 [部署说明](docs/若依部署说明.md) 配置凭据和启动；已有父目录规则时先检查并合并：

```sh
cp deploy/workspace.dockerignore ../.dockerignore
```

后台镜像使用兄弟仓库公开的 `.env.production.example` 生成构建配置，不需要上传本机真实 `.env` 文件。Docker 镜像和容器启动仍需在目标环境验证。

## 项目结构

```text
maoyi-app/
├── src/              # 页面、组件、Store、API 与工艺计算/绘图
├── scripts/          # 开发、构建、依赖兼容与部署辅助脚本
├── tests/            # 客户端规则及后端联调等分层测试
├── deploy/           # 三工程配套 Docker/Nginx 配置
├── docs/references/  # 计算公式、算例与适用限制的文字说明
├── server/           # 早期 Node/Drizzle 参考实现，当前业务后端为 Java
├── .env.example      # 不含密钥的前端配置示例
└── vite.config.js    # Uni 插件、开发代理与兼容配置
```

后端联调测试需要独立测试账号和运行中的 MySQL/Redis，应在测试环境执行。私有验收证据、原始截图/视频、凭据和构建交付包不纳入公开仓库。若依的来源与归属见 [来源记录](docs/若依来源记录.md)，关联工程保留上游许可证。

## 简历描述示例

基于 uni-app、Vue 3 与 JavaScript 开发毛衣工艺客户端，实现尺寸单位换算、针行计算、二维工艺图和 PNG 导出。对接 Java 后端与管理后台，完成草稿、审批状态回显及可撤销分享流程，并维护输入边界、异步状态和依赖兼容回归。
