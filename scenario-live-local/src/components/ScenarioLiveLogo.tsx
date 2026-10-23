import styles from './ScenarioLiveLogo.module.css'

interface ScenarioLiveLogoProps {
  width?: number
  className?: string
}

export default function ScenarioLiveLogo({ width = 180, className = '' }: ScenarioLiveLogoProps) {
  const fontSize = Math.round((width / 180) * 17)

  return (
    <span
      className={`${styles.logo} ${className}`}
      style={{ fontSize }}
      aria-label="Scenario Live"
      role="img"
    >
      <span className={styles.bracket} aria-hidden="true">[</span>
      <span className={styles.text}>Scenario Live</span>
      <span className={styles.bracket} aria-hidden="true">]</span>
    </span>
  )
}
