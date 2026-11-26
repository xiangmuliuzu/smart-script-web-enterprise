import { getToken } from '../auth.js'
export function requireLogin(router, feature, redirect) {
  if (getToken()) return Promise.resolve(true)
  return import('element-plus')
    .then(({ ElMessageBox }) =>
      ElMessageBox.confirm(`${feature}需要登录后使用，是否前往登录？`, '请先登录', {
        confirmButtonText: '去登录',
        cancelButtonText: '稍后再说',
        type: 'info',
        closeOnClickModal: false
      })
    )
    .then(() => {
      router.push({ path: '/login', query: { redirect } })
      return false
    })
    .catch(() => false)
}
// 输入使用元，App 交易接口使用分，避免浮点乘法产生精度误差。
export function budgetToFen(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error('预算请输入有效金额，最多两位小数')
  const [yuan, cents = ''] = value.split('.')
  const fen = Number(yuan) * 100 + Number(cents.padEnd(2, '0'))
  if (fen <= 0) throw new Error('预算需大于 0，不确定时可以留空')
  return fen
}
export function inquiryPayload(workId, form, copyrighted) {
  const intendedUse = String(form.intendedUse || '').trim()
  if (!intendedUse) throw new Error('请填写预期用途')
  if (copyrighted && !['exclusive', 'non_exclusive', 'adaptation'].includes(form.licenseType))
    throw new Error('请选择授权类型')
  return {
    workId,
    intendedUse,
    licenseType: copyrighted ? form.licenseType : null,
    budget: budgetToFen(form.budget),
    message: String(form.message || '').trim() || null
  }
}

// App 内容对象以 tags 下发题材，兼容旧对象的 genreName。
export function workGenre(work) {
  return (
    work.genreName ||
    work.tags
      ?.map((tag) => tag.tagName || tag.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ') ||
    '原创剧本'
  )
}

// 推荐区展示首页热门精选前20部；显式搜索继续使用普通作品列表。
export function marketWorksQuery({ keyword = '', sort = '', page = 1, pageSize = 12 } = {}) {
  if (!keyword) return { recommendStatus: 'home_hot', page: 1, pageSize: 20 }
  return { keyword, sort: sort || undefined, page, pageSize }
}
export function recommendedWorks(works, { sort } = {}) {
  const selected = works.slice(0, 20)
  if (sort === 'latest')
    selected.sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || '')))
  return selected
}
