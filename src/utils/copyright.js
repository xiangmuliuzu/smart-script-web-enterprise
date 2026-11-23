/**
 * 版权交割文案（企业端仅买方视角）。
 * 流程：付款建单(pending_upload) → 卖方上传 → pending_confirm → 买方确认 → completed。
 */

export const DELIVERY_STATUS = {
  pending_upload: '待卖方上传',
  pending_confirm: '等待买家收货',
  completed: '已完成',
  cancelled: '已取消'
}

export const DELIVERY_FILE_TYPES = [
  { value: 'cert', label: '版权证书' },
  { value: 'source', label: '作品源文件' },
  { value: 'doc', label: '授权文档' },
  { value: 'other', label: '其他材料' }
]

export const deliveryStatusLabel = status => DELIVERY_STATUS[status] || status || '未知'
export const deliveryFileTypeLabel = type =>
  DELIVERY_FILE_TYPES.find(item => item.value === type)?.label || type || '—'
export const deliveryStatusTone = status => ({
  pending_upload: 'warn',
  pending_confirm: 'wait',
  completed: 'ok',
  cancelled: 'off'
}[status] || 'off')

export const deliveryLicenseLabel = type => ({
  exclusive: '独家授权',
  non_exclusive: '非独家授权',
  adaptation: '改编授权'
}[type] || type || '—')

export function deliveryStatusDescription(status) {
  switch (status) {
    case 'pending_upload': return '买方已付款，等待卖方上传作品源文件等交割材料'
    case 'pending_confirm': return '卖方已提交材料，等待买方确认收货'
    case 'completed': return '买方已确认收货，交割完成'
    case 'cancelled': return '交割已取消'
    default: return ''
  }
}

/** 买方列表操作：无卖方「去交割」。 */
export function deliveryBuyerActionMeta(item) {
  if (!item) return { label: '详情', primary: false }
  if (item.status === 'pending_upload') return { label: '查看交割', primary: false }
  if (item.status === 'pending_confirm') return { label: '去确认收货', primary: true }
  return { label: '详情', primary: false }
}
