import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
import Layout from './layout/index.vue'
// 首页开放浏览；采购工作台及交易操作需要用户身份。
const routes = [
  { path: '', component: () => import('./views/Home.vue'), meta: { title: '发现好故事', public: true } },
  { path: 'dashboard', component: () => import('./views/PurchaseDesk.vue'), meta: { title: '个人版权采购中心' } }
]
// 任务域是与采购工作台平级的顶级页签，挂同一个 Layout 下作为第二条顶级路由，
// 而不是塞进交易抽屉的 Tab：买方发布后要留在页面里看审核状态与审核意见。
// 广场浏览（浏览别人的单、接单）不属于买方动作，这里不恢复 Square 列表；
// /demand 直接落到「我发布的任务」，页签点进来就看到自己的审核进度。
const demandRoutes = [
  { path: '', redirect: '/demand/published' },
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
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/session', redirect: '/dashboard' },
    { path: '/session-check', component: () => import('./views/Session.vue') },
    { path: '/', component: Layout, children: routes },
    { path: '/demand', component: Layout, children: demandRoutes },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && !to.meta.public && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
