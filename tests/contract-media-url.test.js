// 合同材料（签署 PDF 等）的鉴权链接：地址带 exp/sig 查询串。
// 回归点：mediaUrl 逐段 encode 时不能把查询串一起转义（? → %3F），否则后端签名校验不过 → 403。
import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeMediaPath, mediaUrl } from '../src/utils/enterprise.js'

const SIGNED = '/profile/upload/contract/2026/11/3f9a.pdf?exp=1763000000&sig=AbC-_def'

test('签名查询串原样保留：相对地址与已带 API 前缀的地址都一样', () => {
  assert.equal(mediaUrl(SIGNED), '/dev-api' + SIGNED)
  assert.equal(mediaUrl('/dev-api' + SIGNED), '/dev-api' + SIGNED)
  assert.equal(mediaUrl(SIGNED, '/prod-api'), '/prod-api' + SIGNED)
})

test('路径段仍按原口径 encode，中文文件名不受影响', () => {
  assert.equal(
    mediaUrl('/profile/upload/contract/2026/11/合同 终版.pdf?exp=1&sig=a-b_c'),
    '/dev-api/profile/upload/contract/2026/11/' + encodeURIComponent('合同 终版.pdf') + '?exp=1&sig=a-b_c'
  )
  assert.equal(encodeMediaPath('/a/中文.pdf?x=1&y=2'), '/a/%E4%B8%AD%E6%96%87.pdf?x=1&y=2')
  assert.equal(encodeMediaPath('/a/b.pdf'), '/a/b.pdf')
})
