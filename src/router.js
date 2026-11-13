import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
import Layout from './layout/index.vue'
// 原型最终态只有「采购工作台」一个视图：发现剧本 / 我的购买作品 / 交易中心
// 已被原型脚本隐藏并改造为顶栏入口与浮层，不能再作为独立路由恢复。
const routes = [
  { path: 'dashboard', component: () => import('./views/PurchaseDesk.vue'), meta: { title: '个人版权采购中心' } }
]
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/session', redirect: '/dashboard' },
    { path: '/session-check', component: () => import('./views/Session.vue') },
    { path: '/', component: Layout, children: routes },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]
})
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
