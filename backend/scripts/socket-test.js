import { io } from 'socket.io-client';

const API = 'http://localhost:5000';
const EVENTS = [
  'task:created', 'task:updated', 'task:moved', 'task:deleted',
  'presence:online', 'presence:offline', 'presence:update', 'board:updated',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}

async function api(method, path, token, tenantId, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenantId && { 'X-Tenant-Id': tenantId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login(email) {
  const r = await api('POST', '/api/auth/login', null, null, { email, password: 'Password@123' });
  return r.data.token;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, reconnection: false, transports: ['websocket'] });
    socket.log = [];
    for (const ev of EVENTS) socket.on(ev, (d) => socket.log.push({ ev, d }));
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e) => reject(e));
  });
}

const join = (s, tenantId) => new Promise((r) => s.emit('tenant:join', { tenantId }, r));
const count = (s, ev) => s.log.filter((x) => x.ev === ev).length;
const reset = (...sockets) => sockets.forEach((s) => (s.log.length = 0));

async function tenantIdOf(token, name) {
  const r = await api('GET', '/api/tenants', token);
  const list = (r.data.tenants ?? []).map((x) => x.tenant ?? x);
  return list.find((t) => t.name === name)?.id;
}

async function main() {
  const [priyaT, arjunT, snehaT, kiranT] = await Promise.all(
    ['priya@abc.com', 'arjun@abc.com', 'sneha@abc.com', 'kiran@xyz.com'].map(login),
  );
  const hyd = await tenantIdOf(priyaT, 'Hyderabad');
  if (!hyd) throw new Error('Could not find the Hyderabad tenant id');
  const blr = await tenantIdOf(snehaT, 'Bangalore');
    const me = async (t) => (await api('GET', '/api/auth/me', t)).data.user;
  const priyaU = await me(priyaT);
  const arjunU = await me(arjunT);

  const boards = await api('GET', '/api/boards', priyaT, hyd);
  const board = (boards.data.boards ?? []).find((b) => b.name === 'Website Development');
  const colRes = await api('GET', `/api/boards/${board.id}/columns`, priyaT, hyd);
  const cols = colRes.data.columns ?? [];

  // 1. handshake auth
  let refused = false;
  try { await connect('bad-token'); } catch { refused = true; }
  check('bad token is refused at handshake', refused);

  const priya = await connect(priyaT);
  const arjun = await connect(arjunT);
  const sneha = await connect(snehaT);
  const kiran = await connect(kiranT);

  // 2. join rules
  const jp = await join(priya, hyd);
  
    console.log('online list after priya joins:', JSON.stringify(jp.online));
  check('priya joins Hyderabad and sees herself online', jp.ok && jp.online.some((u) => u.id === priyaU.id));
  reset(priya);
  const ja = await join(arjun, hyd);
  check('arjun joins Hyderabad', ja.ok);
  await sleep(300);
   check('priya gets presence:online for Arjun', priya.log.some((x) => x.ev === 'presence:online' && x.d.user.id === arjunU.id));
  check('sneha joins Bangalore', (await join(sneha, blr)).ok);
  check('kiran (other org) is refused on Hyderabad', (await join(kiran, hyd)).ok === false);
  check('sneha (other tenant, same org) is refused on Hyderabad', (await join(sneha, hyd)).ok === false);
  check('random tenant id is refused', (await join(kiran, '11111111-1111-4111-8111-111111111111')).ok === false);

  // 3. live events
  reset(priya, arjun, sneha, kiran);
  const created = await api('POST', '/api/tasks', priyaT, hyd, { boardId: board.id, columnId: cols[0].id, title: 'Socket test task' });
  const task = created.data.task;
  await sleep(500);
  check('arjun receives task:created', count(arjun, 'task:created') === 1);
  check('priya (actor) also receives task:created with actorId', priya.log.some((x) => x.ev === 'task:created' && x.d.actorId));
  check('sneha (Bangalore) receives nothing', sneha.log.length === 0);
  check('kiran (Mumbai) receives nothing', kiran.log.length === 0);

  reset(priya, arjun, sneha, kiran);
  const moved = await api('PATCH', `/api/tasks/${task.id}/move`, arjunT, hyd, { columnId: cols[1].id, index: 0, version: task.version });
  await sleep(500);
  check('priya receives task:moved', count(priya, 'task:moved') === 1);
  check('moved event carries new column and version', priya.log.some((x) => x.d?.task?.columnId === cols[1].id && x.d.task.version === moved.data.task.version));
  check('sneha and kiran receive nothing on move', sneha.log.length === 0 && kiran.log.length === 0);

  reset(priya, arjun);
  const upd = await api('PATCH', `/api/tasks/${task.id}`, priyaT, hyd, { version: moved.data.task.version, title: 'Socket test task (edited)' });
  await sleep(500);
  check('arjun receives task:updated', count(arjun, 'task:updated') === 1);

  reset(priya, arjun, sneha, kiran);
  const stale = await api('PATCH', `/api/tasks/${task.id}`, arjunT, hyd, { version: 1, title: 'stale write' });
  await sleep(500);
  check('stale write returns 409', stale.status === 409);
  check('failed write broadcasts nothing', priya.log.length === 0 && arjun.log.length === 0);

  reset(priya, arjun, sneha, kiran);
  await api('DELETE', `/api/tasks/${task.id}?version=${upd.data.task.version}`, priyaT, hyd);
  await sleep(500);
  check('arjun receives task:deleted', count(arjun, 'task:deleted') === 1);
  check('sneha and kiran receive nothing on delete', sneha.log.length === 0 && kiran.log.length === 0);

  // 4. multi-tab presence
  reset(priya);
  const arjun2 = await connect(arjunT);
  await join(arjun2, hyd);
  await sleep(300);
  check('second tab of Arjun does not fire presence:online again', count(priya, 'presence:online') === 0);
  arjun.disconnect();
  await sleep(400);
  check('closing one tab keeps Arjun online', count(priya, 'presence:offline') === 0);
  arjun2.disconnect();
  await sleep(400);
  check('closing the last tab fires presence:offline', count(priya, 'presence:offline') === 1);

  [priya, sneha, kiran].forEach((s) => s.disconnect());
  console.log(failed === 0 ? '\nAll checks passed' : `\n${failed} check(s) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Test crashed:', e.message);
  process.exit(1);
});