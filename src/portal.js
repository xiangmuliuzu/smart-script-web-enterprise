// label 只在 document.title 兜底用；原型最终态的标题是「剧云策 · 个人版权采购中心」。
export const portal = { label: '个人版权采购中心', tokenKey: 'PcEnterprise-Token', rememberKey: 'enterprise-remember-username', purpose: '连接好故事，让创意成为作品' }

// 登录页右上角的另一端入口。生产同域按 base 路径跳；本地两个 Vite 服务
// 分别跑在 3001/3002，需要连同端口一起切换。
export const portalSwitch = { label: '创作者端', target: '/user/' }

export function portalSwitchHref(location = window.location) {
  const devPorts = { '3001': '3002', '3002': '3001' }
  const targetPort = devPorts[String(location.port)]
  const origin = targetPort
    ? `${location.protocol}//${location.hostname}:${targetPort}`
    : location.origin
  return `${origin}${portalSwitch.target}`
}

