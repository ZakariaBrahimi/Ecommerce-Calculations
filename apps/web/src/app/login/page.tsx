import { connection } from 'next/server';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  // Forces dynamic rendering - the nonce-based CSP (src/middleware.ts) only
  // exists on a real request, so a statically prerendered page never gets
  // one and its own inline hydration scripts get silently blocked by the
  // browser (see docs/production-deployment.md). A route segment config
  // export has no effect from a 'use client' module, hence this server
  // wrapper around the actual (client) form.
  await connection();
  return <LoginForm />;
}
