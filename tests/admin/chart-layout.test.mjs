import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url))
const echarts = require('echarts')
const source = fs.readFileSync(new URL('../../../maoyi-admin/src/views/monitor/cache/index.vue', import.meta.url), 'utf8')
const sandbox = vm.createContext({})
vm.runInContext(source.slice(source.indexOf('function memoryTextLayout('), source.indexOf('onMounted(')) + '\nglobalThis.layout = memoryTextLayout', sandbox)
let passed = 0
function check(condition, message) { assert.ok(condition, message); passed++ }
function textBounds(chart) {
  return chart.getZr().storage.getDisplayList(true).filter(item => item.type === 'tspan').map(item => {
    const rect = item.getBoundingRect().clone()
    if (item.transform) rect.applyTransform(item.transform)
    return { text: item.style.text, rect }
  })
}
function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 287, height: 450 })
try {
  chart.setOption({ animation: false, series: [{ type: 'gauge', min: 0, max: 1000, detail: { formatter: '1.18M' }, data: [{ value: 1.18, name: '内存消耗' }] }] })
  const before = textBounds(chart)
  check(overlaps(before.find(x => x.text === '1.18M').rect, before.find(x => x.text === '1000').rect), 'original 287px gauge reproduces value/1000 overlap')
  for (const width of [232, 287, 327, 359, 360, 479, 480, 544]) {
    for (const value of ['1.18M', '999.99M']) {
      chart.resize({ width, height: 450 })
      const layout = sandbox.layout(width)
      chart.setOption({ series: [{ ...layout, detail: { ...layout.detail, formatter: value } }] })
      const elements = textBounds(chart)
      const detail = elements.find(item => item.text === value)
      const title = elements.find(item => item.text === '内存消耗')
      const labels = elements.filter(item => /^\d+$/.test(item.text))
      check(labels.length === 11 && labels.every(label => !overlaps(detail.rect, label.rect) && !overlaps(title.rect, label.rect)), `${width}px ${value}: title/value stay clear of every tick label`)
      check(!overlaps(detail.rect, title.rect), `${width}px ${value}: title and value remain separate`)
      check([detail, title].every(({ rect }) => rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= 450), `${width}px ${value}: text remains in the actual chart bounds`)
    }
  }
  check(JSON.stringify(sandbox.layout(544)) === JSON.stringify({ title: { offsetCenter: [0, '20%'], fontSize: 16 }, detail: { offsetCenter: [0, '40%'], fontSize: 30, lineHeight: 30 } }), 'desktop restores original ECharts title/value positions and font sizes')
} finally { chart.dispose() }
console.log(JSON.stringify({ passed, scope: 'Installed ECharts SVG renderer geometry at mobile/desktop widths; auxiliary to fixed-release real UI screenshots' }))
