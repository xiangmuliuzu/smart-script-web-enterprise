import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
import Layout from './layout/index.vue'
// 首页开放浏览；采购工作台及交易操作需要用户身份。
const routes = [
  { path: '', component: () => import('./views/Home.vue'), meta: { title: '发现好故事', public: true } },
  { path: 'dashboard', component: () => import('./views/PurchaseDesk.vue'), meta: { title: '个人版权采购中心' } }
]
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/session', redirect: '/dashboard' },
    { path: '/session-check', component: () => import('./views/Session.vue') },
    { path: '/', component: Layout, children: routes },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && !to.meta.public && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
