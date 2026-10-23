import { useParams, useLocation } from 'react-router-dom'
import ScenarioLiveHeader from '../components/scenario-live-header/Header'
import SpaceBackground from '../components/SpaceBackground'
import styles from './Conversation.module.css'

interface ConversationState {
  time?: string
  duration?: string
  title?: string
}

interface ScenarioLivePageProps {
  onHome?: () => void
}

export default function ScenarioLivePage({ onHome }: ScenarioLivePageProps) {
  const { userId } = useParams<{ userId: string }>()
  const { state } = useLocation()
  const { time, duration, title } = (state as ConversationState) ?? {}

  return (
    <div className={styles.page}>
      <ScenarioLiveHeader />
      <SpaceBackground />

      <main className={styles.main}>
        <div className={styles.container}>
          {userId && <p className={styles.sessionId}>{userId}</p>}
          <h1 className={styles.heading}>Your Conversational Insights</h1>

          {(title || time || duration) && (
            <div className={styles.pills}>
              {title && <span className={styles.pill}>{title}</span>}
              {time && <span className={styles.pill}>{time}</span>}
              {duration && <span className={styles.pill}>{duration}</span>}
            </div>
          )}
        </div>
      </main>

      {onHome && (
        <footer className={styles.footer}>
          <button className={styles.footerLink} onClick={onHome}>
            makerslab.com
          </button>
        </footer>
      )}
    </div>
  )
}
