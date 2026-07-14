import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openState, isOpen, romeNow, fmtMinutes, fmtInterval } from './opennow.mjs';

// Monday-first indices: 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun
const OPEN24 = Array(7).fill([[0, 1440]]);
const CLOSED = Array(7).fill([]);
const UNKNOWN = null;

test('24-hour place is open any minute, any day', () => {
  assert.equal(openState(OPEN24, 0, 0).state, 'open');
  assert.equal(openState(OPEN24, 3, 720).state, 'open');
  assert.equal(openState(OPEN24, 6, 1439).state, 'open');
});

test('unknown hours -> unknown, never guessed', () => {
  assert.deepEqual(openState(UNKNOWN, 2, 600), { state: 'unknown' });
  assert.deepEqual(openState([null, null, null, null, null, null, null], 2, 600), { state: 'unknown' });
});

test('explicitly closed day -> closed', () => {
  assert.equal(openState(CLOSED, 1, 600).state, 'closed');
});

test('single interval: before, during, after', () => {
  // Mon 12:00-14:30 only
  const h = [[[720, 870]], [], [], [], [], [], []];
  assert.deepEqual(openState(h, 0, 719), { state: 'opens', at: 720 }); // 11:59 -> opens 12:00
  assert.equal(openState(h, 0, 720).state, 'open');                    // 12:00 open
  assert.deepEqual(openState(h, 0, 870), { state: 'closed' });         // 14:30 boundary = closed
  assert.deepEqual(openState(h, 0, 900), { state: 'closed' });         // 15:00 closed today
});

test('multi-interval day: lunch + dinner with a gap', () => {
  // 12:30-14:30 and 19:30-23:00
  const h = Array(7).fill([[750, 870], [1170, 1380]]);
  assert.equal(openState(h, 2, 800).state, 'open');                    // 13:20 lunch
  assert.deepEqual(openState(h, 2, 900), { state: 'opens', at: 1170 });// 15:00 -> opens 19:30
  assert.equal(openState(h, 2, 1200).state, 'open');                   // 20:00 dinner
  assert.deepEqual(openState(h, 2, 1385), { state: 'closed' });        // 23:05 closed
});

test('past-midnight interval: open now via today AND via yesterday spillover', () => {
  // Every day 18:00 -> 01:00 next day  => [1080, 1500]
  const h = Array(7).fill([[1080, 1500]]);
  assert.deepEqual(openState(h, 2, 1200), { state: 'open', until: 60 });  // Wed 20:00 open until 01:00
  assert.deepEqual(openState(h, 2, 1439), { state: 'open', until: 60 });  // Wed 23:59 still open
  assert.deepEqual(openState(h, 3, 30), { state: 'open', until: 60 });    // Thu 00:30 = Wed spillover
  assert.deepEqual(openState(h, 3, 60), { state: 'opens', at: 1080 });    // Thu 01:00 boundary -> shut, opens 18:00
});

test('spillover only counts when yesterday actually crossed midnight', () => {
  // Yesterday closed at 23:00 (no spill); today opens 18:00
  const h = Array(7).fill([[1080, 1380]]);
  assert.deepEqual(openState(h, 3, 30), { state: 'opens', at: 1080 });    // 00:30 not open
});

test('Sunday and Monday indices are handled (classic off-by-one)', () => {
  // Open only Sunday 09:00-13:00
  const h = [[], [], [], [], [], [], [[540, 780]]];
  assert.equal(openState(h, 6, 600).state, 'open');    // Sun 10:00
  assert.deepEqual(openState(h, 0, 600), { state: 'closed' }); // Mon closed
  // Sunday spillover into Monday
  const h2 = [[], [], [], [], [], [], [[1200, 1560]]]; // Sun 20:00 -> 02:00 Mon
  assert.deepEqual(openState(h2, 0, 90), { state: 'open', until: 120 }); // Mon 01:30 from Sun
});

test('romeNow returns Monday-first day and minutes for a fixed instant', () => {
  // 2025-07-09 is a Wednesday. 12:00 UTC = 14:00 Rome (CEST, +2).
  const { day, minutes } = romeNow(new Date('2025-07-09T12:00:00Z'));
  assert.equal(day, 2);        // Wed
  assert.equal(minutes, 840);  // 14:00
});

test('fixture: Il Corallo (dinner-only, Sunday lunch) at a frozen clock', () => {
  // Mon closed; Tue-Sat 20:00-23:00 [1200,1380]; Sun 12:45-14:30 [765,870]
  const corallo = [[], [[1200, 1380]], [[1200, 1380]], [[1200, 1380]], [[1200, 1380]], [[1200, 1380]], [[765, 870]]];
  assert.deepEqual(openState(corallo, 0, 1260), { state: 'closed' });      // Mon 21:00 -> closed
  assert.deepEqual(openState(corallo, 1, 1260), { state: 'open', until: 1380 % 1440 }); // Tue 21:00 open
  assert.equal(fmtMinutes(1380), '23:00');
  assert.equal(openState(corallo, 6, 800).state, 'open');                  // Sun 13:20 lunch open
});

test('formatting helpers', () => {
  assert.equal(fmtMinutes(0), '00:00');
  assert.equal(fmtMinutes(1500), '01:00');   // %1440
  assert.equal(fmtInterval([1080, 1500]), '18:00–01:00');
  assert.equal(isOpen(OPEN24, 0, 0), true);
  assert.equal(isOpen(CLOSED, 0, 0), false);
});
