'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { services, type Appointment } from '@/lib/domain';
import { bookAction, cancelAction, type ActionState } from './actions';

type Dashboard = { activeSubscriptions: number; events: {
  id: string; name: string; data: Appointment; timestamp: string; cursor: string;
  deliveries: { subscriber: string; status: number | null; attempt: number; error: string | null }[];
}[] };

function Paw({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><ellipse cx="8" cy="10" rx="3.4" ry="4.5" transform="rotate(-25 8 10)"/><ellipse cx="15" cy="6.5" rx="3.3" ry="4.5"/><ellipse cx="23" cy="10" rx="3.3" ry="4.5" transform="rotate(25 23 10)"/><ellipse cx="28" cy="17" rx="2.8" ry="3.7" transform="rotate(35 28 17)"/><path d="M8 24c0-4 5-10 9-10s10 6 10 10c0 6-6 3-10 3s-9 3-9-3Z"/></svg>;
}

function DogIllustration() {
  return <svg viewBox="0 0 340 270" className="dog-art" role="img" aria-label="A happy dog fresh from a bubble bath">
    <circle cx="176" cy="139" r="107" fill="#e9f0d8"/><path d="M83 246h199" stroke="#c3cead" strokeWidth="3" strokeLinecap="round"/>
    <path d="M103 136c-13 25-20 68 5 90 29 27 110 26 137-2 17-17 12-58-1-86" fill="#c98d56"/>
    <path d="M126 87c-26-21-58-12-60 15-2 27 20 65 37 54l23-69ZM220 87c26-21 58-12 60 15 2 27-20 65-37 54l-23-69Z" fill="#815039"/>
    <path d="M108 109c0-40 130-40 130 0v45c0 61-130 61-130 0v-45Z" fill="#dfa46b"/>
    <path d="M151 87c-1 19 0 33 17 42 18-9 20-23 18-42" fill="#f8e7ca"/>
    <ellipse cx="145" cy="133" rx="5" ry="7" fill="#3c332b"/><ellipse cx="205" cy="133" rx="5" ry="7" fill="#3c332b"/>
    <ellipse cx="175" cy="159" rx="32" ry="22" fill="#fae8cd"/><path d="M165 152q10-8 20 0-1 14-10 14t-10-14" fill="#3c332b"/>
    <path d="M163 174q12 12 25 0" stroke="#694b39" strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M174 180v9q9 9 13-4v-9" fill="#d98383"/>
    <path d="m123 199 51 15 51-15-7 23-44 8-44-8Z" fill="#56745b"/><circle cx="174" cy="222" r="7" fill="#edc46a"/>
    <g fill="#fffdf5"><circle cx="112" cy="85" r="19"/><circle cx="136" cy="74" r="23"/><circle cx="165" cy="76" r="26"/><circle cx="195" cy="69" r="23"/><circle cx="222" cy="83" r="22"/><circle cx="155" cy="57" r="17"/></g>
    <g fill="none" stroke="#9aaf90" strokeWidth="2"><circle cx="62" cy="64" r="12"/><circle cx="275" cy="51" r="8"/><circle cx="286" cy="182" r="14"/><path d="M68 30v12m-6-6h12M259 112v16m-8-8h16"/></g>
  </svg>;
}

function CancelForm({ id, onCancel }: { id: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(cancelAction, {});
  return <form action={action} onSubmit={onCancel}><input type="hidden" name="id" value={id}/><button className="cancel-button" disabled={pending}>{pending ? 'Cancelling…' : 'Cancel appointment'}</button>{state.error && <p role="alert" className="form-error">{state.error}</p>}</form>;
}

export function BookingDashboard({ appointments, dashboard }: { appointments: Appointment[]; dashboard: Dashboard }) {
  const [values, setValues] = useState({ dogName: '', ownerName: '', service: services[0] as string, localTime: '' });
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await bookAction(previous, form);
    if (result.success) {
      setValues({ dogName: '', ownerName: '', service: services[0], localTime: '' });
      setShowConfirmation(true);
    }
    return result;
  }, {});
  const startsAt = values.localTime ? new Date(values.localTime).toISOString() : '';
  const router = useRouter();
  useEffect(() => { const timer = setInterval(() => router.refresh(), 5000); return () => clearInterval(timer); }, [router]);
  return <>
    <header className="site-header"><Link className="brand" href="/"><span className="brand-mark"><Paw/></span>otter paws<span className="brand-dot">✳</span></Link><span className="header-note">A little care. A lot of tail wags.</span><a href="#book" className="header-link">Book a visit ↗</a></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow">● THE GOOD-DOG GROOMING CLUB</span><h1>Fresh looks.<br/>Happy little <em>paws.</em></h1><p>Gentle grooming for your very best friend.<br/>Book a little pampering. We’ll bring the belly rubs.</p><div className="hero-tags"><span>♡ Kind, patient groomers</span><span>✧ Tail-wagging results</span></div></div><div className="hero-visual"><span className="art-caption">less scruff, more fluff.</span><DogIllustration/><span className="art-badge">100% good dogs<br/><strong>always welcome</strong></span></div></section>
      <div className="booking-grid">
        <section className="booking-card" id="book"><div className="section-kicker">01 / MAKE THEIR DAY</div><h2>A fresh start, booked.</h2><p className="section-description">Pick your pup’s perfect pamper session.</p>
          <form action={action} onSubmit={() => setShowConfirmation(false)} onReset={event => event.preventDefault()} className="booking-form"><div className="field-row"><label>Dog’s name<input name="dogName" placeholder="e.g. Biscuit" required maxLength={80} value={values.dogName} onChange={e => setValues({ ...values, dogName: e.target.value })}/></label><label>Your name<input name="ownerName" placeholder="e.g. Jamie" required maxLength={100} value={values.ownerName} onChange={e => setValues({ ...values, ownerName: e.target.value })}/></label></div>
            <label>The pampering plan<select name="service" value={values.service} onChange={e => setValues({ ...values, service: e.target.value })}>{services.map((service, i) => <option key={service} value={service}>{service} · {['45 min', '90 min', '30 min'][i]}</option>)}</select></label>
            <label>Date & time <span className="label-note">your local time</span><input type="datetime-local" required value={values.localTime} onChange={e => setValues({ ...values, localTime: e.target.value })}/></label><input type="hidden" name="startsAt" value={startsAt}/>
            <button className="primary-button" disabled={pending}>{pending ? 'Saving your spot…' : 'Book a happy-dog day'}<span>↗</span></button>
            <div aria-live="polite">{state.error && <p role="alert" className="form-error">{state.error}</p>}{state.success && showConfirmation && <p className="form-success">✓ {state.success}</p>}</div><p className="form-footnote">Plans change. Cancel anytime, no hard feelings.</p>
          </form>
        </section>
        <section className="appointments-section"><div className="appointment-heading"><div><div className="section-kicker">02 / COMING UP</div><h2>The pamper calendar</h2></div><span className="count-pill">{appointments.length} booked</span></div>
          <div className="appointment-list">{appointments.length === 0 ? <div className="empty-state"><span className="empty-paw"><Paw/></span><h3>A little quiet before the fluff.</h3><p>No upcoming visits just yet.<br/>Book a spot and we’ll save the good shampoo.</p></div> : appointments.map(appointment => <article className="appointment" key={appointment.id}><div className="date-tile"><span>{new Date(appointment.startsAt).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span><strong>{new Date(appointment.startsAt).getUTCDate()}</strong></div><div className="appointment-detail"><h3>{appointment.dogName}<span className="booked-badge">Booked</span></h3><p>{appointment.service} · {new Date(appointment.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC</p><p className="owner">with {appointment.ownerName}</p><CancelForm id={appointment.id} onCancel={() => setShowConfirmation(false)}/></div><Paw className="appointment-paw"/></article>)}</div>
          <div className="kind-note"><span>✦</span><p>A calmer kind of grooming.<br/><strong>One happy pup at a time.</strong></p></div>
        </section>
      </div>
      <section className="event-panel"><div className="event-header"><div><span className="section-kicker">BEHIND THE WAGS / SITE 01</span><h2>MCP event log <span className="live-badge">● LIVE</span></h2><p>Real bookings. Signed webhooks. A little internet magic.</p></div><div className="subscription-count"><strong>{dashboard.activeSubscriptions}</strong><span>active<br/>subscriptions</span></div></div>
        <div className="event-columns"><span>EVENT / CURSOR</span><span>DELIVERY ATTEMPTS</span><span>TIME (UTC)</span></div>
        {dashboard.events.length === 0 ? <p className="event-empty">Waiting for the first tail wag. Book an appointment to emit an event.</p> : dashboard.events.map(event => <div className="event-row" key={event.id}><div><span className={`event-indicator ${event.name.endsWith('cancelled') ? 'cancelled' : ''}`}/><code>{event.name}</code><small>#{event.cursor} · {event.data.dogName}</small></div><div className="delivery-list">{event.deliveries.length === 0 ? <span className="no-subscribers">No deliveries yet / no matching subscribers</span> : event.deliveries.map((delivery, i) => <span key={i} className={delivery.status && delivery.status >= 200 && delivery.status < 300 ? 'delivery-ok' : 'delivery-failed'} title={delivery.subscriber}>{delivery.subscriber.slice(0, 12)}… · #{delivery.attempt} · {delivery.status ?? 'network error'}</span>)}</div><time>{new Date(event.timestamp).toLocaleTimeString('en-GB', { timeZone: 'UTC' })}</time></div>)}
        <div className="event-footer"><code>POST /api/mcp</code><span>SEP-3415 · Standard Webhooks v1 · updates every 5s</span></div>
      </section>
    </main><footer className="site-footer"><Link className="brand footer-brand" href="/">otter paws ✳</Link><span>Good hair days are for dogs, too.</span><span>Made with care & a few treats.</span></footer>
  </>;
}
