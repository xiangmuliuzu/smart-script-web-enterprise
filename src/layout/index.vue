<template>
  <div class="enterprise-portal">
    <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" loading-text="正在确认账号身份…" />
    <template v-else-if="user && api">
      <header class="topbar">
        <button class="brand" type="button" @click="closeAll"><strong>剧云策</strong><span>个人版权采购中心</span></button>
        <nav class="nav">
          <button data-view="dashboard" data-current="true" type="button" @click="closeAll">采购工作台</button>
        </nav>
        <div class="top-actions">
          <button class="top-action" type="button" data-page-entry="message" @click="openMessagePage">
            消息 <span class="badge" :style="{ display: messageUnread ? 'inline-grid' : 'none' }">{{ messageUnread }}</span>
          </button>
          <button class="top-action" type="button" data-page-entry="conversation" @click="openConversationPage()">
            平台客服 <span class="badge" :style="{ display: chatUnread ? 'inline-grid' : 'none' }">{{ chatUnread }}</span>
          </button>
          <button class="top-action" type="button" aria-label="询盘" @click="openTrade('inquiry')">询盘 <span v-if="activeInquiries" class="badge">{{ activeInquiries }}</span></button>
          <button class="top-action" type="button" @click="openTrade('session')">会话</button>
          <button class="top-action" type="button" @click="openTrade('order')">订单</button>
          <button class="top-action" type="button" @click="openTrade('contract')">合同</button>
          <div class="company account-menu" :data-open="menuOpen" tabindex="0" role="button" :aria-expanded="menuOpen" aria-label="打开账户菜单"
               @click.stop="menuOpen = !menuOpen" @keydown.enter.prevent="menuOpen = !menuOpen" @keydown.space.prevent="menuOpen = !menuOpen">
            <span class="company-mark">
              <img v-if="auth.avatar && !avatarBroken" :src="auth.avatar" :alt="auth.name + '的头像'" @error="avatarBroken = true">
              <template v-else>{{ auth.mark }}</template>
            </span>
            <span class="company-text"><b>{{ auth.name }}</b><span>{{ auth.note }}</span></span>
            <div class="account-dropdown" :data-open="menuOpen">
              <button type="button" class="account-menu-item" @click.stop="profileOpen = true; menuOpen = false">个人资料</button>
              <button type="button" class="account-menu-item" @click.stop="feedbackOpen = true; menuOpen = false">意见反馈</button>
              <button type="button" class="account-menu-item danger" @click.stop="leave(); menuOpen = false">退出登录</button>
            </div>
          </div>
        </div>
      </header>

      <main class="portal-main">
        <router-view v-slot="{ Component }"><component :is="Component" ref="desk" @open-work="openWork" @open-trade="openTrade" @open-order="id => openTradeFrom({ tab: 'order', bizId: id })" /></router-view>
      </main>

      <!-- 原型最终态的浮层：作品详情页 + 章节阅读器 + 消息页 + 沟通页 + 交易抽屉 + 两个抽屉 + 订单/合同详情 -->
      <WorkDetailPage ref="detail" :open="!!activeCard" :work-id="activeCard?.workId" :purchase="activeCard" :status="activeCard?.status || '购买中'"
                      @close="activeCard = null" @preview="previewChapter" @contact="contactAuthor" @open-contract="openTrade('contract')" />
      <ChapterReader :open="!!reader" :index="reader?.index || 0" :total="readerChapters.length" :chapter-id="reader?.chapterId"
                     :title="reader?.title || ''" :work-title="activeCard?.title || ''" :author="detail?.work?.authorName || ''"
                     @close="reader = null" @step="stepChapter" />
      <MessagePage ref="messages" :open="messageOpen" @close="messageOpen = false" @read="refreshUnread" @open-trade="openTradeFrom" />
      <ConversationPage ref="conversation" :open="conversationOpen" :session-id="conversationSession" @close="conversationOpen = false" @read="refreshUnread" />
      <!-- 交易入口共用数据和相关业务操作，各入口只显示对应内容。 -->
      <Cooperation v-model="tradeOpen" :initial-tab="tradePanel" :focus-tab="tradeFocusTab" :focus-id="tradeFocusId" @clear-focus="clearTradeFocus" />
      <ProfileDrawer :open="profileOpen" @close="profileOpen = false" @saved="reload" />
      <FeedbackDrawer :open="feedbackOpen" @close="feedbackOpen = false" />
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadState from '../components/LoadState.vue'
import WorkDetailPage from '../components/WorkDetailPage.vue'
import ChapterReader from '../components/ChapterReader.vue'
import MessagePage from '../components/MessagePage.vue'
import ConversationPage from '../components/ConversationPage.vue'
import Cooperation from '../views/panels/Cooperation.vue'
import ProfileDrawer from '../components/ProfileDrawer.vue'
import FeedbackDrawer from '../components/FeedbackDrawer.vue'
import { getInfo, isAuthFailure, logout } from '../auth.js'
import { portalKey } from '../utils/portal.js'
import { avatarText, avatarUrl, realNameStatus, state } from '../utils/enterprise.js'

const router = useRouter()
const api = shallowRef(null)
const user = ref(null)
const pending = ref(true)
const error = ref('')
const realName = ref(null)
const menuOpen = ref(false)
// 头像地址失效（历史开发机地址、已删除文件）时回落到汉字圆标，避免破图图标与 alt 文案溢出圆形。
const avatarBroken = ref(false)
const profileOpen = ref(false)
const feedbackOpen = ref(false)
const messageOpen = ref(false)
const conversationOpen = ref(false)
const conversationSession = ref(null)
const tradeOpen = ref(false)
const tradePanel = ref('inquiry')
// 通知跳转：focusTab/focusId 由 openTradeFrom 注入，Cooperation 消费后 emit clear-focus 复位，避免普通打开重复触发。
const tradeFocusTab = ref('')
const tradeFocusId = ref('')
const activeCard = ref(null)
const reader = ref(null)
const readerChapters = ref([])
const unread = reactive({ message: 0, chat: 0, inquiries: 0 })
const desk = ref(null)
const detail = ref(null)
const messages = ref(null)
const conversation = ref(null)
const trade = ref(null)
let generation = 0

const auth = computed(() => ({
  mark: avatarText(user.value?.nickname || user.value?.userName),
  avatar: avatarUrl(user.value?.avatar),
  name: user.value?.nickname || user.value?.userName || '个人账号',
  note: state(realNameStatus, realName.value?.status, '认证状态待确认').label
}))
const messageUnread = computed(() => unread.message)
const chatUnread = computed(() => unread.chat)
const activeInquiries = computed(() => unread.inquiries)
watch(tradeOpen, visible => { if (!visible) desk.value?.loadTodo?.() })
// 换头像后要重新允许加载。
watch(() => user.value?.avatar, () => { avatarBroken.value = false })

function closeAll() { messageOpen.value = false; conversationOpen.value = false; tradeOpen.value = false; activeCard.value = null; reader.value = null }
function openWork(card) { activeCard.value = card || null }
async function openMessagePage() {
  if (tradeOpen.value) {
    try { await ElMessageBox.confirm('当前正在查看交易信息，是否关闭并进入消息？', '进入消息', { confirmButtonText: '进入消息', cancelButtonText: '取消' }) }
    catch { return }
    tradeOpen.value = false
  }
  conversationOpen.value = false
  messageOpen.value = true
}
function openConversationPage(sessionId = null) { conversationSession.value = sessionId; conversationOpen.value = true }
function openTrade(panel = 'inquiry') { tradeFocusTab.value = ''; tradeFocusId.value = ''; tradePanel.value = panel; tradeOpen.value = true }
function clearTradeFocus() { tradeFocusTab.value = ''; tradeFocusId.value = '' }
// 通知跳转：messageOpen 关闭后带着目标 Tab 与业务主键打开 Cooperation，由其定位到具体记录。
function openTradeFrom(payload) {
  messageOpen.value = false
  const tab = payload?.tab || 'inquiry'
  if (payload?.bizId != null && payload.bizId !== '') { tradeFocusTab.value = tab; tradeFocusId.value = String(payload.bizId) }
  else { tradeFocusTab.value = ''; tradeFocusId.value = '' }
  tradePanel.value = tab
  tradeOpen.value = true
}
// 作品详情页里的「章节预览」：用已加载的章节列表定位当前章。
function previewChapter(index) {
  const chapters = detail.value?.chapters || []
  readerChapters.value = chapters
  const chapter = chapters[index]
  reader.value = { index, chapterId: chapter?.chapterId, title: chapter?.chapterTitle || `第 ${index + 1} 章` }
}
function stepChapter(index) { previewChapter(index) }
async function contactAuthor() {
  // 与作者的交流属于交易范畴：落在交易中心的「会话」Tab，沟通页只保留与平台管理员的记录。
  activeCard.value = null
  ElMessage.info('可在「会话」中与作者沟通（需先发起询盘）')
  openTrade('session')
}
async function refreshUnread() {
  try {
    unread.message = await api.value.unreadCount()
    unread.chat = await api.value.chatUnreadCount()
  } catch { /* 未读数失败不打断主流程 */ }
}
async function reload() { await desk.value?.load?.(); refreshUnread() }
function handleError(failure, { silent = false } = {}) {
  if (isAuthFailure(failure)) { router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } }); return true }
  if (!silent) ElMessage.error(failure?.message || '操作未完成，请稍后重试')
  return false
}
async function load() {
  const current = ++generation
  pending.value = true
  error.value = ''
  try {
    const result = await getInfo()
    if (current !== generation) return
    user.value = result.user
    api.value = await import('../api/enterprise.js')
    refreshUnread()
    // 待处理询盘数与实名认证状态用于顶栏标注，失败时按未确认显示。
    api.value.listInquiries({ pageSize: 50 }).then(result => { if (current === generation) unread.inquiries = result.list.length }).catch(() => {})
    api.value.getRealName().then(value => { if (current === generation) realName.value = value }).catch(() => {})
  } catch (failure) {
    if (current !== generation) return
    if (isAuthFailure(failure)) { await router.replace('/login'); return }
    error.value = failure.message || '无法连接服务，请稍后重试'
  } finally { if (current === generation) pending.value = false }
}
async function leave() {
  ++generation
  try { await logout() } catch { ElMessage.warning('服务端退出未成功，已清理本地登录状态') }
  await router.replace('/login')
}
function onDocumentClick() { menuOpen.value = false }
// 原型 s3 的 Escape 只做 closeModal + closeDrawer('messages'|'company'|'trade'|'feedback') + closeTradeDetail；
// 沟通页在原型里没有抽屉形态，只能由它自己的关闭按钮退出，这里保持一致。
function onKeydown(event) {
  if (event.key !== 'Escape') return
  reader.value = null
  messageOpen.value = false
  tradeOpen.value = false
  profileOpen.value = false
  feedbackOpen.value = false
}
onMounted(() => { load(); document.addEventListener('click', onDocumentClick); document.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { document.removeEventListener('click', onDocumentClick); document.removeEventListener('keydown', onKeydown) })
provide(portalKey, { api, user, auth, handleError, refreshUnread, unread, openTrade })
</script>
