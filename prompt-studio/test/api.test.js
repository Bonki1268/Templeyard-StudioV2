const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用暫存資料夾的複本測試，不動到真正的 prompts/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
for (const f of fs.readdirSync(path.join(__dirname, '..', 'prompts')).filter(f => f.endsWith('.json'))) {
  fs.copyFileSync(path.join(__dirname, '..', 'prompts', f), path.join(tmp, f));
}
process.env.PROMPT_DIR = tmp;
const { server } = require('../server');
const { validate } = require('../lib/prompt');

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('十一個節點的 prompt 檔都通過驗證', () => {
  const files = fs.readdirSync(tmp).filter(f => f.endsWith('.json'));
  assert.equal(files.length, 11);
  for (const f of files) assert.deepEqual(validate(JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'))), [], f);
});

test('列出 prompt，依步驟排序', async () => {
  const { status, body } = await call('GET', '/api/prompts');
  assert.equal(status, 200);
  assert.deepEqual(body.prompts.map(p => p.step), [1, 2, 4, 5, 5, 5, 5, 5, 6, 6, 6]);
});

test('組裝：帶入巢狀變數並產生 JavaScript', async () => {
  const vars = { temple: { name: '鄞山寺', district: '淡水區' }, series: { style: '寫實', duration: 15 }, story: '渡海來台的故事' };
  const { status, body } = await call('POST', '/api/prompts/story-script/render', { variables: vars });
  assert.equal(status, 200);
  const content = body.request.messages[0].content;
  assert.match(content, /鄞山寺（淡水區/);
  assert.match(content, /15 秒/);
  assert.doesNotMatch(content, /\{\{/);
  assert.equal(body.request.output.format, 'json');
  assert.match(body.compiled, /export function build/);
});

test('組裝：缺少必要變數時拒絕', async () => {
  const { status, body } = await call('POST', '/api/prompts/story-script/render', { variables: {} });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'missing_variables');
  assert.ok(body.error.missing.includes('story'));
});

test('儲存：寫入檔案、版本加一、保留歷史版本', async () => {
  const { body: { prompt } } = await call('GET', '/api/prompts/shot-video');
  const edited = { ...prompt, template: prompt.template + '\n補充：{{shot.cameraMove}}' };
  const { status, body } = await call('PUT', '/api/prompts/shot-video', { prompt: edited, expectedVersion: prompt.version });
  assert.equal(status, 200);
  assert.equal(body.prompt.version, prompt.version + 1);
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'shot-video.json'), 'utf8'));
  assert.match(onDisk.template, /補充：/);
  const hist = await call('GET', '/api/prompts/shot-video/history');
  assert.equal(hist.body.versions[0].version, prompt.version);
  const old = await call('GET', `/api/prompts/shot-video/history/${prompt.version}`);
  assert.doesNotMatch(old.body.prompt.template, /補充：/);
});

test('儲存：版本不符時回 409，不覆蓋檔案', async () => {
  const { body: { prompt } } = await call('GET', '/api/prompts/copy-polish');
  const { status } = await call('PUT', '/api/prompts/copy-polish', { prompt: { ...prompt, name: 'X' }, expectedVersion: prompt.version - 1 });
  assert.equal(status, 409);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'copy-polish.json'), 'utf8')).name, prompt.name);
});

test('儲存：用到未宣告的變數時回 422', async () => {
  const { body: { prompt } } = await call('GET', '/api/prompts/character-sheet');
  const { status, body } = await call('PUT', '/api/prompts/character-sheet', { prompt: { ...prompt, template: '{{unknown.var}}' }, expectedVersion: prompt.version });
  assert.equal(status, 422);
  assert.ok(body.error.details.some(d => d.includes('unknown.var')));
});

test('圖片與影片節點先由 Claude 寫成最終指令，模型寫法只用系統的模型代號', () => {
  const MODEL_KEYS = ['nano-banana-pro', 'nano-banana-2-lite', 'gemini-omni-1.1-flash', 'seedance-2.0', 'wan-2.2'];
  for (const f of fs.readdirSync(tmp).filter(f => f.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'));
    for (const key of Object.keys(p.modelRules || {})) assert.ok(MODEL_KEYS.includes(key), `${f}：未知的模型代號 ${key}`);
    if (p.target.kind === 'text') continue;
    assert.equal(p.output?.format, 'json', f);
    assert.ok(p.output.schema.required.includes('prompt'), f);
  }
  const video = JSON.parse(fs.readFileSync(path.join(tmp, 'shot-video.json'), 'utf8'));
  assert.deepEqual(Object.keys(video.modelRules).sort(), ['gemini-omni-1.1-flash', 'seedance-2.0', 'wan-2.2']);
});

test('拒絕不合法的 id 與路徑穿越', async () => {
  assert.equal((await call('GET', '/api/prompts/..%2Fserver')).status, 400);
  const res = await fetch(base + '/../server.js');
  assert.notEqual((await res.text()).includes('createServer'), true);
});

test('圖片與影片節點都有呼叫綁定：最終指令寫進 prompt、比例寫進 aspectRatio', async () => {
  for (const id of ['temple-view', 'character-sheet', 'character-look', 'storyboard-image', 'refined-frame', 'keyframe', 'region-edit', 'shot-video']) {
    const { body } = await call('GET', `/api/prompts/${id}`);
    assert.equal(body.prompt.bindings.prompt, 'output.prompt', id);
    assert.equal(body.prompt.bindings.aspectRatio, 'target.aspectRatio', id);
  }
  const video = await call('GET', '/api/prompts/shot-video');
  assert.equal(video.body.prompt.bindings.durationSec, 'shot.durationSec');
});

test('儲存：呼叫綁定對不上工作流程時回 422，不覆蓋檔案', async () => {
  const { body: { prompt } } = await call('GET', '/api/prompts/temple-view');
  const cases = [
    [{ ...prompt.bindings, frameCount: 'view.key' }, '呼叫綁定 frameCount 不是工作流程的位置'],
    [{ ...prompt.bindings, prompt: 'shot.unknown' }, '呼叫綁定 prompt 用到 shot.unknown，但變數清單沒有宣告'],
    [{ ...prompt.bindings, durationSec: 'view.key' }, '呼叫綁定 durationSec：Nano Banana Pro 的工作流程沒有這個位置'],
    [{ aspectRatio: 'target.aspectRatio' }, '圖片與影片節點要有呼叫綁定 prompt'],
  ];
  for (const [bindings, message] of cases) {
    const { status, body } = await call('PUT', '/api/prompts/temple-view', { prompt: { ...prompt, bindings }, expectedVersion: prompt.version });
    assert.equal(status, 422, message);
    assert.ok(body.error.details.includes(message), `${message}：${JSON.stringify(body.error.details)}`);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'temple-view.json'), 'utf8')).bindings, prompt.bindings);
});

test('儲存：文字節點不能有呼叫綁定', async () => {
  const { body: { prompt } } = await call('GET', '/api/prompts/copy-polish');
  const { status, body } = await call('PUT', '/api/prompts/copy-polish', { prompt: { ...prompt, bindings: { prompt: 'story' } }, expectedVersion: prompt.version });
  assert.equal(status, 422);
  assert.ok(body.error.details.includes('文字節點直接送 Claude，不能有呼叫綁定'));
});

test('組裝：回傳逐字帶入的連續性鎖', async () => {
  const vars = {
    temple: { name: '鄞山寺', appearanceLocks: 'red swallowtail roof ridge; grey granite dragon columns' },
    view: { name: '廟前全景', source: '依照片' },
    photos: '照片 1',
    series: { style: '寫實' },
  };
  const { status, body } = await call('POST', '/api/prompts/temple-view/render', { variables: vars, model: 'nano-banana-pro' });
  assert.equal(status, 200);
  assert.deepEqual(body.locks, ['red swallowtail roof ridge', 'grey granite dragon columns']);
});

test('列出工作流程的模型，給管理頁顯示模型名稱', async () => {
  const { status, body } = await call('GET', '/api/workflows');
  assert.equal(status, 200);
  assert.equal(body.models['seedance-2.0'].label, 'Seedance 2.0');
  assert.equal(body.models['seedance-2.0'].kind, 'video');
});

