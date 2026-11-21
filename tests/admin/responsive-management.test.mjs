import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url))
const Vue = require('vue')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const checks = []
const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const edit = read('../maoyi-admin/src/views/tool/gen/editTable.vue')
const columns = [...edit.matchAll(/<el-table-column\b[^>]*min-width="([^"]+)"/g)].map(match => ({ minWidth: Number(match[1]) }))
check('all 14 field columns have finite readable pixel minima', columns.length === 14 && columns.every(column => Number.isFinite(column.minWidth) && column.minWidth >= 60))

// Exercise the installed Element Plus layout algorithm, not a duplicate formula.
// Only platform detection and DOM width are injected; rendering still needs real-page QA.
const layoutSource = read('../maoyi-admin/node_modules/element-plus/es/components/table/src/table-layout.mjs')
  .replace(/^import .*;\n/gm, '')
  .replace('export { TableLayout as default };', 'globalThis.TableLayout = TableLayout;')
const context = vm.createContext({ ref: Vue.ref, isRef: Vue.isRef, nextTick: Vue.nextTick,
  isNull: value => value === null, parseHeight: value => value,
  hasOwn: (value, key) => Object.prototype.hasOwnProperty.call(value, key),
  isString: value => typeof value === 'string', isNumber: value => typeof value === 'number', isClient: true })
vm.runInContext(layoutSource, context)
for (const width of [280, 334, 374, 728, 1240, 1880]) {
  const stateColumns = Vue.ref(columns.map(column => ({ ...column })))
  const store = { states: { columns: stateColumns, fixedColumns: Vue.ref([]), rightFixedColumns: Vue.ref([]) } }
  const table = { store, vnode: { el: { clientWidth: width } }, state: { resizeState: Vue.ref({}) } }
  const layout = new context.TableLayout({ table, store })
  layout.updateColumnsWidth()
  check(`field controls retain their minima at ${width}px content width`, stateColumns.value.every(column => column.realWidth >= column.minWidth))
  check(`horizontal scrolling matches available width ${width}px`, layout.scrollX.value === (width < 1640) && layout.bodyWidth.value === Math.max(width, 1640))
}

for (const [file, expectedResponsive] of [['basicInfoForm.vue', 4], ['genInfoForm.vue', 15], ['editTable.vue', 0]]) {
  const source = read('../maoyi-admin/src/views/tool/gen/' + file)
  const { descriptor, errors } = parse(source)
  const script = compileScript(descriptor, { id: file })
  const template = compileTemplate({ source: descriptor.template.content, id: file, compilerOptions: { bindingMetadata: script.bindings } })
  check(`${file} script/template compile`, !errors.length && !template.errors.length)
  if (expectedResponsive) {
    check(`${file} uses full-width small-screen fields and retains two desktop columns`, (source.match(/<el-col :xs="24" :sm="24" :md="12">/g) || []).length === expectedResponsive && !source.includes('<el-col :span="12">'))
  }
}
const sass = require('sass-embedded')
const css = sass.compile(path.join(root, '../maoyi-admin/src/assets/styles/ruoyi.scss')).css
check('shared normal dialogs compile with viewport cap', /\.el-dialog:not\(\.is-fullscreen\)\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/.test(css))
check('fullscreen dialogs are excluded and existing vertical positioning retained', /\.el-dialog:not\(\.is-fullscreen\)\s*\{[^}]*margin-top:\s*6vh !important/.test(css))

const panelSource = read('../maoyi-admin/src/components/TreePanel/index.vue')
const { descriptor: panelDescriptor, errors: panelErrors } = parse(panelSource)
const panelScript = compileScript(panelDescriptor, { id: 'tree-panel-responsive' })
const panelTemplate = compileTemplate({ source: panelDescriptor.template.content, id: 'tree-panel-responsive', compilerOptions: { bindingMetadata: panelScript.bindings } })
check('responsive tree panel compiles without changing template controls', !panelErrors.length && !panelTemplate.errors.length)
const panelStateSource = panelSource.slice(panelSource.indexOf('const narrowViewport ='), panelSource.indexOf('const isResizing ='))
function createPanelState(initialNarrow, defaultCollapsed = false) {
  const media = Vue.ref(initialNarrow)
  const scope = Vue.effectScope()
  const sandbox = vm.createContext({ ref: Vue.ref, watch: Vue.watch, props: { defaultCollapsed, collapsedWidth: 20, defaultWidth: 220 }, useMediaQuery: query => { assert.equal(query, '(max-width: 767px)'); return media } })
  scope.run(() => vm.runInContext(panelStateSource + '\nglobalThis.state={collapsed,sidebarWidth};', sandbox))
  return { ...sandbox.state, media, stop: () => scope.stop() }
}
const desktop = createPanelState(false)
check('desktop starts with original expanded width', !desktop.collapsed.value && desktop.sidebarWidth.value === 220)
desktop.media.value = true; await Vue.nextTick()
check('entering narrow viewport automatically collapses tree', desktop.collapsed.value)
desktop.collapsed.value = false
check('narrow tree remains manually expandable', !desktop.collapsed.value)
desktop.media.value = false; await Vue.nextTick()
check('returning desktop restores its previous expanded state', !desktop.collapsed.value)
desktop.stop()
const mobile = createPanelState(true)
check('initial narrow page starts collapsed with narrow width', mobile.collapsed.value && mobile.sidebarWidth.value === 20)
mobile.media.value = false; await Vue.nextTick()
check('initial narrow page returning desktop restores default expansion', !mobile.collapsed.value)
mobile.stop()
const preference = createPanelState(false, true)
preference.media.value = true; await Vue.nextTick(); preference.collapsed.value = false
preference.media.value = false; await Vue.nextTick()
check('manual narrow expansion does not overwrite collapsed desktop preference', preference.collapsed.value)
preference.stop()
console.log(JSON.stringify({ passed: checks.length, scope: 'Cumulative responsive checks, including actual TreePanel state across media boundaries; real browser visibility remains separate' }))
