import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/session';

export default async function RootPage() {
  const token = readSessionToken(await cookies());
  redirect(token ? '/dashboard' : '/login');
}
