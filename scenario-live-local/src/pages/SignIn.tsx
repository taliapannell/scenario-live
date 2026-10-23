import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SpaceBackground from '../components/SpaceBackground'
import styles from './SignIn.module.css'

export default function SignIn() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (sessionStorage.getItem('presenter-auth') === 'true') {
      navigate('/presenter', { replace: true })
    }
  }, [navigate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    sessionStorage.setItem('presenter-auth', 'true')
    setTimeout(() => {
      navigate('/presenter', { replace: true })
    }, 1000)
  }

  return (
    <div className={styles.page}>
      <SpaceBackground />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.badge}>[ Scenario Live ]</div>

          <h1 className={styles.heading}>Developer Sign In</h1>
          <p className={styles.subheading}>Presenter mode · Accenture internal</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="username" className={styles.label}>USERNAME</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password" className={styles.label}>PASSWORD</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className={styles.button} disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className={styles.footer}>Secured by AWS Cognito (placeholder)</p>
        </div>
      </main>
    </div>
  )
}
