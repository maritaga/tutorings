import Link from 'next/link';

export const metadata = { title: 'Terms · tutorings' };

export default function Terms() {
  return (
    <main className="page legal">
      <header className="brand">
        <h1>tutorings</h1>
        <p>TERMS OF SERVICE</p>
      </header>
      <p>By booking a tutoring you agree to the following:</p>
      <h2 className="title">Bookings</h2>
      <p>Tutorings last from 1 to 3.5 hours and are confirmed when you book an available time.</p>
      <h2 className="title">Changes and cancellations</h2>
      <p>You can change or cancel a tutoring from &ldquo;Check my tutorings&rdquo; before it starts. New times must be available.</p>
      <h2 className="title">Your PIN</h2>
      <p>Keep your PIN private. Anyone with your name and PIN can see, change and cancel your tutorings.</p>
      <p>
        <Link href="/" className="link">← Back to tutorings</Link>
      </p>
    </main>
  );
}
