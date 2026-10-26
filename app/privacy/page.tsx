import Link from 'next/link';

export const metadata = { title: 'Privacy · tutorings' };

export default function Privacy() {
  return (
    <main className="page legal">
      <header className="brand">
        <h1>tutorings</h1>
        <p>PRIVACY POLICY</p>
      </header>
      <p>This app lets students book tutorings with Marita.</p>
      <h2 className="title">What we collect</h2>
      <p>When you book, we save your name, email, a 4-digit PIN (stored encrypted) and the date and time of your tutoring.</p>
      <h2 className="title">How we use it</h2>
      <p>
        Only to manage your tutorings: to show you your bookings, handle changes and cancellations and send you a Google Calendar invite.
        We don't sell or share your information, and we don't use it for advertising.
      </p>
      <h2 className="title">Google Calendar</h2>
      <p>
        The app connects only to Marita&apos;s own Google Calendar. It reads her busy times so students can&apos;t book over them, and it
        creates, moves or deletes the tutoring events. Event details from her calendar are never shown to students.
      </p>
      <h2 className="title">Deleting your data</h2>
      <p>Ask Marita and she will delete your bookings and information.</p>
      <p>
        <Link href="/" className="link">← Back to tutorings</Link>
      </p>
    </main>
  );
}
