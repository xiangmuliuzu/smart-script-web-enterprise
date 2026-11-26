<template>
  <section id="work-detail-page" class="workspace-page work-detail-page" :data-open="open" role="region">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>作品详情</h1>
        <p>查看作品信息、采购进度、章节目录和合同信息</p>
      </div>
      <button class="workspace-page-close" type="button" data-page-close @click="$emit('close')">返回工作台</button>
    </header>
    <div class="workspace-page-body" data-page-body>
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
      <template v-else-if="work">
        <div class="work-detail-top">
          <div class="work-detail-cover" :class="{ 'script-cover': !(cover && !coverBroken) }"><img v-if="cover && !coverBroken" :src="cover" alt="作品封面" @error="coverBroken = true"><template v-else><span class="script-slip">{{ work.title }}</span><span class="bg-glyph" aria-hidden="true">{{ avatarText(work.title) }}</span></template></div>
          <div class="work-detail-heading">
            <h2>{{ work.title }}</h2>
            <div class="work-detail-meta">
              作者 {{ work.authorName || '待确认' }} · {{ genreText(work) }} · {{ episodeText(work) }}<br>
              {{ licenseLabel(purchase?.licenseType) }} · 交易日期 {{ dayText(purchase?.date) }}
            </div>
          </div>
        </div>

        <div class="work-detail-columns" :class="{ 'purchased-detail-columns': purchased }">
          <section class="work-detail-block">
            <h3>作品信息</h3>
            <div class="work-detail-block-body">
              <dl class="work-detail-info">
                <dt>作品简介</dt>
                <dd>{{ work.summary || '暂无作品简介。' }}</dd>
                <template v-if="work.copyrightRegistrationStatus">
                  <dt>版权登记状态</dt>
                  <dd>{{ work.copyrightRegistrationStatus === 'registered' ? '已登记' : '未登记' }}</dd>
                </template>
                <dt>授权方式</dt>
                <dd>{{ licenseLabel(purchase?.licenseType) }}</dd>
                <dt>采购状态</dt>
                <dd><span class="detail-purchase-state" :data-purchased="purchased">{{ status }}</span></dd>
              </dl>
              <div style="height:1px;background:var(--line);margin:19px 0"></div>
              <h3 style="padding:0 0 12px;border:0;font-size:14px">章节目录</h3>
              <LoadState v-if="chaptersPending || chaptersError" :pending="chaptersPending" :error="chaptersError" :retry="loadChapters" />
              <template v-else>
                <div v-if="purchased && !hasFullAccess" class="chapter-access-note">
                  <p>当前账号仅能试读。若已确认收货，仍无法阅读时可联系平台客服核查授权。</p>
                  <button type="button" class="btn ghost small" @click="loadChapters">刷新权限</button>
                </div>
                <div v-for="(chapter, index) in chapters" :key="chapter.chapterId" class="work-chapter-row">
                  <div>
                    <span>{{ chapterTitle(chapter) }}</span>
                    <small v-if="chapter.wordCount > 0">{{ chapter.wordCount }} 字</small>
                  </div>
                  <button type="button" class="btn light small" @click="$emit('preview', index)">{{ hasFullAccess ? '阅读' : '试读' }}</button>
                </div>
                <p v-if="!chapters.length" class="rights-note">{{ hasFullAccess ? '暂无可阅读的章节。' : '该作品暂未开放试读章节。' }}</p>
              </template>
              <div class="work-detail-subheading"><h3>分镜目录</h3></div>
              <div v-for="storyboard in storyboards" :key="storyboard.storyboardId" class="work-chapter-row">
                <div>
                  <span>{{ storyboard.chapterTitle || `第 ${storyboard.chapterNo || '?'} 章` }}</span>
                  <small v-if="storyboard.wordCount > 0">{{ storyboard.wordCount }} 字</small>
                </div>
                <button type="button" class="btn light small" :disabled="storyboard.readable !== true" @click="previewStoryboard(storyboard)">{{ storyboardReadLabel(storyboard) }}</button>
              </div>
              <p v-if="!storyboards.length" class="rights-note">暂无可浏览的分镜。</p>
            </div>
          </section>

          <aside class="work-detail-block">
            <h3>采购进度</h3>
            <div class="work-detail-block-body">
              <ol class="work-progress" :data-tone="progressIndex >= 3 ? 'indigo' : progressIndex >= 2 ? 'ochre' : 'cinnabar'">
                <li v-for="(step, index) in progress" :key="step.title" :class="index < progressIndex ? 'done' : index === progressIndex ? 'current' : ''">
                  <b>{{ step.title }}</b>
                  <span>{{ index < progressIndex ? '已完成' : index === progressIndex ? '当前处理节点' : '待处理' }}</span>
                </li>
              </ol>
            </div>
          </aside>

          <section v-if="purchased" class="work-detail-block">
            <h3>合同信息</h3>
            <div class="work-detail-block-body">
              <dl class="work-detail-info">
                <dt>合同编号</dt>
                <dd>{{ order?.orderNo || '待生成' }}</dd>
                <dt>合同金额</dt>
                <dd class="money">{{ money(purchase?.amount) }}</dd>
                <dt>授权期限</dt>
                <dd>待确认</dd>
                <dt>合同状态</dt>
                <dd><span class="tag" :class="{ red: ['confirmed', 'paying', 'escrow_pending'].includes(order?.status), gold: order?.status === 'delivering' }">{{ state(orderStatus, purchase?.orderStatus).label }}</span></dd>
              </dl>
              <!-- 后端没有用户侧合同接口，合同弹层只呈现订单能确证的信息。 -->
              <div class="work-detail-actions">
                <button type="button" class="btn light small" @click="$emit('open-contract')">查看合同详情</button>
              </div>
            </div>
          </section>
        </div>

        <div class="work-detail-actions">
          <button type="button" class="btn ghost" @click="$emit('close')">返回作品列表</button>
        </div>
      </template>
      <LoadState v-else empty empty-text="未找到该作品。" />
    </div>
    <el-dialog v-model="storyboardReaderOpen" :title="selectedStoryboard?.chapterTitle || '分镜阅读'" width="min(860px, 92vw)" align-center append-to-body :close-on-click-modal="false" destroy-on-close>
      <div class="storyboard-reader">
        <p class="reader-kicker">{{ work?.title }} · {{ selectedStoryboard?.trialEnabled === true ? '分镜试读' : '分镜阅读' }}</p>
        <pre>{{ selectedStoryboard?.content || '该分镜暂无可展示内容。' }}</pre>
        <p v-if="selectedStoryboard?.trialEnabled === true" class="reader-limit">以上为开放试读的分镜内容。</p>
      </div>
    </el-dialog>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { avatarText, avatarUrl, dayText, episodeText, genreText, licenseLabel, money, orderStatus, progressIndex as stepIndex, state, storyboardReadLabel } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, workId: { type: [Number, String], default: null }, purchase: { type: Object, default: null }, status: { type: String, default: '购买中' } })
defineEmits(['close', 'preview', 'contact', 'open-contract'])
const { api, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const work = ref(null)
const coverBroken = ref(false)
const cover = computed(() => avatarUrl(work.value?.cover) || props.purchase?.cover || '')
const chapters = ref([])
const hasFullAccess = ref(false)
const chaptersPending = ref(false)
const chaptersError = ref('')
let detailRun = 0
let chapterRun = 0
const storyboards = ref([])
const storyboardReaderOpen = ref(false)
const selectedStoryboard = ref(null)
const order = computed(() => props.purchase?.order || null)
const purchased = computed(() => props.status === '已购买')
const progress = [
  { title: '采购意向已提交' },
  { title: '报价和授权范围确认中' },
  { title: '完成确认后生成合同' },
  { title: '签署合同后进入交付' }
]
// 后端只有询盘与订单两类状态，采购进度按它们推进到对应节点。
const progressIndex = computed(() => stepIndex({ hasOrder: !!order.value, orderDone: order.value?.status === 'completed', hasQuote: !!props.purchase?.hasQuote }))
const chapterTitle = chapter => chapter.chapterTitle || '第 ' + (chapter.chapterNo || '?') + ' 章'
async function loadChapters() {
  const run = ++chapterRun
  chaptersPending.value = true
  chaptersError.value = ''
  chapters.value = []
  hasFullAccess.value = false
  try {
    const result = await api.value.listChapters(props.workId)
    if (run !== chapterRun) return
    hasFullAccess.value = result?.unlocked === true || result?.accessScope === 'full'
    chapters.value = (result?.list || []).filter(chapter => chapter.chapterId != null && chapter.readable !== false)
  } catch (failure) {
    if (run === chapterRun && !handleError(failure, { silent: true })) chaptersError.value = failure.message || '章节目录加载失败'
  } finally {
    if (run === chapterRun) chaptersPending.value = false
  }
}
async function load() {
  const run = ++detailRun
  chapterRun++
  const workId = props.workId
  work.value = null
  chapters.value = []
  storyboards.value = []
  if (!workId) return
  pending.value = true
  error.value = ''
  coverBroken.value = false
  try {
    const result = await api.value.getWork(workId)
    if (run !== detailRun) return
    work.value = result
    const storyboardRequest = api.value.listStoryboards(workId).catch(() => [])
    pending.value = false
    const [storyboardResult] = await Promise.all([storyboardRequest, loadChapters()])
    if (run === detailRun) storyboards.value = Array.isArray(storyboardResult) ? storyboardResult : (storyboardResult?.list || storyboardResult?.rows || [])
  } catch (failure) {
    if (run === detailRun && !handleError(failure, { silent: true })) error.value = failure.message || '加载作品详情失败'
  } finally { if (run === detailRun) pending.value = false }
}
function previewStoryboard(storyboard) {
  if (storyboard?.readable !== true) return
  selectedStoryboard.value = storyboard
  storyboardReaderOpen.value = true
}
watch(() => [props.open, props.workId], ([open]) => {
  storyboardReaderOpen.value = false
  if (open) load()
  else { detailRun++; chapterRun++ }
}, { immediate: true })
defineExpose({ chapters, work, hasFullAccess })
</script>
<style scoped>
.work-detail-heading { min-width: 0; overflow-wrap: anywhere; }
.detail-purchase-state { display: inline-block; padding: 2px 8px; border-radius: 4px; background: var(--goldsoft); color: var(--gold); line-height: 1.5; }
.detail-purchase-state[data-purchased="true"] { background: var(--brandsoft); color: var(--brand); }
.chapter-access-note { display: grid; justify-items: start; gap: 8px; margin-bottom: 12px; }
.work-detail-subheading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 10px; padding-top: 16px; border-top: 1px solid var(--line); }
.work-detail-subheading h3 { margin: 0; padding: 0; border: 0; font-size: 14px; }
.storyboard-reader { max-height: 66vh; overflow: auto; padding: 8px 20px 16px; }
.storyboard-reader pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 16px/1.9 ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--ink); }
.reader-kicker, .reader-limit { color: var(--muted); font-size: 13px; line-height: 1.8; }
.reader-limit { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 14px; }
</style>
