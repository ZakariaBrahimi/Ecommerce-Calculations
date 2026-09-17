import { connection } from 'next/server';
import { LiveDashboard } from './LiveDashboard';

export default async function LivePage() {
  // Forces dynamic rendering so the nonce-based CSP (src/middleware.ts)
  // applies here too - a statically prerendered page never gets a nonce and
  // its inline hydration scripts would be silently blocked by the browser.
  await connection();
  return <LiveDashboard />;
}
