import { useParams, Link } from 'react-router-dom'
import ScenarioLiveHeader from '../components/scenario-live-header/Header'
import SpaceBackground from '../components/SpaceBackground'
import styles from './Insights.module.css'

interface Topic {
  id: string
  label: string
  color: string
  summary: string
}

// Mock data — TODO: wire up to real API fetch by sessionId
const getMockInsights = (_sessionId: string) => ({
  date: new Date(Date.now() - 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  duration: '15 min',
  summary:
    'Nova had a great conversation with you about sustainable operations and innovative thinking. Key topics included supply chain optimization and future-ready practices.',
  topics: [
    {
      id: 'sustainability',
      label: 'Sustainability',
      color: 'var(--topic-sustainability)',
      summary: 'You discussed eco-friendly supply chain strategies and carbon reduction initiatives.',
    },
    {
      id: 'operations',
      label: 'Operations',
      color: 'var(--topic-operations)',
      summary: 'Process improvements and efficiency metrics were explored in depth.',
    },
    {
      id: 'innovation',
      label: 'Innovation',
      color: 'var(--topic-innovation)',
      summary: 'Future technologies and emerging opportunities were key discussion points.',
    },
  ] as Topic[],
})

export default function Insights() {
  const { sessionId } = useParams()
  const insights = getMockInsights(sessionId || 'N/A')

  return (
    <div className={styles.page}>
      <SpaceBackground />
      <ScenarioLiveHeader />

      <main className={styles.main}>
        <div className={styles.container}>
          <Link to="/presenter" className={styles.backLink}>
            ← Back
          </Link>

          <div className={styles.header}>
            <div className={styles.pills}>
              <span className={styles.pill}>{insights.date}</span>
              <span className={styles.pill}>{insights.duration}</span>
            </div>
            <h1>Your conversation with Nova</h1>
          </div>

          <section className={styles.summaryCard}>
            <p>{insights.summary}</p>
          </section>

          <section className={styles.topicsSection}>
            <h2>Topics explored</h2>
            <div className={styles.topicsGrid}>
              {insights.topics.map((topic) => (
                <div key={topic.id} className={styles.topicCard}>
                  <div
                    className={styles.topicDot}
                    style={{ backgroundColor: topic.color }}
                  />
                  <h3 style={{ color: topic.color }}>{topic.label}</h3>
                  <p>{topic.summary}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
