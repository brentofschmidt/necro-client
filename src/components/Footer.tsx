import { Link } from 'react-router-dom'

type FooterLink = { label: string; to: string }
type FooterColumn = { title: string; links: FooterLink[] }

const COLUMNS: FooterColumn[] = [
  {
    title: 'Necronet',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact us', to: '/contact' },
      { label: 'Careers', to: '/careers' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help center', to: '/help' },
      { label: 'Status', to: '/status' },
      { label: 'Bug reports', to: '/bugs' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', to: '/privacy' },
      { label: 'Terms of service', to: '/terms' },
      { label: 'Cookie policy', to: '/cookies' },
    ],
  },
]

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-columns">
          {COLUMNS.map((col) => (
            <div key={col.title} className="site-footer-column">
              <h3 className="site-footer-heading">{col.title}</h3>
              <ul className="site-footer-list">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="site-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="site-footer-bottom">
          <span className="logo logo-sm">
            NECRO<span>NET</span>
          </span>
          <span className="site-footer-copy">© {year} Necronet. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
