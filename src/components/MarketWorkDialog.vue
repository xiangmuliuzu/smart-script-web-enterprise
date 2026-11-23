<template>
  <el-dialog
    :model-value="Boolean(workId)"
    title="作品详情"
    width="min(1120px, 94vw)"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="(v) => !v && emit('close')"
  >
    <LoadState v-if="loading || error" :pending="loading" :error="error" :retry="load" />
    <div v-else-if="work" class="market-detail">
      <aside>
        <MarketCover :work="work" />
        <p class="detail-byline">{{ work.authorName || '平台创作者' }} · {{ workGenre(work) }}</p>
        <p>
          {{ work.episodeCount || 0 }} 集 · {{ Number(work.wordCount || 0).toLocaleString() }} 字
        </p>
        <button class="btn market-buy" @click="startInquiry">发起询盘 / 洽谈购买 ↗</button
        ><small>先试读，再与作者确认价格与合作范围。</small>
      </aside>
      <section>
        <p class="market-eyebrow">STORY OVERVIEW</p>
        <h2>{{ work.title }}</h2>
        <p v-if="work.copyrightRegistrationStatus" class="detail-byline">
          版权登记状态：{{ work.copyrightRegistrationStatus === 'registered' ? '已登记' : '未登记' }}
        </p>
        <h3>作品简介</h3>
        <p class="market-synopsis">{{ work.summary || '作者暂未填写简介。' }}</p>
        <div class="chapter-heading">
          <h3>章节目录</h3>
          <span>{{ hasFullAccess ? '已获阅读权限' : '试读范围由作者与平台配置' }}</span>
        </div>
        <LoadState v-if="chaptersError" :error="chaptersError" :retry="load" />
        <div v-else class="market-chapters">
          <button
            v-for="chapter in chapters"
            :key="chapter.chapterId"
            :disabled="!canReadChapter(chapter)"
            @click="readChapter(chapter)"
          >
            <span>{{ chapter.chapterTitle || `第 ${chapter.chapterNo} 章` }}</span
            ><small>{{ canReadChapter(chapter) ? (hasFullAccess ? '阅读 →' : '试读 →') : '暂未开放' }}</small>
          </button>
          <p v-if="!chapters.length">{{ hasFullAccess ? '暂无可阅读的章节。' : '该作品暂未开放章节试读。' }}</p>
        </div>
        <div class="storyboard-heading">
          <h3>分镜目录</h3>
        </div>
        <LoadState v-if="storyboardsError" :error="storyboardsError" :retry="loadStoryboards" />
        <div v-else class="market-storyboards">
          <button
            v-for="storyboard in storyboards"
            :key="storyboard.storyboardId"
            :disabled="storyboard.readable !== true"
            @click="readStoryboard(storyboard)"
          >
            <span>
              <strong>{{ storyboard.chapterTitle || `第 ${storyboard.chapterNo || '?'} 章` }}</strong>
              <small v-if="storyboard.wordCount > 0">{{ storyboard.wordCount }} 字</small>
            </span>
            <small>{{ storyboardReadLabel(storyboard) }}{{ storyboard.readable === true ? ' →' : '' }}</small>
          </button>
          <p v-if="!storyboards.length">暂无可浏览的分镜。</p>
        </div>
      </section>
    </div>
  </el-dialog>
  <el-dialog
    v-model="storyboardReaderOpen"
    :title="selectedStoryboard?.chapterTitle || '分镜阅读'"
    width="min(860px, 94vw)"
    align-center
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="market-reader storyboard-reader">
      <p class="reader-kicker">{{ work?.title }} · {{ selectedStoryboard?.trialEnabled === true ? '分镜试读' : '分镜阅读' }}</p>
      <LoadState v-if="storyboardReading || storyboardReadError" :pending="storyboardReading" :error="storyboardReadError" />
      <article v-else v-html="safeStoryboardContent"></article>
      <p v-if="selectedStoryboard?.trialEnabled === true" class="reader-limit">以上为开放试读的分镜内容。</p>
    </div>
  </el-dialog>
  <el-dialog
    v-model="readerOpen"
    :title="selectedChapter?.chapterTitle || (hasFullAccess ? '章节阅读' : '章节试读')"
    width="min(860px, 94vw)"
    align-center
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div ref="chapterReader" class="market-reader">
      <p class="reader-kicker">{{ work?.title }} · {{ work?.authorName || '平台创作者' }}</p>
      <LoadState
        v-if="reading || readError"
        :pending="reading"
        :error="readError"
        :retry="() => readChapter(selectedChapter)"
      />
      <article v-else v-html="safeContent"></article>
      <p v-if="!hasFullAccess" class="reader-limit">当前仅展示开放试读的章节内容。</p>
      <nav class="chapter-reader-nav" aria-label="章节翻页">
        <button
          type="button"
          :disabled="reading || !previousChapter"
          @click="readChapter(previousChapter)"
        >‹ 上一章</button>
        <button
          type="button"
          :disabled="reading || !nextChapter"
          @click="readChapter(nextChapter)"
        >下一章 ›</button>
      </nav>
    </div>
  </el-dialog>
  <el-dialog
    v-model="inquiryOpen"
    title="发起作品询盘"
    width="min(620px, 94vw)"
    align-center
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    :before-close="closeInquiry"
  >
    <p class="inquiry-work">《{{ work?.title }}》</p>
    <LoadState
      v-if="checking || copyrightError"
      :pending="checking"
      :error="copyrightError"
      :retry="loadCopyright"
    />
    <form v-else class="market-inquiry" @submit.prevent="submit">
      <label v-if="copyrighted"
        >授权类型 *<select v-model="form.licenseType" :disabled="submitting">
          <option value="non_exclusive">非独家授权</option>
          <option value="exclusive">独家授权</option>
          <option value="adaptation">改编授权</option>
        </select></label
      >
      <p v-else class="copyright-note">
        该作品尚未完成版权登记发证，本次无需选择授权类型；确认报价后的合同与付款流程按平台规则办理。
      </p>
      <label
        >预期用途 *<textarea
          v-model="form.intendedUse"
          required
          maxlength="500"
          rows="3"
          placeholder="例如：改编成竖屏短剧，请说明计划使用场景"
          :disabled="submitting"
        />
      </label>
      <label
        >预算金额（元，可选）<input
          v-model="form.budget"
          inputmode="decimal"
          placeholder="如 1000.00，不确定可留空"
          :disabled="submitting"
      /></label>
      <label
        >给作者留言（可选）<textarea
          v-model="form.message"
          maxlength="1000"
          rows="3"
          placeholder="说明合作意向或希望确认的问题"
          :disabled="submitting"
        />
      </label>
      <p v-if="submitError" role="alert" class="market-error">{{ submitError }}</p>
      <div class="inquiry-actions">
        <button type="button" class="btn ghost" :disabled="submitting" @click="inquiryOpen = false">
          取消</button
        ><button class="btn" :disabled="submitting">
          {{ submitting ? '正在提交…' : '提交询盘' }}
        </button>
      </div>
    </form>
  </el-dialog>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import DOMPurify from 'dompurify'
import MarketCover from './MarketCover.vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { asList, storyboardReadLabel } from '../utils/enterprise.js'
import { requireLogin, inquiryPayload, workGenre } from '../utils/market.js'
const props = defineProps({ workId: [Number, String], initialAction: String })
const emit = defineEmits(['close', 'created'])
const { api, user } = usePortal()
const router = useRouter()
const work = ref(null),
  chapters = ref([]),
  hasFullAccess = ref(false),
  storyboards = ref([]),
  loading = ref(false),
  error = ref(''),
  chaptersError = ref(''),
  storyboardsError = ref('')
const readerOpen = ref(false),
  chapterReader = ref(null),
  selectedChapter = ref(null),
  reading = ref(false),
  readError = ref(''),
  content = ref('')
const storyboardReaderOpen = ref(false),
  selectedStoryboard = ref(null),
  storyboardReading = ref(false),
  storyboardReadError = ref(''),
  storyboardContent = ref('')
const inquiryOpen = ref(false),
  copyrighted = ref(true),
  checking = ref(false),
  copyrightError = ref(''),
  submitting = ref(false),
  submitError = ref('')
const form = reactive({ licenseType: 'non_exclusive', intendedUse: '', budget: '', message: '' })
let loadRun = 0,
  readRun = 0,
  copyrightRun = 0
function canReadChapter(chapter) {
  return Boolean(chapter?.chapterId) && chapter.readable !== false
}
const readableChapters = computed(() => chapters.value.filter(canReadChapter))
const readingChapterIndex = computed(() =>
  readableChapters.value.findIndex((chapter) =>
    String(chapter.chapterId) === String(selectedChapter.value?.chapterId)
  )
)
const previousChapter = computed(() => readableChapters.value[readingChapterIndex.value - 1])
const nextChapter = computed(() =>
  readingChapterIndex.value < 0 ? undefined : readableChapters.value[readingChapterIndex.value + 1]
)
const safeContent = computed(() =>
  DOMPurify.sanitize(content.value, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'ul',
      'ol',
      'li'
    ],
    ALLOWED_ATTR: []
  })
)
const safeStoryboardContent = computed(() =>
  DOMPurify.sanitize(storyboardContent.value, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  })
)
async function load() {
  const run = ++loadRun
  loading.value = true
  error.value = ''
  chaptersError.value = ''
  storyboardsError.value = ''
  chapters.value = []
  hasFullAccess.value = false
  storyboards.value = []
  work.value = null
  const id = props.workId
  try {
    const detail = await api.value.getWork(id)
    if (run !== loadRun) return
    work.value = detail
    try {
      const result = await api.value.listChapters(id)
      if (run === loadRun) {
        hasFullAccess.value = result?.unlocked === true || result?.accessScope === 'full'
        chapters.value = asList(result)
      }
    } catch (failure) {
      if (run === loadRun) chaptersError.value = failure.message
    }
    try {
      const list = await api.value.listStoryboards(id)
      if (run === loadRun) storyboards.value = asList(list)
    } catch (failure) {
      if (run === loadRun) storyboardsError.value = failure.message
    }
    if (run === loadRun && props.initialAction === 'inquiry') await startInquiry()
  } catch (failure) {
    if (run === loadRun) error.value = failure.message
  } finally {
    if (run === loadRun) loading.value = false
  }
}
async function loadStoryboards() {
  if (!props.workId) return
  storyboardsError.value = ''
  try {
    storyboards.value = asList(await api.value.listStoryboards(props.workId))
  } catch (failure) {
    storyboardsError.value = failure.message
  }
}
async function readChapter(chapter) {
  if (!canReadChapter(chapter)) return
  const run = ++readRun
  selectedChapter.value = chapter
  readerOpen.value = true
  reading.value = true
  readError.value = ''
  content.value = ''
  if (chapterReader.value) chapterReader.value.scrollTop = 0
  try {
    const result = await api.value.getChapter(chapter.chapterId)
    if (run !== readRun) return
    if (result?.readable === false) {
      readError.value = '当前账号无法阅读此章节。'
      return
    }
    const text = String(result?.content || '')
    content.value =
      result?.formattedContent ||
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  } catch (failure) {
    if (run === readRun) readError.value = failure.message
  } finally {
    if (run === readRun) reading.value = false
  }
}
function readStoryboard(storyboard) {
  if (!storyboard?.storyboardId || storyboard.readable !== true) return
  selectedStoryboard.value = storyboard
  storyboardReadError.value = ''
  storyboardContent.value = ''
  storyboardReaderOpen.value = true
  storyboardReading.value = true
  try {
    const text = String(storyboard.content || '')
    storyboardContent.value = text
      ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      : '该分镜暂无可展示内容。'
  } catch (failure) {
    storyboardReadError.value = failure.message || '分镜试读加载失败'
  } finally {
    storyboardReading.value = false
  }
}
async function loadCopyright() {
  const run = ++copyrightRun
  checking.value = true
  copyrightError.value = ''
  try {
    const status = await api.value.getWorkCopyrightStatus(props.workId)
    if (run === copyrightRun) copyrighted.value = status === true
  } catch (failure) {
    if (run === copyrightRun) copyrightError.value = failure.message
  } finally {
    if (run === copyrightRun) checking.value = false
  }
}
async function startInquiry() {
  const redirect = '/?workId=' + encodeURIComponent(props.workId) + '&action=inquiry'
  if (!(await requireLogin(router, '发起询盘', redirect))) return
  if (work.value?.authorId != null && String(work.value.authorId) === String(user.value?.userId)) {
    ElMessage.info('不能对自己的作品发起询盘')
    return
  }
  Object.assign(form, { licenseType: 'non_exclusive', intendedUse: '', budget: '', message: '' })
  submitError.value = ''
  inquiryOpen.value = true
  await loadCopyright()
}
function closeInquiry(done) {
  if (!submitting.value) done()
}
async function submit() {
  if (submitting.value || checking.value || copyrightError.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const result = await api.value.createInquiry(
      inquiryPayload(props.workId, form, copyrighted.value)
    )
    inquiryOpen.value = false
    ElMessage.success('询盘已提交，可在询盘中查看回复并协商报价')
    emit('created', result)
  } catch (failure) {
    submitError.value = failure.message
  } finally {
    submitting.value = false
  }
}
watch(
  () => props.workId,
  (id) => {
    ++readRun
    ++copyrightRun
    readerOpen.value = false
    storyboardReaderOpen.value = false
    inquiryOpen.value = false
    if (id) load()
    else ++loadRun
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  ++loadRun
  ++readRun
  ++copyrightRun
})
</script>
<style scoped>
.market-detail {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 36px;
  max-height: 72vh;
  overflow: auto;
  padding: 8px 4px 20px;
  color: #243d37;
}
.market-detail aside {
  font-size: 14px;
}
.market-detail aside small {
  display: block;
  color: #716b61;
  line-height: 1.7;
  margin-top: 12px;
}
.market-buy {
  width: 100%;
  margin-top: 15px;
  padding: 14px 8px;
  font-weight: 600;
}
.detail-byline {
  line-height: 1.8;
}
.market-detail h2 {
  font: 600 34px/1.4 var(--serif);
  margin: 6px 0 26px;
}
.market-detail h3 {
  font-size: 17px;
}
.market-synopsis {
  white-space: pre-wrap;
  font-size: 16px;
  line-height: 1.95;
  color: #5e665f;
}
.market-eyebrow {
  color: #8a6228;
  font-size: 12px;
  letter-spacing: 0.18em;
}
.chapter-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
}
.chapter-heading span {
  font-size: 12px;
  color: #716b61;
}
.market-chapters {
  border-top: 1px solid #ded9ce;
  max-height: 300px;
  overflow: auto;
}
.market-chapters button {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 20px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #e8e3d9;
  padding: 16px 8px;
  background: transparent;
  color: #2c4a52;
}
.market-chapters button:hover {
  background: #edf2ec;
}
.market-chapters button:disabled {
  color: #a5a49d;
  cursor: not-allowed;
}
.market-chapters small {
  white-space: nowrap;
}
.storyboard-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
}
.market-storyboards {
  border-top: 1px solid #ded9ce;
  max-height: 300px;
  overflow: auto;
}
.market-storyboards button {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #e8e3d9;
  padding: 14px 8px;
  background: transparent;
  color: #2c4a52;
}
.market-storyboards button:hover { background: #edf2ec; }
.market-storyboards button:disabled { color: #a5a49d; cursor: not-allowed; }
.market-storyboards button > span { display: grid; gap: 4px; min-width: 0; }
.market-storyboards button small { white-space: nowrap; }
.market-storyboards button span small { color: #817564; }
.storyboard-reader article { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 16px; }
.market-reader {
  max-height: 66vh;
  overflow: auto;
  padding: 10px clamp(8px, 4vw, 48px);
}
.reader-kicker,
.reader-limit {
  color: #817564;
  font-size: 13px;
  line-height: 1.8;
}
.market-reader article {
  font: 18px/2.1 var(--serif);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.reader-limit {
  border-top: 1px solid #ded9ce;
  margin-top: 30px;
  padding-top: 20px;
}
.chapter-reader-nav {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 8px;
}
.chapter-reader-nav button {
  flex: 1 1 0;
  max-width: 180px;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid #b8c8be;
  border-radius: 6px;
  background: #eff5f1;
  color: #295345;
  font: inherit;
  cursor: pointer;
}
.chapter-reader-nav button:hover:not(:disabled) {
  background: #e0ede5;
}
.chapter-reader-nav button:disabled {
  border-color: #dedfd9;
  background: #f4f4ef;
  color: #747871;
  cursor: not-allowed;
}
.market-inquiry {
  max-height: 65vh;
  overflow: auto;
  padding: 0 4px;
}
.market-inquiry label {
  display: grid;
  gap: 8px;
  margin: 20px 0;
  font-size: 15px;
}
.market-inquiry :is(input, select, textarea) {
  padding: 12px;
  border: 1px solid #ccc9bf;
  border-radius: 4px;
  width: 100%;
  font: inherit;
  background: #fff;
}
.inquiry-work {
  font-size: 20px;
  color: #2c4a52;
}
.copyright-note {
  background: #f5eedf;
  padding: 14px;
  line-height: 1.8;
}
.inquiry-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 0;
}
.market-error {
  color: #ae382e;
}
@media (max-width: 680px) {
  .market-detail {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .market-detail aside .market-cover {
    width: 150px;
    float: left;
    margin-right: 20px;
  }
  .market-detail aside {
    display: flow-root;
  }
  .market-detail h2 {
    font-size: 27px;
  }
  .chapter-heading {
    display: block;
  }
}
</style>
