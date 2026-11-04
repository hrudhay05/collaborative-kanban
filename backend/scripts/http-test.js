import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'http://localhost:5000';
const lines = [];
let total = 0;
let failed = 0;

function log(s) {
  console.log(s);
  lines.push(s);
}

function check(label, ok, info = '') {
  total++;
  if (!ok) failed++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && info ? `  -> ${info}` : ''}`);
}

function expectStatus(label, res, ...codes) {
  check(`${label} (expect ${codes.join('/')})`, codes.includes(res.status), `got ${res.status}`);
}

async function api(method, p, token, tenantId, body) {
  const res = await fetch(API + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenantId && { 'X-Tenant-Id': tenantId }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data, text };
}

async function main() {
  log(`HTTP isolation, RBAC and concurrency tests - ${new Date().toISOString()}`);

  const login = async (email) =>
    (await api('POST', '/api/auth/login', null, null, { email, password: 'Password@123' })).data.token;
  const [priya, arjun, rahul, sneha, kiran] = await Promise.all(
    ['priya@abc.com', 'arjun@abc.com', 'rahul@abc.com', 'sneha@abc.com', 'kiran@xyz.com'].map(login),
  );
  if (![priya, arjun, rahul, sneha, kiran].every(Boolean)) throw new Error('Login failed. Did you run the seed?');

  const tenantsOf = async (t) => (await api('GET', '/api/tenants', t)).data.tenants ?? [];
  const idOf = (list, name) => list.find((x) => x.name === name)?.id;
  const rahulTenants = await tenantsOf(rahul);
  const kiranTenants = await tenantsOf(kiran);
  const hyd = idOf(rahulTenants, 'Hyderabad');
  const blr = idOf(rahulTenants, 'Bangalore');
  const chn = idOf(rahulTenants, 'Chennai');
  const mum = idOf(kiranTenants, 'Mumbai');
  const kiranId = (await api('GET', '/api/auth/me', kiran)).data.user.id;
  const snehaId = (await api('GET', '/api/auth/me', sneha)).data.user.id;

  const boardByName = async (t, tid, name) => {
    const list = (await api('GET', '/api/boards', t, tid)).data.boards ?? [];
    const b = list.find((x) => x.name === name);
    return (await api('GET', `/api/boards/${b.id}`, t, tid)).data.board;
  };
  const hydBoard = await boardByName(priya, hyd, 'Website Development');
  const blrBoard = await boardByName(sneha, blr, 'CRM Development');
  const col = (b, name) => b.columns.find((c) => c.name === name);
  const todo = col(hydBoard, 'To Do');
  const prog = col(hydBoard, 'In Progress');
  const testing = col(hydBoard, 'Testing');
  const done = col(hydBoard, 'Done');
  const hydTask = todo.tasks[0];
  const blrTask = blrBoard.columns.flatMap((c) => c.tasks)[0];
  const blrCol = blrBoard.columns[1];

  const P = (m, p, body) => api(m, p, priya, hyd, body);
  const A = (m, p, body) => api(m, p, arjun, hyd, body);
  const temp = [];
  const mk = async (title, c = todo) => {
    const r = await P('POST', '/api/tasks', { boardId: hydBoard.id, columnId: c.id, title });
    if (r.status !== 201) throw new Error(`could not create a temp task: ${r.status} ${r.text}`);
    temp.push(r.data.task);
    return r.data.task;
  };
  const getTask = (id) => P('GET', `/api/tasks/${id}`);
  const boardNow = async () => (await P('GET', `/api/boards/${hydBoard.id}`)).data.board;

  log('\n== A. Cross-tenant ID guessing (Priya, Hyderabad, uses Bangalore IDs) ==');
  expectStatus('GET Bangalore board by id', await P('GET', `/api/boards/${blrBoard.id}`), 404);
  expectStatus('GET Bangalore board columns', await P('GET', `/api/boards/${blrBoard.id}/columns`), 404);
  expectStatus('GET Bangalore task by id', await P('GET', `/api/tasks/${blrTask.id}`), 404);
  expectStatus('GET Bangalore task activity', await P('GET', `/api/tasks/${blrTask.id}/activity`), 404);
  expectStatus('PATCH Bangalore task', await P('PATCH', `/api/tasks/${blrTask.id}`, { version: blrTask.version, title: 'hacked' }), 404);
  expectStatus('MOVE Bangalore task', await P('PATCH', `/api/tasks/${blrTask.id}/move`, { columnId: blrCol.id, index: 0, version: blrTask.version }), 404);
  expectStatus('DELETE Bangalore task', await P('DELETE', `/api/tasks/${blrTask.id}?version=${blrTask.version}`), 404);
  expectStatus('PATCH Bangalore column', await P('PATCH', `/api/columns/${blrCol.id}`, { name: 'hacked' }), 404);
  expectStatus('DELETE Bangalore column', await P('DELETE', `/api/columns/${blrCol.id}`), 404);
  expectStatus('PATCH Bangalore board', await P('PATCH', `/api/boards/${blrBoard.id}`, { name: 'hacked' }), 404);
  expectStatus('DELETE Bangalore board', await P('DELETE', `/api/boards/${blrBoard.id}`), 404);
  const c1 = await P('POST', '/api/tasks', { boardId: blrBoard.id, columnId: blrCol.id, title: 'hacked' });
  expectStatus('create a task in a Bangalore board and column', c1, 400, 404);
  if (c1.status === 201) temp.push(c1.data.task);
  expectStatus('move a Hyderabad task into a Bangalore column', await P('PATCH', `/api/tasks/${hydTask.id}/move`, { columnId: blrCol.id, index: 0, version: hydTask.version }), 400, 404);
  const blrAfter = (await api('GET', `/api/tasks/${blrTask.id}`, sneha, blr)).data.task;
  check('Bangalore task unchanged (title, version, column)', blrAfter.title === blrTask.title && blrAfter.version === blrTask.version && blrAfter.columnId === blrTask.columnId);
  const hydAfter = (await getTask(hydTask.id)).data.task;
  check('Hyderabad task stayed in its own column, version unchanged', hydAfter.columnId === hydTask.columnId && hydAfter.version === hydTask.version);
  check('Bangalore board still exists with its name', (await api('GET', `/api/boards/${blrBoard.id}`, sneha, blr)).data.board?.name === blrBoard.name);

  log('\n== B. Header and token tampering ==');
  const notMine = await api('GET', '/api/boards', priya, blr);
  expectStatus('Priya with the Bangalore tenant header', notMine, 403);
  expectStatus('Priya GET /api/members with the Bangalore header', await api('GET', '/api/members', priya, blr), 403);
  expectStatus('Sneha (Bangalore admin) with the Hyderabad header', await api('GET', '/api/boards', sneha, hyd), 403);
  const unknown = await api('GET', '/api/boards', priya, '11111111-1111-4111-8111-111111111111');
  expectStatus('unknown tenant id', unknown, 403);
  check('unknown tenant and not-my-tenant give identical responses (no tenant enumeration)', unknown.status === notMine.status && unknown.text === notMine.text);
  expectStatus('missing tenant header', await api('GET', '/api/boards', priya, null), 400, 403);
  expectStatus('malformed tenant header', await api('GET', '/api/boards', priya, 'not-a-uuid'), 400, 403);
  expectStatus('no token', await api('GET', '/api/boards', null, hyd), 401);
  expectStatus('garbage token', await api('GET', '/api/boards', 'garbage', hyd), 401);

  log('\n== C. Cross-organization isolation ==');
  expectStatus('Kiran (XYZ) with the Hyderabad header', await api('GET', '/api/boards', kiran, hyd), 403);
  expectStatus('Kiran (XYZ) with the Bangalore header', await api('GET', '/api/boards', kiran, blr), 403);
  expectStatus('Kiran reads an ABC board by id using his own tenant header', await api('GET', `/api/boards/${hydBoard.id}`, kiran, mum), 404);
  expectStatus('Kiran reads an ABC task by id using his own tenant header', await api('GET', `/api/tasks/${hydTask.id}`, kiran, mum), 404);
  expectStatus('Rahul (ABC org admin) with the Mumbai (XYZ) header', await api('GET', '/api/boards', rahul, mum), 403);
  const rahulOrgs = (await api('GET', '/api/organizations', rahul)).data.organizations ?? [];
  check('Rahul sees only his own organization', rahulOrgs.length === 1 && rahulOrgs[0].name === 'ABC Technologies');
  check('Kiran sees only XYZ tenants', kiranTenants.length > 0 && kiranTenants.every((t) => t.organization?.name === 'XYZ Solutions'));
  const xyzOrg = ((await api('GET', '/api/organizations', kiran)).data.organizations ?? [])[0];
  expectStatus('Rahul reads the XYZ organization by id', await api('GET', `/api/organizations/${xyzOrg.id}`, rahul), 403, 404);
  expectStatus('Rahul lists the XYZ tenants', await api('GET', `/api/organizations/${xyzOrg.id}/tenants`, rahul), 403, 404);

  log('\n== D. Body tampering ==');
  const forged = await P('POST', '/api/tasks', { boardId: hydBoard.id, columnId: todo.id, title: 'forged tenant', tenantId: blr });
  if (forged.status === 201) temp.push(forged.data.task);
  check('tenantId in the request body cannot put a task into another tenant', (forged.status === 201 && forged.data.task?.tenantId === hyd) || forged.status === 400, `status ${forged.status}`);
  const asKiran = await P('POST', '/api/tasks', { boardId: hydBoard.id, columnId: todo.id, title: 'x', assignedTo: kiranId });
  if (asKiran.status === 201) temp.push(asKiran.data.task);
  expectStatus('assign a task to a user from another organization', asKiran, 400);
  const asSneha = await P('POST', '/api/tasks', { boardId: hydBoard.id, columnId: todo.id, title: 'x', assignedTo: snehaId });
  if (asSneha.status === 201) temp.push(asSneha.data.task);
  expectStatus('assign a task to a user from another tenant', asSneha, 400);

  log('\n== E. Role-based access control (Hyderabad) ==');
  expectStatus('Member creates a board', await A('POST', '/api/boards', { name: 'Nope' }), 403);
  expectStatus('Member renames a board', await A('PATCH', `/api/boards/${hydBoard.id}`, { name: 'Nope' }), 403);
  expectStatus('Member deletes a board', await A('DELETE', `/api/boards/${hydBoard.id}`), 403);
  expectStatus('Member adds a column', await A('POST', `/api/boards/${hydBoard.id}/columns`, { name: 'Nope' }), 403);
  expectStatus('Member renames a column', await A('PATCH', `/api/columns/${todo.id}`, { name: 'Nope' }), 403);
  expectStatus('Member deletes a column', await A('DELETE', `/api/columns/${todo.id}`), 403);
  expectStatus('Member deletes a task', await A('DELETE', `/api/tasks/${hydTask.id}?version=${hydTask.version}`), 403);
  const mt = await A('POST', '/api/tasks', { boardId: hydBoard.id, columnId: todo.id, title: 'member task' });
  expectStatus('Member creates a task', mt, 201);
  if (mt.status === 201) temp.push(mt.data.task);
  const mEdit = await A('PATCH', `/api/tasks/${mt.data.task.id}`, { version: mt.data.task.version, title: 'member task edited' });
  expectStatus('Member edits a task', mEdit, 200);
  expectStatus('Member moves a task', await A('PATCH', `/api/tasks/${mt.data.task.id}/move`, { columnId: prog.id, index: 0, version: mEdit.data.task?.version ?? 2 }), 200);
  expectStatus('Tenant admin of another tenant (Sneha) creates a Hyderabad board', await api('POST', '/api/boards', sneha, hyd, { name: 'Nope' }), 403);
  expectStatus('Org admin (Rahul) reaches Hyderabad', await api('GET', '/api/boards', rahul, hyd), 200);
  expectStatus('Org admin (Rahul) reaches Chennai', await api('GET', '/api/boards', rahul, chn), 200);
  const stillThere = await P('GET', `/api/boards/${hydBoard.id}`);
  check('board survived every denied member action', stillThere.status === 200 && stillThere.data.board.name === hydBoard.name && stillThere.data.board.columns.length === hydBoard.columns.length);

  log('\n== F. Concurrency ==');
  const t1 = await mk('stale write test');
  const w1 = await P('PATCH', `/api/tasks/${t1.id}`, { version: t1.version, title: 'first writer' });
  const w2 = await A('PATCH', `/api/tasks/${t1.id}`, { version: t1.version, title: 'second writer (stale)' });
  expectStatus('first writer', w1, 200);
  expectStatus('second writer using the stale version', w2, 409);
  check('409 body carries the current server task', w2.data.details?.current?.version === t1.version + 1 && w2.data.details.current.title === 'first writer');
  const f1 = (await getTask(t1.id)).data.task;
  check('final state is the first writer, version incremented once', f1.title === 'first writer' && f1.version === t1.version + 1);
  const act1 = (await P('GET', `/api/tasks/${t1.id}/activity`)).data.activity ?? [];
  check('rejected write left no activity entry (CREATED and one UPDATED only)', act1.length === 2 && act1.map((a) => a.action).join() === 'UPDATED,CREATED', act1.map((a) => a.action).join());

  let editRace = true;
  const editCodes = [];
  for (let i = 0; i < 5; i++) {
    const t = await mk(`edit race ${i}`);
    const [a, b] = await Promise.all([
      P('PATCH', `/api/tasks/${t.id}`, { version: t.version, title: 'X' }),
      A('PATCH', `/api/tasks/${t.id}`, { version: t.version, title: 'Y' }),
    ]);
    const codes = [a.status, b.status].sort().join('/');
    editCodes.push(codes);
    const g = (await getTask(t.id)).data.task;
    const winner = a.status === 200 ? 'X' : 'Y';
    if (codes !== '200/409' || g.version !== t.version + 1 || g.title !== winner) editRace = false;
  }
  check('5 rounds of simultaneous edits: exactly one winner each time, version +1', editRace, editCodes.join(' '));

  let moveRace = true;
  const moveCodes = [];
  for (let i = 0; i < 5; i++) {
    const t = await mk(`move race ${i}`);
    const [a, b] = await Promise.all([
      P('PATCH', `/api/tasks/${t.id}/move`, { columnId: prog.id, index: 0, version: t.version }),
      A('PATCH', `/api/tasks/${t.id}/move`, { columnId: done.id, index: 0, version: t.version }),
    ]);
    const codes = [a.status, b.status].sort().join('/');
    moveCodes.push(codes);
    const g = (await getTask(t.id)).data.task;
    const board = await boardNow();
    const appearances = board.columns.flatMap((c) => c.tasks).filter((x) => x.id === t.id).length;
    const winnerCol = a.status === 200 ? prog.id : done.id;
    if (codes !== '200/409' || g.columnId !== winnerCol || appearances !== 1) moveRace = false;
  }
  check('5 rounds of two users moving the same task: one winner, task in the winning column, shown exactly once', moveRace, moveCodes.join(' '));

  const many = [];
  for (let i = 0; i < 12; i++) many.push(await mk(`stress ${i}`));
  const before = (await boardNow()).columns.find((c) => c.id === testing.id).tasks.length;
  const results = await Promise.all(
    many.map((t, i) => (i % 2 ? A : P)('PATCH', `/api/tasks/${t.id}/move`, { columnId: testing.id, index: 0, version: t.version })),
  );
  check('12 simultaneous moves of different tasks into one column all succeed', results.every((r) => r.status === 200), results.map((r) => r.status).join(','));
  const destCol = (await boardNow()).columns.find((c) => c.id === testing.id);
  const positions = destCol.tasks.map((t) => t.position);
  check('no duplicate positions in the destination column', new Set(positions).size === positions.length, positions.join(','));
  check('destination holds the old tasks plus all 12, none lost or duplicated', destCol.tasks.length === before + 12 && new Set(destCol.tasks.map((t) => t.id)).size === destCol.tasks.length);

  let delRace = true;
  const delInfo = [];
  for (let i = 0; i < 3; i++) {
    const t = await mk(`edit vs delete ${i}`);
    const [e, d] = await Promise.all([
      P('PATCH', `/api/tasks/${t.id}`, { version: t.version, title: 'edited' }),
      P('DELETE', `/api/tasks/${t.id}?version=${t.version}`),
    ]);
    const g = await getTask(t.id);
    const ok = d.status === 200 ? g.status === 404 && e.status !== 200 : e.status === 200 && g.status === 200 && g.data.task.title === 'edited';
    delInfo.push(`edit ${e.status} delete ${d.status} get ${g.status}`);
    if (!ok) delRace = false;
  }
  check('3 rounds of edit versus delete: never both succeed, final state consistent', delRace, delInfo.join(' | '));

  const gone = await mk('deleted then edited');
  await P('DELETE', `/api/tasks/${gone.id}?version=${gone.version}`);
  expectStatus('edit a deleted task', await P('PATCH', `/api/tasks/${gone.id}`, { version: gone.version, title: 'zombie' }), 404);
  expectStatus('move a deleted task', await P('PATCH', `/api/tasks/${gone.id}/move`, { columnId: prog.id, index: 0, version: gone.version }), 404);

  let cleaned = 0;
  for (const t of temp) {
    const r = await P('DELETE', `/api/tasks/${t.id}`);
    if (r.status === 200) cleaned++;
  }
  log(`\n(cleanup: removed ${cleaned} of ${temp.length} temporary tasks; re-seed before the next run)`);

  log(failed === 0 ? `\nAll ${total} checks passed` : `\n${failed} of ${total} check(s) FAILED`);
  const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'http-test-report.txt'), lines.join('\n') + '\n', 'utf8');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Test crashed:', e.message);
  process.exit(1);
});