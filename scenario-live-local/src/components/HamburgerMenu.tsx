import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeToggleButton from './ThemeToggleButton'
import styles from './HamburgerMenu.module.css'

const navLinks = [
  { label: 'Presenter', to: '/presenter' },
]

function useTypewriter(text: string, active: boolean, delay: number = 0) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!active) {
      setDisplayed('')
      setDone(false)
      return
    }

    let i = 0
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          clearInterval(interval)
          setDone(true)
        }
      }, 45)
    }, delay)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [active, text, delay])

  return { displayed, done }
}

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const { displayed: navTitle, done: navDone } = useTypewriter('NAVIGATION', open, 150)
  const { displayed: footerText, done: footerDone } = useTypewriter('Scenario Live', open, 150 + navLinks.length * 120 + 80)

  return (
    <>
      <button
        className={styles.burger}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <span className={`${styles.line} ${open ? styles.lineTop : ''}`} />
        <span className={`${styles.line} ${open ? styles.lineMid : ''}`} />
        <span className={`${styles.line} ${open ? styles.lineBot : ''}`} />
      </button>

      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
        onClick={() => setOpen(false)}
      />

      <nav className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>
            {navTitle}{!navDone && <span className={styles.cursor}>|</span>}
          </span>
          <ThemeToggleButton />
        </div>

        <div className={styles.divider} />

        <ul className={styles.navList}>
          {navLinks.map((link, i) => (
            <NavItem
              key={link.to}
              link={link}
              active={location.pathname === link.to}
              open={open}
              delay={150 + i * 120}
              onClick={() => setOpen(false)}
            />
          ))}
        </ul>

        <div className={styles.sidebarFooter}>
          <span className={styles.footerText}>
            {footerText}{!footerDone && <span className={styles.cursor}>|</span>}
          </span>
        </div>
      </nav>
    </>
  )
}

function NavItem({
  link,
  active,
  open,
  delay,
  onClick,
}: {
  link: { label: string; to: string }
  active: boolean
  open: boolean
  delay: number
  onClick: () => void
}) {
  const { displayed: label, done } = useTypewriter(link.label, open, delay)

  return (
    <li>
      <Link
        to={link.to}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
        onClick={onClick}
      >
        <span className={styles.navLinkDot} />
        {label}{!done && <span className={styles.cursor}>|</span>}
      </Link>
    </li>
  )
}
