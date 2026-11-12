import test from 'node:test'
import assert from 'node:assert/strict'

import { portalSwitchHref } from '../src/portal.js'

test('生产同域跳转到创作者端 base 路径', () => {
  assert.equal(
    portalSwitchHref({
      protocol: 'https:',
      hostname: 'www.eyhereal.site',
      port: '',
      origin: 'https://www.eyhereal.site'
    }),
    'https://www.eyhereal.site/user/'
  )
})

test('本地联调从 3002 切到创作者端 3001', () => {
  assert.equal(
    portalSwitchHref({
      protocol: 'http:',
      hostname: 'localhost',
      port: '3002',
      origin: 'http://localhost:3002'
    }),
    'http://localhost:3001/user/'
  )
})
