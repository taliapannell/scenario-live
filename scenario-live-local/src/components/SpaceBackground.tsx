import { useMemo } from 'react'
import styles from './SpaceBackground.module.css'

const STAR_COUNT = 120
const SHOOTING_COUNT = 5

export default function SpaceBackground() {
  const stars = useMemo(() =>
    Array.from({ length: STAR_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() < 0.75 ? 1 : Math.random() < 0.6 ? 1.5 : 2,
      opacity: 0.12 + Math.random() * 0.25,
      duration: 4 + Math.random() * 6,
      delay: -(Math.random() * 8),
    }))
  , [])

  const shootingStars = useMemo(() =>
    Array.from({ length: SHOOTING_COUNT }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 70,
      y: 5 + Math.random() * 40,
      duration: 6 + Math.random() * 6,
      delay: -(Math.random() * 20),
    }))
  , [])

  return (
    <div className={styles.container} aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.id}
          className={styles.star}
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
      {shootingStars.map((s) => (
        <span
          key={s.id}
          className={styles.shootingStar}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
