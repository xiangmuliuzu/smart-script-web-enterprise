import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
import Layout from './layout/index.vue'
// 原型最终态只有「采购工作台」一个视图：发现剧本 / 我的购买作品 / 交易中心
// 已被原型脚本隐藏并改造为顶栏入口与浮层，不能再作为独立路由恢复。
const routes = [
  { path: 'dashboard', component: () => import('./views/PurchaseDesk.vue'), meta: { title: '个人版权采购中心' } }
]
// 任务广场是发布者侧的独立业务域（发布/托管/逐轮验收），与采购工作台平级成顶级页签，
// 因此挂在同一个 Layout 下作为第二条顶级路由，而不是塞进交易抽屉的 Tab。
const demandRoutes = [
  { path: '', component: () => import('./views/demand/Square.vue'), meta: { title: '任务广场' } },
  { path: 'published', component: () => import('./views/demand/Published.vue'), meta: { title: '我发布的任务' } },
  { path: 'create', component: () => import('./views/demand/PublishForm.vue'), meta: { title: '发布任务' } },
  // 详情与编辑的 id 必须是数字，否则会把 'create'/'published' 当成任务编号
  { path: ':id(\\d+)', name: 'demand-detail', component: () => import('./views/demand/Detail.vue'), meta: { title: '任务详情' } },
  { path: ':id(\\d+)/edit', name: 'demand-edit', component: () => import('./views/demand/PublishForm.vue'), meta: { title: '编辑任务' } },
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
    { path: '/demand', component: Layout, children: demandRoutes },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]
})
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
