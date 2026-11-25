// Cartridge slots are placeholders — update once the Olorama hardware is confirmed.
const SCENT_SCENE_MAP = {
  'engine_rumble':   'slot_1', // Rubber, metal, oil
  'clinical_gentle': 'slot_2', // Clean, sterile, neutral
  'electronic_hum':  'slot_3', // Ozone, cool air
  'city_rain':       'slot_4', // Wet concrete, petrichor
  'corporate_quiet': 'slot_5', // Subtle wood, paper
  'default':         'slot_6', // Maker's Lab default (solder, wood, fresh air)
  'slot_7':         'slot_7', // Slot 7 placeholder
  'slot_8':         'slot_8', // Slot 8 placeholder
  'slot_9':         'slot_9', // Slot 9 placeholder
  'slot_10':        'slot_10', // Slot 10 placeholder
}

// Whole words only (plus a plural "s"), so "rain" doesn't fire on "train" or
// "Brain" and "car" doesn't fire on "care". Checked top to bottom; first match wins.
const SCENT_KEYWORDS = [
  ['engine_rumble',   ['engine', 'automotive', 'car', 'vehicle', 'motor', 'oil', 'rubber', 'tire']],
  ['clinical_gentle', ['clinical', 'healthcare', 'health', 'hospital', 'medical', 'pharmaceutical', 'sterile', 'antiseptic']],
  ['electronic_hum',  ['electronic', 'digital', 'tech', 'technology', 'software', 'server', 'data', 'ozone']],
  ['city_rain',       ['city', 'cities', 'urban', 'rain', 'street', 'pavement', 'asphalt', 'petrichor']],
  ['corporate_quiet', ['quiet', 'corporate', 'finance', 'financial', 'bank', 'banking', 'office', 'paper']],
]

function matchText(text) {
  const p = (text || '').toLowerCase()
  const has = (word) => new RegExp(`\\b${word}s?\\b`).test(p)

  for (const [scene, words] of SCENT_KEYWORDS) {
    if (words.some(has)) return SCENT_SCENE_MAP[scene]
  }
  return null
}

// Pass the most reliable text first — Nova's <entity> (e.g. "automotive
// manufacturing") names the industry, while <scent_prompt> often only lists
// smells ("machine oil, hot metal") that no keyword catches.
export function matchScentScene(...texts) {
  for (const text of texts) {
    const slot = matchText(text)
    if (slot) return slot
  }
  return SCENT_SCENE_MAP['default']
}
