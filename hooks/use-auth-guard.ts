import { auth } from '@/firebase';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';

export function useAuthGuard(redirectTo: string = '/login') {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
      if (!u) router.replace(redirectTo as any);
    });
    return unsub;
  }, [router, redirectTo]);

  return { user, initializing };
}
