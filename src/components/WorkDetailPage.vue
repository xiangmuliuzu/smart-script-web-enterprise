<template>
  <section id="work-detail-page" class="workspace-page work-detail-page" :data-open="open" role="region">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>作品详情</h1>
        <p>查看作品信息、采购进度、章节预览和合同信息</p>
      </div>
      <button class="workspace-page-close" type="button" data-page-close @click="$emit('close')">返回工作台</button>
    </header>
    <div class="workspace-page-body" data-page-body>
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
      <template v-else-if="work">
        <div class="work-detail-top">
          <div class="work-detail-cover"><img v-if="cover && !coverBroken" :src="cover" alt="作品封面" @error="coverBroken = true"><template v-else>{{ avatarText(work.title) }}</template></div>
          <div>
            <h2>{{ work.title }}</h2>
            <div class="work-detail-meta">
              作者 {{ work.authorName || '待确认' }} · {{ genreText(work) }} · {{ episodeText(work) }}<br>
              {{ licenseLabel(purchase?.licenseType) }} · 交易日期 {{ dayText(purchase?.date) }}
            </div>
          </div>
          <span class="purchase-status work-detail-status" :class="{ pending: status === '购买中' }">{{ status }}</span>
        </div>

        <div class="work-detail-columns" :class="{ 'purchased-detail-columns': purchased }">
          <section class="work-detail-block">
            <h3>作品信息</h3>
            <div class="work-detail-block-body">
              <dl class="work-detail-info">
                <dt>作品简介</dt>
                <dd>{{ work.summary || '暂无作品简介。' }}</dd>
                <dt>授权方式</dt>
                <dd>{{ licenseLabel(purchase?.licenseType) }}</dd>
                <dt>作品状态</dt>
                <dd>{{ status }}</dd>
              </dl>
              <div style="height:1px;background:var(--line);margin:19px 0"></div>
              <h3 style="padding:0 0 12px;border:0;font-size:14px">章节预览</h3>
              <div v-for="(chapter, index) in chapters" :key="chapter.chapterId" class="work-chapter-row">
                <div>
                  <span>{{ chapterTitle(chapter) }}</span>
                  <small>仅展示试读内容</small>
                </div>
                <button type="button" class="btn light small" @click="$emit('preview', index)">章节预览</button>
              </div>
              <p v-if="!chapters.length" class="rights-note">该作品暂未开放试读章节。</p>
            </div>
          </section>

          <aside class="work-detail-block">
            <h3>采购进度</h3>
            <div class="work-detail-block-body">
              <ol class="work-progress">
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
                <dd><span class="tag">{{ state(orderStatus, purchase?.orderStatus).label }}</span></dd>
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
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { avatarText, avatarUrl, dayText, episodeText, genreText, licenseLabel, money, orderStatus, progressIndex as stepIndex, state } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, workId: { type: [Number, String], default: null }, purchase: { type: Object, default: null }, status: { type: String, default: '购买中' } })
defineEmits(['close', 'preview', 'contact', 'open-contract'])
const { api, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const work = ref(null)
const coverBroken = ref(false)
const cover = computed(() => avatarUrl(work.value?.cover) || props.purchase?.cover || '')
const chapters = ref([])
const order = computed(() => props.purchase?.order || null)
const purchased = computed(() => props.status === '已购买')
const progress = [
  { title: '采购意向已提交' },
  { title: '报价和授权范围确认中' },
  { title: '完成确认后生成合同' },
  { title: '签署合同后进入交付' }
]
// 后端只有询盘与订单两类状态，采购进度按它们推进到对应节点。
const progressIndex = computed(() => stepIndex({ hasOrder: !!order.value, orderDone: order.value?.status === 'confirmed', hasQuote: !!props.purchase?.hasQuote }))
const chapterTitle = chapter => chapter.chapterTitle || '第 ' + (chapter.chapterNo || '?') + ' 章'
async function load() {
  if (!props.workId) { work.value = null; chapters.value = []; return }
  pending.value = true
  error.value = ''
  coverBroken.value = false
  try {
    work.value = await api.value.getWork(props.workId)
    // 章节列表失败不该挡住作品信息，缺失时只显示未开放试读。
    const result = await api.value.listChapters(props.workId).catch(() => null)
    chapters.value = result?.list || []
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载作品详情失败'
  } finally { pending.value = false }
}
watch(() => [props.open, props.workId], ([open]) => { if (open) load() }, { immediate: true })
defineExpose({ chapters, work })
</script>
