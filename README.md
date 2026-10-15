# 剧云策 PC 企业端

Vue 3 + Vite + Element Plus。**还原基准是原型 `剧云策-企业端原型.html` 在浏览器里执行完所有初始化脚本后的最终渲染状态**，不是 HTML 前半部分的静态结构。原型最终态只有一个主体视图「采购工作台」`/dashboard`；发现剧本、我的购买作品、交易中心等已被原型脚本改造成顶栏入口与浮层，因此在项目里同样是浮层而非路由。原型样式原样搬到 `src/assets/styles/prototype.css`（6 个 `<style>` 块合并，不修改规则），Element Plus 主题桥接在 `src/assets/styles/portal.css`。

浮层与对应能力：交易中心抽屉（询盘 / 订单 / 合同）、消息页、沟通页、作品详情页、章节试读弹层、订单与合同详情弹层、个人资料抽屉、意见反馈抽屉。

用户端与企业端共用平台普通用户账号。普通用户默认是甲方，可申请创作者能力；未来创作功能只依据服务端 authorCapability，不按 userType 硬分流。现有用户域 01/02/03 均可登录，管理员域 00 使用独立运维管理端。

## 开发与验证

要求 Node.js ^20.19.0 或 >=22.12.0。

```sh
npm ci
npm run dev
npm run gate
```

开发地址 http://localhost:3002/enterprise/。通过 .env.local 的 VITE_API_TARGET 指定同一整体后端；默认 http://localhost:8080。

## 认证协议

| 动作 | 接口 |
| --- | --- |
| 验证码 | GET /api/v1/auth/captchaImage |
| 登录 | POST /api/v1/auth/login，username/password/code/uuid |
| 身份恢复 | GET /api/v1/auth/getInfo |
| 退出 | POST /api/v1/auth/logout |

使用若依 AjaxResult：成功 code=200，token、user、roles、permissions 在顶层；受保护请求附 Authorization: Bearer token。只记住用户名，不存密码或 refresh token。企业端令牌独立存储，两个端互不清理彼此会话。
验证码只有服务端明确 captchaEnabled=false 时才关闭；加载失败需重试。刷新会重新确认身份；认证失效/账号停用清理会话，普通权限错误或网络/5xx 保留令牌并允许重试。

## 部署

npm run build 输出 dist，固定挂载到 `/enterprise/`，对应服务器 http://124.221.131.38/enterprise/。Vite 资源前缀和 Vue Router history 使用同一基础路径；例如 `/enterprise/login`、`/enterprise/session`。将 dist 内容部署到企业端目录，`/enterprise/*` 的 SPA 路由必须回退到该目录的 index.html。

生产默认 VITE_APP_BASE_API=/prod-api；网关需将站点根路径 /prod-api/* 去除前缀后转发至整体后端。接口地址不加 `/enterprise/`，例如 `/prod-api/api/v1/auth/login`。不要把 `/enterprise/login` SPA 地址代理到后端。
管理员端位于 `/`，用户端位于 `/user/`。下述回跳地址是应用内部路径，由 Router 自动添加 `/enterprise/` 前缀，不能手工重复添加。当前版本的回跳白名单包含 /session、/session-check、/dashboard；新增主体路由时同步扩展。
前端账号域检查只用于入口防护，业务授权与创作者能力仍由后端验证。

## 业务接口

页面只调用普通用户域接口：`/api/v1/trade/inquiry`、`/api/v1/trade/quote`、`/api/v1/trade/order`、`/api/v1/content/*`、`/api/v1/messages`、`/api/v1/users/me/chat`、`/api/v1/users/me/profile`、`/api/v1/users/me/real-name`、`/api/v1/feedback`。后端没有面向用户侧的合同、交付、企业工商信息接口，相应位置显示「服务尚未开放」，不调用 `/api/v1/admin/*`、不伪造成功状态。金额口径见 `src/utils/enterprise.js`：订单 `amount` 是分，报价 `price`、询盘 `budget`、作品 `price` 是元。
