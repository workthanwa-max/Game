import './CountdownPage.css'

type CountdownPageProps = {
  value: number
}

export function CountdownPage({ value }: CountdownPageProps) {
  return (
    <section className="countdown-page-container" aria-live="polite">
      <div className="countdown-page-content">
        <p className="countdown-eyebrow">เตรียมตัว</p>
        <strong className="countdown-value">{value}</strong>
      </div>
    </section>
  )
}
