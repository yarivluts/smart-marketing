'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { authErrorMessageKey, type AuthErrorMessageKey } from '@/lib/auth/auth-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EmailPasswordFormProps {
  mode: 'signin' | 'signup';
}

/** Shared email/password form for `/login` and `/signup`, plus a Google SSO button. */
export function EmailPasswordForm({ mode }: EmailPasswordFormProps): React.ReactElement {
  const t = useTranslations('Auth');
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<AuthErrorMessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorKey(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      router.push('/dashboard');
    } catch (error) {
      setErrorKey(authErrorMessageKey(error));
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setErrorKey(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (error) {
      setErrorKey(authErrorMessageKey(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === 'signup' ? t('signUpTitle') : t('signInTitle')}
      </h1>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            {t('emailLabel')}
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="password">
            {t('passwordLabel')}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {errorKey ? (
          <p role="alert" className="text-sm text-destructive">
            {t(errorKey)}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {mode === 'signup' ? t('signUp') : t('signIn')}
        </Button>
      </form>
      <Button type="button" variant="outline" disabled={submitting} onClick={handleGoogleSignIn}>
        {t('signInWithGoogle')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'signup' ? (
          <Link href="/login">{t('haveAccount')}</Link>
        ) : (
          <Link href="/signup">{t('needAccount')}</Link>
        )}
      </p>
    </div>
  );
}
