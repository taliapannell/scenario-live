// nova-parser-test.mjs — offline unit test for extractStructuredResponse()
// -----------------------------------------------------------------------------
// Tests the tag parser in isolation — no AWS credentials, no browser needed.
//
//   node nova-parser-test.mjs
//
// All mock responses are modelled on realistic Claude outputs for the new
// 6-tag system prompt. Covers: entity detected, generic greeting (empty entity),
// missing/malformed tags, multi-line notes stripping, and scent slot matching.
// -----------------------------------------------------------------------------

import { matchScentScene } from './sensory/scent.js'

// ── Parser (mirrored from nova-chat.js) ─────────────────────────────────────

function extractStructuredResponse(reply) {
  const get = (tag) => {
    const match = reply.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const mode        = get('mode').toLowerCase() === 'dream' ? 'dream' : 'conversation'
  const spoken      = get('reply')
  const entity      = get('entity')
  const scenePrompt = get('scene_prompt')
  const audioPrompt = get('audio_prompt')
  const scentPrompt = get('scent_prompt')
  const notesRaw    = get('notes')
  const notes = notesRaw
    .split('\n')
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)

  return { mode, spoken, entity, scenePrompt, audioPrompt, scentPrompt, notes }
}

// ── Test harness ─────────────────────────────────────────────────────────────

const DEFAULT_SCENE = 'Futuristic Maker\'s Lab in New York City. Industrial loft space with exposed brick and cool graffiti murals. 3D printers actively building objects on workbenches. Robots moving purposefully between workstations. Holographic displays floating mid-air. Chemistry glassware glowing on shelves. Purple ambient lighting. Cinematic depth, immersive atmosphere.'

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

// ── MOCK RESPONSES ───────────────────────────────────────────────────────────

const MOCK_ENTITY = `
<reply>Google's work in AI — through DeepMind and Google Brain — directly intersects with what we're exploring here at the Maker's Lab. Their research into large language models and robotics is a key reference point for our own installations.</reply>

<entity>Google</entity>

<scene_prompt>Google's Mountain View campus — the Googleplex. Bright open-plan offices with colorful furniture and whiteboards covered in equations. Engineers collaborating around large monitors displaying neural network visualizations. Courtyards with bikes and outdoor spaces. Cinematic depth, natural California light.</scene_prompt>

<audio_prompt>The ambient hum of a busy tech campus — keyboards typing, quiet overlapping conversation, distant mechanical ventilation, the subtle chime of a desktop notification.</audio_prompt>

<scent_prompt>Fresh coffee, warm electronics, cool air-conditioned office</scent_prompt>

<notes>
- Google has invested over $30 billion in AI research through DeepMind and Google Brain
- Accenture partners with Google Cloud on enterprise AI and digital transformation programs at scale
- Their TPU infrastructure powers some of the world's largest generative AI models
</notes>
`.trim()

const MOCK_GENERIC = `
<reply>Welcome to Accenture's Emerging Tech Innovation Maker's Lab — our flagship innovation space in New York City where we bring emerging technology to life through hands-on demos and immersive experiences. I'd love to show you what we're building.</reply>

<entity></entity>

<scene_prompt>Futuristic Maker's Lab in New York City. Industrial loft space with exposed brick and cool graffiti murals. 3D printers actively building objects on workbenches. Robots moving purposefully between workstations. Holographic displays floating mid-air. Chemistry glassware glowing on shelves. Purple ambient lighting. Cinematic depth, immersive atmosphere.</scene_prompt>

<audio_prompt>The ambient hum of an innovation lab — 3D printers whirring, robotic arms clicking softly, ventilation overhead, muffled city sounds through large windows.</audio_prompt>

<scent_prompt>Solder, sawdust, fresh air</scent_prompt>

<notes>
</notes>
`.trim()

const MOCK_MISSING_TAGS = `
Sorry, I couldn't parse that — here's a plain reply with no tags at all.
`.trim()

const MOCK_BULLET_VARIANTS = `
<reply>Siemens has been a leader in industrial automation for over 175 years, and here at the Maker's Lab we're exploring how their MindSphere IoT platform connects with our robotics work.</reply>

<entity>Siemens</entity>

<scene_prompt>A Siemens smart factory floor in Germany. Precision robotic arms assembling turbine components under bright white lighting. Digital twin screens showing real-time sensor data. Engineers in hard hats moving between workstations. Clean industrial aesthetic, high-tech atmosphere.</scene_prompt>

<audio_prompt>The industrial soundscape of a smart factory — robotic arms whirring, metal on metal, ventilation systems humming, safety alert tones in the distance.</audio_prompt>

<scent_prompt>Machine oil, warm metal, engine coolant</scent_prompt>

<notes>
• Siemens' MindSphere connects over 1.5 million devices across global manufacturing operations
• Accenture and Siemens co-developed smart manufacturing solutions for several Fortune 500 clients
• Their digital twin technology is a direct parallel to the mixed-reality simulations we demo here
</notes>
`.trim()

const MOCK_DREAM = `
<mode>dream</mode>
<reply>Flying cars chasing a rainbow. Let's see it.</reply>
<entity></entity>
<scene_prompt>sleek flying cars soaring through a bright sky toward a vivid full rainbow, golden hour light, soft clouds, cinematic wide shot, dreamlike, highly detailed</scene_prompt>
<audio_prompt>airy, shimmering ambient pads with soft wind, wonder and lift</audio_prompt>
<notes>dream: flying cars + rainbow</notes>
`.trim()

// ── TEST SUITE ────────────────────────────────────────────────────────────────

console.log('\n═══ T1: Entity detected (Google) ═══')
{
  const r = extractStructuredResponse(MOCK_ENTITY)
  assert('spoken is non-empty',   r.spoken,      v => v.length > 0)
  assert('entity is "Google"',    r.entity,      'Google')
  assert('scenePrompt non-empty', r.scenePrompt, v => v.length > 0)
  assert('scenePrompt is NOT the default fallback', r.scenePrompt, v => v !== DEFAULT_SCENE)
  assert('audioPrompt non-empty', r.audioPrompt, v => v.length > 0)
  assert('scentPrompt non-empty', r.scentPrompt, v => v.length > 0)
  assert('notes has 3 items',     r.notes.length, 3)
  assert('notes[0] has no leading dash', r.notes[0], v => !v.startsWith('-'))
}

console.log('\n═══ T2: Generic greeting (no entity) ═══')
{
  const r = extractStructuredResponse(MOCK_GENERIC)
  assert('spoken is non-empty',   r.spoken,      v => v.length > 0)
  assert('entity is empty',       r.entity,      '')
  assert('scenePrompt is the default Maker\'s Lab fallback', r.scenePrompt, DEFAULT_SCENE)
  assert('audioPrompt non-empty', r.audioPrompt, v => v.length > 0)
  assert('scentPrompt non-empty', r.scentPrompt, v => v.length > 0)
  assert('scent falls back to default slot', matchScentScene(r.scentPrompt), 'slot_6')
  assert('notes is empty array',  r.notes.length, 0)
}

console.log('\n═══ T3: Missing tags (graceful degradation) ═══')
{
  const r = extractStructuredResponse(MOCK_MISSING_TAGS)
  assert('spoken is empty string',      r.spoken,      '')
  assert('entity is empty string',      r.entity,      '')
  assert('scenePrompt is empty string', r.scenePrompt, '')
  assert('audioPrompt is empty string', r.audioPrompt, '')
  assert('scentPrompt is empty string', r.scentPrompt, '')
  assert('missing scent falls back to default slot', matchScentScene(r.scentPrompt), 'slot_6')
  assert('notes is empty array',        r.notes.length, 0)
}

console.log('\n═══ T4: Bullet variant (• instead of -) stripped correctly ═══')
{
  const r = extractStructuredResponse(MOCK_BULLET_VARIANTS)
  assert('entity is "Siemens"',          r.entity, 'Siemens')
  assert('notes has 3 items',            r.notes.length, 3)
  assert('notes[0] has no leading •',    r.notes[0], v => !v.startsWith('•'))
  assert('notes[0] has no leading -',    r.notes[0], v => !v.startsWith('-'))
  assert('notes[0] is non-empty',        r.notes[0], v => v.length > 0)
  assert('scent "engine" matches slot_1', matchScentScene(r.scentPrompt), 'slot_1')
}

console.log('\n═══ T5: Scent scene matching ═══')
{
  assert('automotive → slot_1', matchScentScene('Rubber and oil from an automotive plant'), 'slot_1')
  assert('healthcare → slot_2', matchScentScene('Clinical, sterile hospital air'), 'slot_2')
  assert('digital → slot_3',    matchScentScene('Ozone of a digital server room'), 'slot_3')
  assert('rain → slot_4',       matchScentScene('Rain-dampened concrete, exhaust, street food'), 'slot_4')
  assert('corporate → slot_5',  matchScentScene('Quiet corporate boardroom, paper'), 'slot_5')
  assert('"train" does not match rain', matchScentScene('Commuter train station'), 'slot_6')
  assert('"Brain" does not match rain', matchScentScene('Google Brain research lab'), 'slot_6')
  assert('undefined → slot_6',  matchScentScene(undefined), 'slot_6')
  assert('"car" does not match "care"', matchScentScene('Gentle patient care, soft linen'), 'slot_6')
  assert('plural "cars" matches slot_1', matchScentScene('Rows of new cars'), 'slot_1')
}

console.log('\n═══ T6: Entity takes priority over scent description ═══')
{
  // Real Nova outputs: the scent text alone names no industry.
  const smellsOnly = 'Hot metal, machine oil, fresh rubber, welding smoke, industrial solvent, concrete dust'
  assert('entity "automotive manufacturing" → slot_1', matchScentScene('automotive manufacturing', smellsOnly), 'slot_1')
  assert('entity "urban planning" → slot_4', matchScentScene('urban planning', 'Fresh concrete, morning air'), 'slot_4')
  assert('entity "healthcare" beats city scent text', matchScentScene('healthcare', 'Rain on pavement'), 'slot_2')
  assert('unmatched entity falls back to scent text', matchScentScene('Google', 'Ozone and cool server air'), 'slot_3')
  assert('nothing matches → slot_6', matchScentScene('Google', 'Fresh coffee, cool air'), 'slot_6')
}

console.log('\n═══ T7: Dream Mode <mode> tag ═══')
{
  const r = extractStructuredResponse(MOCK_DREAM)
  assert('mode is "dream"',              r.mode, 'dream')
  assert('entity is empty',              r.entity, '')
  assert('scenePrompt keeps flying cars', r.scenePrompt, v => v.includes('flying cars'))
  assert('scenePrompt keeps rainbow',     r.scenePrompt, v => v.includes('rainbow'))
  assert('missing scent_prompt → empty',  r.scentPrompt, '')
  assert('uppercase DREAM → dream',       extractStructuredResponse('<mode> DREAM </mode>').mode, 'dream')
  assert('explicit conversation',         extractStructuredResponse('<mode>conversation</mode>').mode, 'conversation')
  assert('missing mode → conversation',   extractStructuredResponse(MOCK_ENTITY).mode, 'conversation')
  assert('invalid mode → conversation',   extractStructuredResponse('<mode>nightmare</mode>').mode, 'conversation')
  assert('no tags at all → conversation', extractStructuredResponse(MOCK_MISSING_TAGS).mode, 'conversation')
}

console.log(`\n──────────────`)
console.log(`${pass}/${pass + fail} assertions passed${fail > 0 ? ` — ${fail} FAILED` : ' ✅'}`)
console.log()
