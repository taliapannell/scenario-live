import { Link } from 'react-router-dom'
import ScenarioLiveLogo from './ScenarioLiveLogo'
import HamburgerMenu from '../HamburgerMenu'
import accentureLogo from '../../assets/accenture-logo.png'
import styles from './Header.module.css'

export default function ScenarioLiveHeader() {
  return (
    <header className={styles.header}>
      <img
        src={accentureLogo}
        alt="Accenture"
        className={styles.accentureLogo}
        width={40}
        height={40}
      />

      <Link to="/presenter" className={styles.logoLink}>
        <ScenarioLiveLogo width={230} />
      </Link>

      <div className={styles.rightControls}>
        <HamburgerMenu />
      </div>
    </header>
  )
}
