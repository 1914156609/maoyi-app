import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const root = new URL('../../../maoyi-admin/src/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
function loadModule(file, deps = {}, globals = {}) {
  const source = read(file).replaceAll("import.meta.glob('./../../views/**/*.vue')", '{}').replaceAll('import.meta.env.VITE_APP_BASE_API', "'/prod-api'");
  const module = { exports: {} };
  const code = transformSync(source, { format: 'cjs' }).code;
  Function('module', 'exports', 'require', ...Object.keys(globals), code)(module, module.exports, name => deps[name], ...Object.values(globals));
  return module.exports;
}
function loadStore(file, deps = {}, globals = {}) {
  const defineStore = (id, options) => () => {
    const state = options.state();
    for (const [key, action] of Object.entries(options.actions)) state[key] = action.bind(state);
    return state;
  };
  return loadModule('store/modules/' + file + '.js', deps, { defineStore, ...globals }).default();
}
function component(file, props = {}, deps = {}, overrides = {}) {
  const { descriptor, errors } = parse(read(file));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  const module = { exports: {} };
  const code = transformSync(script.content.replaceAll('import.meta.env.VITE_APP_BASE_API', "'/prod-api'"), { format: 'cjs' }).code;
  const emitted = [], messages = [];
  const hooks = [];
  const lifecycle = { activated: [], deactivated: [], unmounted: [] };
  const latestRequests = loadModule('utils/useLatestRequest.js', { vue: { ...Vue, onActivated: fn => lifecycle.activated.push(fn), onDeactivated: fn => lifecycle.deactivated.push(fn), onBeforeUnmount: fn => lifecycle.unmounted.push(fn) } });
  const proxy = { addDateRange: v => v, resetForm() {}, $modal: { msgError: msg => messages.push(msg), msgSuccess: msg => messages.push(msg), loading() {}, closeLoading() {} }, $refs: {} };
  const env = { ...Vue, getCurrentInstance: () => ({ proxy }), useDict: () => ({ sys_user_sex: Vue.ref([]) }), selectDictLabel: () => '', onMounted() {}, onBeforeUnmount: fn => hooks.push(fn), ...overrides };
  Function('module', 'exports', 'require', ...Object.keys(env), code)(module, module.exports, name => name === 'vue' ? Vue : name === '@/utils/useLatestRequest' ? latestRequests : deps[name], ...Object.values(env));
  const state = module.exports.default.setup(props, { expose() {}, emit: (...args) => emitted.push(args) });
  return { state, emitted, messages, proxy, hooks, lifecycle };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('menu request failure rejects promptly and a later successful retry builds routes', async () => {
  let fail = true;
  const router = { addRoute() {} };
  const store = loadStore('permission', {
    '@/plugins/auth': { hasPermiOr: () => true, hasRoleOr: () => true },
    '@/router': { default: router, constantRoutes: [], dynamicRoutes: [] },
    '@/api/menu': { getRouters: () => fail ? Promise.reject(new Error('menu unavailable')) : Promise.resolve({ data: [{ path: '/test', component: 'Layout' }] }) },
    '@/layout/index': {}, '@/components/ParentView': {}, '@/layout/components/InnerLink': {}
  });
  const result = await Promise.race([store.generateRoutes().then(() => 'resolved', err => err.message), new Promise(r => setTimeout(() => r('pending'), 50))]);
  assert.equal(result, 'menu unavailable');
  fail = false;
  const routes = await store.generateRoutes();
  assert.equal(routes[0].path, '/test');
  assert.equal(store.sidebarRouters[0].path, '/test');
});

test('fresh user info clears previously granted permissions when the role set is empty', async () => {
  const store = loadStore('user', {
    '@/router': { push() {} }, '@/plugins/cache': { session: { set() {} } },
    'element-plus': { ElMessageBox: {} },
    '@/api/login': { getInfo: async () => ({ user: { userId: 7, userName: 'employee' }, roles: [], permissions: [] }) },
    '@/utils/auth': { getToken: () => 'old-token' },
    '@/utils/validate': { isHttp: () => false, isEmpty: v => !v },
    '@/store/modules/lock': () => ({}), '@/assets/images/profile.jpg': 'fallback'
  });
  store.permissions = ['*:*:*'];
  await store.getInfo();
  assert.deepEqual(store.permissions, []);
  assert.deepEqual(store.roles, ['ROLE_DEFAULT']);
});

test('dictionary cache replaces a refreshed entry and refuses missing keys', () => {
  const store = loadStore('dict');
  store.setDict('status', [{ value: 'old' }]);
  store.setDict('status', [{ value: 'new' }]);
  store.setDict(undefined, ['invalid']);
  assert.equal(store.dict.length, 1);
  assert.equal(store.getDict('status')[0].value, 'new');
  assert.equal(store.getDict(''), null);
});

test('closing tags outside the list settles and never deletes an unrelated iframe', async () => {
  const store = loadStore('tagsView', { '@/plugins/cache': { local: { setJSON() {}, remove() {} } }, '@/store/modules/settings': () => ({ tagsViewPersist: true }) });
  store.visitedViews = [{ path: '/a', name: 'A', meta: {} }, { path: '/b', name: 'B', meta: { link: true } }];
  store.iframeViews = [{ path: '/unrelated' }];
  const result = await Promise.race([store.delRightTags({ path: '/missing' }), new Promise(r => setTimeout(() => r('pending'), 50))]);
  assert.notEqual(result, 'pending');
  await store.delRightTags({ path: '/a' });
  assert.equal(store.iframeViews[0].path, '/unrelated');
});

test('corrupt layout and lock JSON no longer abort the application stores', () => {
  const storage = { getItem: () => '{broken', setItem() {} };
  const cache = loadModule('plugins/cache.js', {}, { localStorage: storage, sessionStorage: storage }).default;
  assert.equal(cache.local.getJSON('layout-setting'), null);
  assert.equal(cache.session.getJSON('sessionObj'), null);
  assert.equal(loadStore('lock', {}, { localStorage: storage }).isLock, false);
});

test('user details discard late requests, clear stale fields on failures and ignore closed dialogs', async () => {
  const requests = new Map();
  const { state: s } = component('views/system/user/view.vue', {}, { '@/api/system/user': { getUser: id => { const r = deferred(); requests.set(id, r); return r.promise; } } });
  const first = s.open(1), second = s.open(2);
  requests.get(2).resolve({ data: { userId: 2, userName: 'second' }, posts: [], roles: [] });
  await second;
  requests.get(1).resolve({ data: { userId: 1, userName: 'late first' } });
  await first;
  assert.equal(s.info.userId, 2);
  const failed = s.open(3);
  assert.equal(s.info.userId, undefined);
  requests.get(3).reject(new Error('server unavailable'));
  await failed;
  assert.deepEqual(Object.keys(s.info), []);
  assert.equal(s.loading.value, false);
  const closed = s.open(4);
  s.handleClose();
  requests.get(4).resolve({ data: { userId: 4 } });
  await closed;
  assert.equal(s.visible.value, false);
  assert.equal(s.info.userId, undefined);
});

test('profile save synchronizes nickname, contact and gender with both form parent and Store', async () => {
  const user = { nickName: 'before', phonenumber: '13800000000', email: 'before@example.com', sex: '0' };
  const store = { nickName: 'before' };
  const c = component('views/system/user/profile/userInfo.vue', { user }, { '@/api/system/user': { updateUserProfile: async () => ({ code: 200 }) }, '@/store/modules/user': () => store });
  c.proxy.$refs.userRef = { validate: cb => cb(true) };
  c.state.form.value = { nickName: 'after', phonenumber: '13900000000', email: 'after@example.com', sex: '1' };
  c.state.submit();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(user.nickName, 'after');
  assert.equal(user.sex, '1');
  assert.equal(store.nickName, 'after');
  const pattern = c.state.rules.value.phonenumber[1].pattern;
  assert.equal(pattern.test('1|123456789'), false);
  assert.equal(pattern.test('13900000000'), true);
});

for (const name of ['ImageUpload', 'FileUpload']) {
  test(name + ' emits successful files even when a simultaneous upload fails, then permits retry', () => {
    const props = { modelValue: '', fileType: name === 'ImageUpload' ? ['png', 'jpg', 'jpeg'] : ['pdf'], fileSize: 5, action: '/common/upload', limit: 5 };
    const c = component('components/' + name + '/index.vue', props, { '@/utils/auth': { getToken: () => 'test-token' }, '@/utils/validate': { isExternal: v => /^(https?:|blob:)/.test(v) }, sortablejs: {} });
    const s = c.state;
    const ext = name === 'ImageUpload' ? 'PNG' : 'PDF', type = name === 'ImageUpload' ? 'image/png' : 'application/pdf';
    assert.notEqual(s.handleBeforeUpload({ name: 'a.' + ext, type, size: 100 }), false);
    assert.notEqual(s.handleBeforeUpload({ name: 'b.' + ext, type, size: 100 }), false);
    s.handleUploadSuccess({ code: 200, fileName: '/profile/a.' + ext.toLowerCase() }, {});
    s.handleUploadError();
    assert.equal(c.emitted.at(-1)[1], '/profile/a.' + ext.toLowerCase());
    assert.equal(s.number.value, 0);
    s.handleBeforeUpload({ name: 'retry.' + ext, type, size: 100 });
    s.handleUploadSuccess({ code: 200, fileName: '/profile/retry.' + ext.toLowerCase() }, {});
    assert.ok(c.emitted.at(-1)[1].includes('/profile/retry.'));
    if (name === 'FileUpload') {
      assert.equal(s.fileUrl('https://example.com/a.pdf'), 'https://example.com/a.pdf');
      assert.equal(s.fileUrl('/prod-api/profile/a.pdf'), '/prod-api/profile/a.pdf');
      assert.equal(s.fileUrl('/profile/a.pdf'), '/prod-api/profile/a.pdf');
    }
  });
}

test('password rules read the current policy after asynchronous getInfo initialized the session', () => {
  let policy = null;
  const rules = loadModule('utils/passwordRule.js', { '@/plugins/cache': { session: { get: () => policy } } }, { ref: Vue.ref, computed: Vue.computed });
  policy = '3';
  const current = rules.usePasswordRule();
  assert.equal(current.pwdValidator.value[2].pattern.test('abcdef'), false);
  assert.equal(current.pwdValidator.value[2].pattern.test('abc123'), true);
});

test('Excel import network/application failures retain a usable dialog and a successful import is text only', async () => {
  const c = component('components/ExcelImportDialog/index.vue', { action: '/system/user/importData' }, { '@/utils/auth': { getToken: () => 'test-token' } });
  let submits = 0, cleared = 0, alerts = [];
  const s = c.state;
  s.uploadRef.value = { submit() { submits++; }, clearFiles() { cleared++; } };
  c.proxy.$alert = (...args) => alerts.push(args);
  s.visible.value = true;
  s.handleFileChange({ name: 'batch.xlsx' });
  s.handleSubmit(); s.handleSubmit();
  assert.equal(submits, 1);
  assert.equal(s.isUploading.value, true);
  s.handleError(new Error('network unavailable'));
  assert.equal(s.isUploading.value, false);
  assert.equal(s.visible.value, true);
  assert.equal(s.selectedFile.value, null);
  s.handleFileChange({ name: 'retry.xlsx' });
  s.handleSubmit();
  s.handleSuccess({ code: 500, msg: 'invalid row' });
  assert.equal(s.visible.value, true);
  assert.equal(c.emitted.length, 0);
  s.handleFileChange({ name: 'final.xlsx' });
  s.handleSubmit();
  s.handleSuccess({ code: 200, msg: 'imported<br/><img src=x onerror=alert(1)>' });
  assert.equal(s.visible.value, false);
  assert.equal(c.emitted[0][0], 'success');
  assert.equal(alerts[0][0], 'imported\n<img src=x onerror=alert(1)>');
  assert.equal(alerts[0][2]?.dangerouslyUseHTMLString, undefined);
  assert.ok(cleared >= 3);
});

test('pasted editor images enforce size/type, recover failed requests and insert without a saved cursor', async () => {
  let posts = 0, fail = true, embedded;
  const c = component('components/Editor/index.vue', { type: 'url', fileSize: 5, readOnly: false }, {
    axios: { post: async () => { posts++; if (fail) throw new Error('unavailable'); return { data: { code: 200, fileName: '/profile/image.png' } }; } },
    '@vueup/vue-quill': { QuillEditor: {} }, '@vueup/vue-quill/dist/vue-quill.snow.css': {},
    '@/utils/auth': { getToken: () => 'test-token' }
  }, { document: { body: {} } });
  const s = c.state;
  s.quillEditorRef.value = { getQuill: () => ({ getSelection: () => null, selection: null, getLength: () => 1, insertEmbed: (...args) => { embedded = args; }, setSelection() {} }) };
  s.insertImage({ type: 'text/plain', size: 3 });
  assert.equal(posts, 0);
  s.insertImage({ type: 'image/png', size: 6 * 1024 * 1024 });
  assert.equal(posts, 0);
  s.insertImage(new File(['image'], 'image.png', { type: 'image/png' }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(c.messages.at(-1), '图片插入失败');
  fail = false;
  s.insertImage(new File(['image'], 'image.png', { type: 'image/png' }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(embedded, [0, 'image', '/prod-api/profile/image.png']);
});

test('offline logout removes local credentials and all prior identity state so navigation can complete', async () => {
  let removed = false, unlocked = false;
  const store = loadStore('user', {
    '@/router': { push() {} }, '@/plugins/cache': { session: { remove() {} } }, 'element-plus': { ElMessageBox: {} },
    '@/api/login': { logout: async () => { throw new Error('offline'); } },
    '@/utils/auth': { getToken: () => 'old-token', removeToken: () => { removed = true; } },
    '@/utils/validate': {}, '@/store/modules/lock': () => ({ unlockScreen: () => { unlocked = true; } }), '@/assets/images/profile.jpg': 'fallback'
  });
  store.id = 7; store.nickName = 'old identity'; store.permissions = ['*:*:*']; store.roles = ['admin'];
  await store.logOut();
  assert.ok(removed && unlocked);
  assert.equal(store.token, '');
  assert.equal(store.id, '');
  assert.equal(store.nickName, '');
  assert.deepEqual(store.permissions, []);
});

test('role menu and data scope dependency failures cannot submit partial authorizations', async () => {
  let menusFail = true, deptsFail = true, updates = 0;
  const api = {
    listRole: async () => ({ rows: [], total: 0 }),
    getRole: async id => ({ data: { roleId: id, roleName: 'qa role', roleSort: 1 } }),
    deptTreeSelect: async () => { if (deptsFail) throw new Error('depts unavailable'); return { depts: [], checkedKeys: [2] }; },
    updateRole: async () => { updates++; }, dataScope: async () => { updates++; }
  };
  const c = component('views/system/role/index.vue', {}, { '@/api/system/role': api, '@/api/system/menu': {
    roleMenuTreeselect: async () => { if (menusFail) throw new Error('menus unavailable'); return { menus: [], checkedKeys: [1] }; },
    treeselect: async () => ({ data: [] })
  } }, { useDict: () => ({ sys_normal_disable: Vue.ref([]) }), useRouter: () => ({ push() {} }), onActivated() {}, onDeactivated() {} });
  c.proxy.addDateRange = v => v;
  c.proxy.resetForm = () => {};
  c.proxy.$refs.roleRef = { validate: cb => cb(true) };
  const s = c.state;
  s.menuRef.value = { setCheckedKeys() {}, setChecked() {}, getCheckedKeys: () => [1], getHalfCheckedKeys: () => [] };
  s.deptRef.value = { setCheckedKeys() {}, getCheckedKeys: () => [2], getHalfCheckedKeys: () => [] };
  await s.handleUpdate({ roleId: 6 });
  assert.equal(s.open.value, false);
  s.submitForm();
  assert.equal(updates, 0);
  menusFail = false;
  await s.handleUpdate({ roleId: 6 });
  assert.equal(s.open.value, true);
  assert.equal(s.menuLoaded.value, true);
  await s.handleDataScope({ roleId: 6 });
  assert.equal(s.openDataScope.value, false);
  s.submitDataScope();
  assert.equal(updates, 0);
  deptsFail = false;
  await s.handleDataScope({ roleId: 6 });
  assert.equal(s.openDataScope.value, true);
  assert.equal(s.deptsLoaded.value, true);
});

for (const fixture of [
  { file: 'system/user/index.vue', api: '@/api/system/user', method: 'listUser', rows: 'userList', query: 'userName', response: rows => ({ rows, total: rows.length }), extra: { '@/utils/passwordRule': { usePasswordRule: () => ({}) } } },
  { file: 'system/role/index.vue', api: '@/api/system/role', method: 'listRole', rows: 'roleList', query: 'roleName', response: rows => ({ rows, total: rows.length }) },
  { file: 'system/dept/index.vue', api: '@/api/system/dept', method: 'listDept', rows: 'deptList', query: 'deptName', response: data => ({ data }) },
  { file: 'monitor/logininfor/index.vue', api: '@/api/monitor/logininfor', method: 'list', rows: 'logininforList', query: 'userName', response: rows => ({ rows, total: rows.length }) }
]) test(fixture.file + ' keeps latest search, suppresses obsolete errors and invalidates reads when leaving', async () => {
  const pending = [];
  const c = component('views/' + fixture.file, {}, {
    ...fixture.extra,
    [fixture.api]: { deptTreeSelect: async () => ({ data: [] }), [fixture.method]: (query, signal) => { const r = deferred(); pending.push({ ...r, signal }); return r.promise; } }
  }, { useRouter: () => ({ push() {} }), useDict: () => ({ sys_normal_disable: Vue.ref([]), sys_user_sex: Vue.ref([]), sys_common_status: Vue.ref([]) }), onActivated() {}, onDeactivated() {} });
  c.proxy.handleTree = value => value;
  // Some stock pages immediately read on setup. It is replaced by the explicit searches below.
  const s = c.state;
  s.queryParams.value[fixture.query] = 'first';
  const first = s.getList(), firstRequest = pending.at(-1);
  s.queryParams.value[fixture.query] = 'latest';
  const second = s.getList(), secondRequest = pending.at(-1);
  assert.equal(firstRequest.signal.aborted, true);
  secondRequest.resolve(fixture.response([{ deptId: 2, id: 'newest' }])); await second;
  firstRequest.resolve(fixture.response([{ deptId: 1, id: 'obsolete' }])); await first;
  assert.equal(s[fixture.rows].value[0].id, 'newest');
  const failed = s.getList(), failedRequest = pending.at(-1);
  const fresh = s.getList(), freshRequest = pending.at(-1);
  freshRequest.resolve(fixture.response([{ deptId: 3, id: 'fresh' }])); await fresh;
  failedRequest.reject(new Error('obsolete failure')); await failed;
  assert.equal(s[fixture.rows].value[0].id, 'fresh');
  const leaving = s.getList(), leavingRequest = pending.at(-1);
  c.lifecycle.deactivated.forEach(fn => fn());
  assert.equal(leavingRequest.signal.aborted, true);
  leavingRequest.resolve(fixture.response([{ deptId: 4, id: 'after leave' }])); await leaving;
  assert.equal(s[fixture.rows].value[0].id, 'fresh');
  assert.equal(s.loading.value, false);
  const count = pending.length;
  await s.getList();
  assert.equal(pending.length, count);
  c.lifecycle.activated.forEach(fn => fn());
  assert.equal(pending.length, count + 1);
  pending.at(-1).resolve(fixture.response([{ deptId: 5, id: 'resumed' }]));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(s[fixture.rows].value[0].id, 'resumed');
});

test('department edits wait for the eligible-parent tree and obsolete targets cannot reopen the form', async () => {
  const parents = new Map(), details = new Map();
  const c = component('views/system/dept/index.vue', {}, { '@/api/system/dept': {
    listDept: async () => ({ data: [] }),
    listDeptExcludeChild: (id, signal) => { const r = deferred(); parents.set(id, { ...r, signal }); return r.promise; },
    getDept: (id, signal) => { const r = deferred(); details.set(id, { ...r, signal }); return r.promise; }
  } }, { useDict: () => ({ sys_normal_disable: Vue.ref([]) }) });
  c.proxy.handleTree = value => value;
  const s = c.state, a = s.handleUpdate({ deptId: 1 }), b = s.handleUpdate({ deptId: 2 });
  assert.equal(parents.get(1).signal.aborted, true);
  details.get(2).resolve({ data: { deptId: 2, deptName: 'latest' } });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(s.open.value, false);
  parents.get(2).resolve({ data: [{ deptId: 100 }] }); await b;
  assert.equal(s.form.value.deptId, 2);
  parents.get(1).resolve({ data: [] }); details.get(1).resolve({ data: { deptId: 1 } }); await a;
  assert.equal(s.form.value.deptId, 2);
  s.cancel();
  const failed = s.handleUpdate({ deptId: 3 });
  parents.get(3).reject(new Error('tree unavailable')); details.get(3).resolve({ data: { deptId: 3 } }); await failed;
  assert.equal(s.open.value, false);
});

test('dictionary drawer loads entries past its first hundred and drops results after closing', async () => {
  const pending = [];
  const props = Vue.reactive({ visible: true, row: { dictType: 'qa_large' } });
  const c = component('views/system/dict/detail.vue', props, { '@/api/system/dict/data': { listData: (query, signal) => { const r = deferred(); pending.push({ ...r, query, signal }); return r.promise; } } });
  const s = c.state, read = s.loadData();
  pending[0].resolve({ rows: Array.from({ length: 100 }, (_, i) => ({ dictCode: i + 1, status: '0' })), total: 101 });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(pending[1].query.pageNum, 2);
  pending[1].resolve({ rows: [{ dictCode: 101, status: '1' }], total: 101 }); await read;
  assert.equal(s.dataList.value.length, 101);
  assert.equal(s.disabledCount.value, 1);
  const closing = s.loadData(), request = pending.at(-1);
  props.visible = false; await Vue.nextTick();
  assert.equal(request.signal.aborted, true);
  request.resolve({ rows: [{ dictCode: 999 }], total: 1 }); await closing;
  assert.equal(s.dataList.value.length, 0);
});

test('notice read failures keep unread rows and counts, successful batches use server readback', async () => {
  let fail = true;
  const c = component('layout/components/HeaderNotice/index.vue', {}, { '@/api/system/notice': {
    markNoticeRead: async () => { if (fail) throw new Error('write failed'); },
    markNoticeReadAll: async () => { if (fail) throw new Error('batch failed'); },
    listNoticeTop: async () => ({ data: [{ noticeId: 1, isRead: true }], unreadCount: 3 })
  } });
  const s = c.state;
  s.noticeList.value = [{ noticeId: 1, isRead: false }]; s.unreadCount.value = 4;
  await s.markOneRead(s.noticeList.value[0]);
  assert.equal(s.noticeList.value[0].isRead, false);
  assert.equal(s.unreadCount.value, 4);
  await s.markAllRead();
  assert.equal(s.noticeList.value[0].isRead, false);
  assert.equal(s.unreadCount.value, 4);
  fail = false;
  await s.markAllRead();
  assert.equal(s.noticeList.value[0].isRead, true);
  assert.equal(s.unreadCount.value, 3);
});

test('notice detail protects a newly opened notice and clears loading for supplied content', async () => {
  const pending = new Map();
  const c = component('layout/components/HeaderNotice/DetailView.vue', {}, { '@/api/system/notice': {
    getNotice: (id, signal) => { const r = deferred(); pending.set(id, { ...r, signal }); return r.promise; }
  } });
  const s = c.state, old = s.open(1), current = s.open(2);
  pending.get(2).resolve({ data: { noticeId: 2, noticeTitle: 'current' } }); await current;
  pending.get(1).resolve({ data: { noticeId: 1, noticeTitle: 'old' } }); await old;
  assert.equal(s.detail.value.noticeId, 2);
  const delayed = s.open(3);
  s.open({ noticeId: 4, noticeContent: '<p>preset</p>' });
  assert.equal(s.loading.value, false);
  assert.equal(pending.get(3).signal.aborted, true);
  pending.get(3).resolve({ data: { noticeId: 3 } }); await delayed;
  assert.equal(s.detail.value.noticeId, 4);
});

test('image preview and serialization preserve external URLs containing the API path and normalize relative images once', () => {
  const external = 'https://images.example.com/gallery/prod-api/photo.png';
  const relative = '/profile/photo.png';
  const prefixed = '/prod-api/profile/already-prefixed.png';
  const props = { modelValue: [external, relative, prefixed], fileType: ['png'], fileSize: 5, action: '/common/upload', limit: 5 };
  const c = component('components/ImageUpload/index.vue', props, { '@/utils/auth': { getToken: () => 'test-token' }, '@/utils/validate': { isExternal: v => /^(https?:|blob:)/.test(v) }, sortablejs: {} });
  const s = c.state;
  assert.equal(s.fileList.value[0].url, external);
  assert.equal(s.fileList.value[1].url, '/prod-api/profile/photo.png');
  assert.equal(s.fileList.value[2].url, prefixed);
  assert.equal(s.listToString(s.fileList.value), external + ',' + relative + ',/profile/already-prefixed.png');
  assert.equal(s.listToString([{ url: external }, { url: 'https://prod-api.example.com/prod-api/path.png' }]), external + ',https://prod-api.example.com/prod-api/path.png');
});

for (const name of ['ImageUpload', 'FileUpload', 'Editor']) test(name + ' accepts its stated exact 5MiB maximum and rejects one additional byte', () => {
  const isEditor = name === 'Editor';
  const c = component('components/' + name + '/index.vue', { modelValue: '', fileType: ['png'], fileSize: 5, action: '/common/upload', limit: 5, type: 'url' }, {
    '@/utils/auth': { getToken: () => 'test-token' }, '@/utils/validate': { isExternal: () => false }, sortablejs: {},
    axios: {}, '@vueup/vue-quill': { QuillEditor: {} }, '@vueup/vue-quill/dist/vue-quill.snow.css': {}
  }, isEditor ? { document: { body: {} } } : {});
  const exact = c.state.handleBeforeUpload({ name: 'exact.png', type: 'image/png', size: 5 * 1024 * 1024 });
  assert.notEqual(exact, false);
  const above = c.state.handleBeforeUpload({ name: 'above.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 });
  assert.equal(above, false);
  assert.match(c.messages.at(-1), /不能超过 5 MB/);
});

test('user drawer renders persistent retry instead of invented profile fields while loading or after failures', async () => {
  const file = 'views/system/user/view.vue';
  const pending = [];
  const c = component(file, {}, { '@/api/system/user': { getUser: id => { const r = deferred(); pending.push({ ...r, id }); return r.promise; } } });
  const { descriptor } = parse(read(file));
  const script = compileScript(descriptor, { id: file });
  const compiled = compileTemplate({ source: descriptor.template.content, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  const module = { exports: {} };
  Function('module', 'exports', 'require', transformSync(compiled.code, { format: 'cjs' }).code)(module, module.exports, name => name === 'vue' ? Vue : require(name));
  const render = async () => {
    const app = Vue.createSSRApp({ setup: () => c.state, render: module.exports.render });
    for (const name of ['el-drawer', 'el-row', 'el-col', 'el-tag', 'el-alert', 'el-button']) app.component(name, { setup: (_props, { slots }) => () => Vue.h('div', [slots.title?.(), slots.default?.()]) });
    app.directive('loading', {});
    app.config.warnHandler = () => {};
    return require('@vue/server-renderer').renderToString(app);
  };
  const s = c.state;
  const first = s.open(103);
  assert.equal(s.loading.value, true);
  let html = await render();
  assert.doesNotMatch(html, /用户状态|停用|无岗位|无角色/);
  pending.at(-1).resolve({ data: { userId: 103, nickName: 'FIRST_CONFIRMED_PERSON', status: '0' }, posts: [], roles: [], postIds: [], roleIds: [] });
  await first;
  html = await render();
  assert.match(html, /FIRST_CONFIRMED_PERSON/);
  assert.match(html, /用户状态/);
  const failed = s.open(104);
  html = await render();
  assert.doesNotMatch(html, /FIRST_CONFIRMED_PERSON|用户状态|停用|无岗位|无角色/);
  pending.at(-1).reject(new Error('HTTP500'));
  await failed;
  html = await render();
  assert.match(html, /用户详情加载失败，请重新加载。/);
  assert.match(html, /重新加载/);
  assert.doesNotMatch(html, /FIRST_CONFIRMED_PERSON|用户状态|停用|无岗位|无角色/);
  const retry = s.retry();
  assert.equal(pending.at(-1).id, 104);
  assert.equal(s.loadError.value, '');
  pending.at(-1).resolve({ data: { userId: 104, nickName: 'RETRIED_PERSON', status: '1' }, posts: [], roles: [], postIds: [], roleIds: [] });
  await retry;
  html = await render();
  assert.match(html, /RETRIED_PERSON/);
  assert.match(html, /停用/);
  assert.doesNotMatch(html, /用户详情加载失败/);
  const malformed = s.open(105);
  pending.at(-1).resolve({ data: null });
  await malformed;
  assert.equal(s.loaded.value, false);
  assert.match(await render(), /用户详情加载失败/);
  s.handleClose();
  assert.equal(s.loadError.value, '');
  assert.equal(s.selectedUserId.value, null);
  assert.equal(s.visible.value, false);
});
