/** 印章模块文案与字段辅助（对齐 App seal_models / 创作者端 seal.js）。 */

export const reviewStatusLabel = status => ({ pending: '审核中', approved: '审核通过', rejected: '审核驳回' }[status] || status || '未知')
export const sealStatusLabel = status => ({ enabled: '启用', disabled: '停用', abnormal: '异常' }[status] || status || '未知')
export const operationTypeLabel = type => ({
  submit: '提交',
  review_approve: '审核通过',
  review_reject: '审核驳回',
  enable: '启用',
  disable: '停用',
  resolve_abnormal: '处理异常'
}[type] || type || '未知操作')

export const reviewTone = status => ({ pending: 'wait', approved: 'ok', rejected: 'bad' }[status] || 'off')
export const sealTone = status => ({ enabled: 'ok', disabled: 'off', abnormal: 'bad' }[status] || 'off')

export const canDisable = seal => seal?.sealStatus === 'enabled'
export const needsDisableBeforeEdit = seal => seal?.sealStatus === 'enabled'

/** 从资源地址里取出文件名（后端只存 URL，不存原始名时的兜底展示）。 */
export function fileNameFromUrl(url) {
  if (!url) return ''
  try {
    const path = String(url).split('?')[0].split('#')[0]
    const name = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || '')
    return name || ''
  } catch {
    return ''
  }
}

/** 材料列表项：{ url, name }。后端只存逗号分隔 URL。 */
export function materialItems(value) {
  if (!value) return []
  let list = []
  if (Array.isArray(value)) list = value
  else {
    try { list = JSON.parse(value) } catch { list = String(value).split(',') }
  }
  return list.map((item, index) => {
    if (item && typeof item === 'object') {
      const url = String(item.url || '').trim()
      if (!url) return null
      return { url, name: item.name || item.fileName || fileNameFromUrl(url) || `材料 ${index + 1}` }
    }
    const url = String(item || '').trim()
    if (!url) return null
    return { url, name: fileNameFromUrl(url) || `材料 ${index + 1}` }
  }).filter(Boolean)
}

export function joinMaterialUrls(items) {
  return (items || []).map(item => {
    if (item && typeof item === 'object') return String(item.url || '').trim()
    return String(item || '').trim()
  }).filter(Boolean).join(',')
}

function fileExt(value) {
  if (!value) return ''
  const clean = String(value).split('?')[0].split('#')[0].toLowerCase()
  const match = clean.match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export const isImageExt = ext => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
export const isPdfExt = ext => ext === 'pdf'
export const isTextExt = ext => ['txt', 'md', 'csv', 'json', 'log'].includes(ext)
export const materialKind = url => {
  const ext = fileExt(url)
  if (isImageExt(ext)) return 'image'
  if (isPdfExt(ext)) return 'pdf'
  if (isTextExt(ext)) return 'text'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office'
  return 'other'
}

/** 通用文件校验（扩展名 + 大小）。 */
export function validateFile(file, extensions, maxMB = 10) {
  if (!file || !extensions.includes(file.name.split('.').pop().toLowerCase())) {
    return '请选择 ' + extensions.map(e => '.' + e).join(' / ') + ' 文件'
  }
  if (!file.size) return '文件为空，请重新选择'
  if (file.size > maxMB * 1024 * 1024) return `文件不能超过 ${maxMB} MB`
  return ''
}

/**
 * 文本材料解码：兼容 UTF-8 / UTF-16 / GBK。
 */
export function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer || [])
  if (!bytes.length) return ''
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf8.includes('\uFFFD')) return utf8
  for (const encoding of ['gbk', 'gb18030']) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(bytes)
      if (text && !text.includes('\uFFFD')) return text
    } catch { /* 浏览器不支持该编码时跳过 */ }
  }
  return utf8
}
