const AUDIO_SCENE_MAP = {
  'engine_rumble':   'automotive.mp3',
  'corporate_quiet': 'finance.mp3',
  'clinical_gentle': 'healthcare.mp3',
  'electronic_hum':  'tech-innovation.mp3',
  'city_energy':     'nyc-urban.mp3',
  'default':         "Maker's Lab (Default).mp3",
}

const AUDIO_TOPIC_MAP = {
  'sustainability': 'sustainability.mp3',
  'innovation':     'tech-innovation.mp3',
  'operations':     'finance.mp3',
  'default':        "Maker's Lab (Default).mp3",
}

export function matchAudioScene(prompt) {
  const p = (prompt || '').toLowerCase()

  if (p.includes('engine') || p.includes('automotive')) return AUDIO_SCENE_MAP['engine_rumble']
  if (p.includes('clinical') || p.includes('healthcare')) return AUDIO_SCENE_MAP['clinical_gentle']
  if (p.includes('electronic') || p.includes('digital')) return AUDIO_SCENE_MAP['electronic_hum']
  if (p.includes('city') || p.includes('urban')) return AUDIO_SCENE_MAP['city_energy']
  if (p.includes('quiet') || p.includes('corporate')) return AUDIO_SCENE_MAP['corporate_quiet']

  return AUDIO_SCENE_MAP['default']
}

export function matchAudioTopic(topic) {
  return AUDIO_TOPIC_MAP[topic?.toLowerCase()] ?? AUDIO_TOPIC_MAP['default']
}
