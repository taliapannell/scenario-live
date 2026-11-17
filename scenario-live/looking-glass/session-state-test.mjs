// session-state-test.mjs — offline unit test for shared/session-state.js
// -----------------------------------------------------------------------------
//   node session-state-test.mjs
//
// Covers the shift cap and Dream Mode: dreams bypass the entity lock, don't count
// toward maxShifts, are uncapped, and keep their seed only for edits.
// -----------------------------------------------------------------------------

import { sessionState, configureSceneHandlers, onEntityDetected, onDreamDetected, resetSession } from '../shared/session-state.js'

let pass = 0
let fail = 0

function assert(label, value, expected) {
  const ok = typeof expected === 'function' ? expected(value) : value === expected
  if (ok) {
    console.log(`  ✅ ${label}`)
    pass++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     got:      ${JSON.stringify(value)}`)
    console.log(`     expected: ${typeof expected === 'function' ? '(predicate)' : JSON.stringify(expected)}`)
    fail++
  }
}

const triggered = []
configureSceneHandlers({ triggerScene: (prompt, opts) => triggered.push({ prompt, ...opts }) })

console.log('\n═══ S1: Conversation shifts cap at maxShifts ═══')
{
  resetSession(); triggered.length = 0
  onEntityDetected('sustainability', 'keyword', 'scene A')
  onEntityDetected('innovation', 'keyword', 'scene B')
  onEntityDetected('operations', 'keyword', 'scene C')
  assert('shiftCount stops at 2', sessionState.shiftCount, 2)
  assert('third keyword ignored', triggered.length, 2)
}

console.log('\n═══ S2: Dreams are uncapped and don\'t count ═══')
{
  // shiftCount is still at the cap from S1
  for (let i = 0; i < 5; i++) onDreamDetected(`dream ${i}`)
  assert('all 5 dreams triggered', triggered.length, 7)
  assert('shiftCount unchanged', sessionState.shiftCount, 2)
  assert('latest dream prompt stored', sessionState.dreamScenePrompt, 'dream 4')
}

console.log('\n═══ S3: Dreams bypass the company lock ═══')
{
  resetSession(); triggered.length = 0
  onEntityDetected('Google', 'company', 'googleplex')
  onDreamDetected('flying cars, rainbow')
  assert('dream triggered after company lock', triggered.at(-1)?.prompt, 'flying cars, rainbow')
  assert('still locked', sessionState.entityLocked, true)
}

console.log('\n═══ S4: Seeds — new per dream, fixed for edits ═══')
{
  resetSession(); triggered.length = 0
  onDreamDetected('flying cars')
  const first = sessionState.dreamSeed
  assert('seed set', first, v => Number.isInteger(v))
  assert('seed passed to triggerScene', triggered.at(-1)?.seed, first)
  onDreamDetected('flying cars, rainbow', null, null, { isEdit: true })
  assert('edit keeps seed', sessionState.dreamSeed, first)
  onDreamDetected('underwater city')
  assert('new dream gets new seed', sessionState.dreamSeed, v => v !== first)
  onDreamDetected('')
  assert('empty scene prompt ignored', triggered.length, 3)
}

console.log('\n═══ S5: resetSession clears dream state ═══')
{
  resetSession()
  assert('dreamScenePrompt cleared', sessionState.dreamScenePrompt, null)
  assert('dreamSeed cleared', sessionState.dreamSeed, null)
}

console.log(`\n──────────────`)
console.log(`${pass}/${pass + fail} assertions passed${fail > 0 ? ` — ${fail} FAILED` : ' ✅'}`)
console.log()
