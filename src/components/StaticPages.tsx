import { StaticPage } from './StaticPage'

export function About() {
  return (
    <StaticPage
      title="About"
      lede="Necronet is a small project building a place for friends to play and hang out."
    >
      <p>
        We are a tiny team focused on shipping features quickly, listening to the
        community, and keeping things lightweight. This page will grow as the project
        does.
      </p>
      <p>
        Want to follow along? Check the home page for news and updates.
      </p>
    </StaticPage>
  )
}

export function Contact() {
  return (
    <StaticPage
      title="Contact us"
      lede="Get in touch with the team."
    >
      <p>
        For general questions, partnership inquiries, or anything else, send us a note
        and we will get back to you.
      </p>
      <ul className="static-page-list">
        <li>
          General: <a href="mailto:hello@necronet.example">hello@necronet.example</a>
        </li>
        <li>
          Press: <a href="mailto:press@necronet.example">press@necronet.example</a>
        </li>
      </ul>
    </StaticPage>
  )
}

export function Careers() {
  return (
    <StaticPage
      title="Careers"
      lede="We are not actively hiring, but always open to talented people."
    >
      <p>
        If you are passionate about gaming, distributed systems, or community-driven
        software and would like to chat, drop us a line at{' '}
        <a href="mailto:careers@necronet.example">careers@necronet.example</a>.
      </p>
      <p>Open roles will be listed here when available.</p>
    </StaticPage>
  )
}

export function HelpCenter() {
  return (
    <StaticPage
      title="Help center"
      lede="Answers to common questions."
    >
      <h2 className="static-page-h2">Getting started</h2>
      <p>
        Create an account from the home page, verify your email, and you are ready to
        go. Account settings are under your avatar in the top right.
      </p>
      <h2 className="static-page-h2">Trouble signing in?</h2>
      <p>
        Use the &ldquo;Forgot password&rdquo; link on the login page. If you still
        cannot get in, contact us and we will sort it out.
      </p>
      <h2 className="static-page-h2">Still stuck?</h2>
      <p>
        Reach support at{' '}
        <a href="mailto:support@necronet.example">support@necronet.example</a>.
      </p>
    </StaticPage>
  )
}

export function Status() {
  return (
    <StaticPage
      title="Status"
      lede="Live status of the Necronet platform."
    >
      <p>
        Everything looks good. A real status dashboard is on the roadmap; until then,
        check this page for major incidents and follow the home page news for
        scheduled maintenance.
      </p>
      <ul className="static-page-list">
        <li>API: operational</li>
        <li>Auth: operational</li>
        <li>Web: operational</li>
      </ul>
    </StaticPage>
  )
}

export function BugReports() {
  return (
    <StaticPage
      title="Bug reports"
      lede="Found something broken? Tell us."
    >
      <p>
        We rely on community reports to keep things running smoothly. When filing a
        bug, please include:
      </p>
      <ul className="static-page-list">
        <li>What you were doing when it happened</li>
        <li>What you expected to happen</li>
        <li>What actually happened</li>
        <li>Browser and operating system</li>
      </ul>
      <p>
        Send reports to{' '}
        <a href="mailto:bugs@necronet.example">bugs@necronet.example</a>.
      </p>
    </StaticPage>
  )
}

export function PrivacyPolicy() {
  return (
    <StaticPage
      title="Privacy policy"
      lede="A short summary of what we collect and why. Last updated 2026-05-03."
    >
      <p>
        This is a placeholder privacy policy and is not yet legally binding. A formal
        version will be published before public launch.
      </p>
      <h2 className="static-page-h2">What we collect</h2>
      <ul className="static-page-list">
        <li>Account email and password (hashed)</li>
        <li>Profile fields you provide</li>
        <li>Basic usage analytics (when you opt in)</li>
      </ul>
      <h2 className="static-page-h2">What we do with it</h2>
      <p>
        We use this data to operate the service, communicate with you, and improve
        the product. We do not sell personal data.
      </p>
      <h2 className="static-page-h2">Contact</h2>
      <p>
        Questions? Email{' '}
        <a href="mailto:privacy@necronet.example">privacy@necronet.example</a>.
      </p>
    </StaticPage>
  )
}

export function TermsOfService() {
  return (
    <StaticPage
      title="Terms of service"
      lede="The rules for using Necronet. Last updated 2026-05-03."
    >
      <p>
        This is a placeholder document and is not yet legally binding. A formal
        version will be published before public launch.
      </p>
      <h2 className="static-page-h2">Your account</h2>
      <p>
        You are responsible for what happens under your account. Keep your password
        safe and do not share it.
      </p>
      <h2 className="static-page-h2">Acceptable use</h2>
      <p>
        Be decent to other users. Do not abuse the service, attempt to compromise
        other accounts, or violate applicable law. We may suspend accounts that do.
      </p>
      <h2 className="static-page-h2">Changes</h2>
      <p>
        We may update these terms over time. Material changes will be announced on
        the home page.
      </p>
    </StaticPage>
  )
}

export function CookiePolicy() {
  return (
    <StaticPage
      title="Cookie policy"
      lede="How we use cookies and similar storage. Last updated 2026-05-03."
    >
      <p>
        This is a placeholder document and is not yet legally binding. A formal
        version will be published before public launch.
      </p>
      <h2 className="static-page-h2">What we use</h2>
      <ul className="static-page-list">
        <li>Session cookies to keep you signed in</li>
        <li>A small set of preferences in local storage</li>
      </ul>
      <h2 className="static-page-h2">Third parties</h2>
      <p>
        We currently do not use third-party tracking or advertising cookies.
      </p>
    </StaticPage>
  )
}
