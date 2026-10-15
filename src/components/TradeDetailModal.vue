<template>
  <div id="trade-detail-modal" class="modal-bg" :data-open="open">
    <div class="modal">
      <div class="drawer-head">
        <h2>{{ title }}</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="drawer-body">
        <div class="order-detail-grid">
          <section class="trade-detail-block">
            <h3>{{ mode === 'contract' ? '合同信息' : '订单信息' }}</h3>
            <div class="trade-detail-body">
              <dl class="trade-detail-list">
                <template v-if="mode === 'contract'">
                  <dt>合同编号</dt><dd>{{ order?.orderNo || '待生成' }}</dd>
                  <dt>关联作品</dt><dd>{{ order?.workTitle || '—' }}</dd>
                  <dt>合同金额</dt><dd class="money">{{ money(order?.amount) }}</dd>
                  <dt>授权期限</dt><dd>待确认</dd>
                  <dt>授权方式</dt><dd>{{ licenseLabel(order?.licenseType) }}</dd>
                  <dt>合同状态</dt><dd><span class="tag" :class="orderTone">{{ orderLabel }}</span></dd>
                </template>
                <template v-else>
                  <dt>订单编号</dt><dd>{{ order?.orderNo || '—' }}</dd>
                  <dt>关联作品</dt><dd>{{ order?.workTitle || '—' }}</dd>
                  <dt>作者</dt><dd>{{ order?.sellerName || '待确认' }}</dd>
                  <dt>授权方式</dt><dd>{{ licenseLabel(order?.licenseType) }}</dd>
                  <dt>订单金额</dt><dd class="money">{{ money(order?.amount) }}</dd>
                  <dt>当前状态</dt><dd><span class="tag" :class="orderTone">{{ orderLabel }}</span></dd>
                  <dt>交易日期</dt><dd>{{ dayText(order?.createdAt) }}</dd>
                </template>
              </dl>
            </div>
          </section>
          <section class="trade-detail-block">
            <h3>{{ mode === 'contract' ? '合同流程' : '订单流程' }}</h3>
            <div class="trade-detail-body">
              <ol class="trade-timeline">
                <li v-for="(step, index) in steps" :key="step.title" :class="index < stepAt ? 'done' : index === stepAt ? 'current' : ''">
                  <b>{{ step.title }}</b>
                  <span>{{ index < stepAt ? step.done : index === stepAt ? step.current : step.todo }}</span>
                </li>
              </ol>
            </div>
          </section>
        </div>
        <div class="trade-detail-actions">
          <button class="btn ghost" @click="$emit('close')">关闭</button>
          <!-- 后端没有用户侧合同/交付接口，签署入口明确按未开放处理。 -->
          <button v-if="mode === 'contract'" class="btn" @click="ElMessage.info(NOT_OPEN_NOTE)">补充信息并签署</button>
          <button v-else class="btn" @click="$emit('contact', order)">联系相关人员</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { NOT_OPEN_NOTE, dayText, licenseLabel, money, orderStatus, state } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, mode: { type: String, default: 'order' }, order: { type: Object, default: null } })
defineEmits(['close', 'contact'])
const title = computed(() => (props.mode === 'contract' ? '合同详情 · ' : '订单详情 · ') + (props.order?.workTitle || props.order?.orderNo || ''))
const orderLabel = computed(() => state(orderStatus, props.order?.status).label)
const orderTone = computed(() => state(orderStatus, props.order?.status).tone)
// 后端订单只有 confirmed / cancelled 两种状态，流程节点据此推进。
const stepAt = computed(() => props.order?.status === 'confirmed' ? 3 : 2)
const steps = computed(() => props.mode === 'contract'
  ? [
      { title: '合同草稿', done: '已根据询盘和线下谈判记录生成', current: '正在生成', todo: '待生成' },
      { title: '双方确认授权范围', done: '授权类型、期限和地区已确认', current: '正在确认', todo: '待确认' },
      { title: '电子签署', done: '合同已签署', current: '等待签署', todo: '待签署' },
      { title: '归档生效', done: '已归档', current: '准备归档', todo: '签署后进入归档' }
    ]
  : [
      { title: '创建采购订单', done: '询盘和授权条件已经确认', current: '正在确认', todo: '待确认' },
      { title: '确认合同信息', done: '已整理授权期限、地区和用途', current: '正在整理', todo: '待整理' },
      { title: '合同签署与履行', done: '合同状态：' + orderLabel.value, current: '等待签署', todo: '待签署' },
      { title: '作品文件交付', done: '作品已完成交付', current: '等待作者提交交付文件', todo: '签署合同后进入交付' }
    ])
</script>
