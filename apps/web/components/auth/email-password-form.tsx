'use client';

import * as React from 'react';
import { useState, type FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { authErrorMessageKey, type AuthErrorMessageKey } from '@/lib/auth/auth-error';
import { resolveRedirectTarget } from '@/lib/auth/redirect-target';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface EmailPasswordFormProps {
  mode: 'signin' | 'signup';
  className?: string;
  onModeChange?: (mode: 'signin' | 'signup') => void;
}

/** Google Logo Icon Component */
function GoogleIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={cn('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

/** Shared elevated email/password form for `/login` and `/signup`, plus Google SSO. */
export function EmailPasswordForm({
  mode: initialMode,
  className,
  onModeChange,
}: EmailPasswordFormProps): React.ReactElement {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const isRtl = locale === 'he';
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<AuthErrorMessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function handleTabChange(newMode: 'signin' | 'signup') {
    setMode(newMode);
    setErrorKey(null);
    if (onModeChange) {
      onModeChange(newMode);
    }
  }

  function redirectAfterAuth(): void {
    router.push(resolveRedirectTarget(searchParams?.get('from')));
  }

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
      redirectAfterAuth();
    } catch (error) {
      setErrorKey(authErrorMessageKey(error));
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setErrorKey(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      redirectAfterAuth();
    } catch (error) {
      setErrorKey(authErrorMessageKey(error));
      setIsGoogleLoading(false);
    }
  }

  return (
    <div
      data-testid="auth-form-card"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn('mx-auto flex w-full max-w-md flex-col gap-6 py-8', className)}
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25 mb-4">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {mode === 'signup' ? t('signUpTitle') : t('signInTitle')}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {mode === 'signup'
            ? locale === 'he'
              ? 'הצטרף לאלפי מנהלי שיווק המאיצים צמיחה עם GrowthOS'
              : 'Join high-growth marketing teams scaling with autonomous AI'
            : locale === 'he'
              ? 'התחבר לחשבונך כדי לגשת ללוח הבקרה ומרכז האוטומציה'
              : 'Sign in to access your cockpit dashboards and automation hub'}
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div role="tablist" className="flex rounded-xl bg-muted/60 p-1 border border-border/60">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          data-testid="tab-signin"
          onClick={() => handleTabChange('signin')}
          className={cn(
            'flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer',
            mode === 'signin'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('signIn')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          data-testid="tab-signup"
          onClick={() => handleTabChange('signup')}
          className={cn(
            'flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer',
            mode === 'signup'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('signUp')}
        </button>
      </div>

      {/* Google SSO Button */}
      <Button
        type="button"
        variant="outline"
        disabled={submitting || isGoogleLoading}
        onClick={handleGoogleSignIn}
        className="w-full flex items-center justify-center gap-2.5 h-11 rounded-xl border-border bg-card hover:bg-muted/50 text-xs font-semibold shadow-xs"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        <span>{t('signInWithGoogle')}</span>
      </Button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-border/80" />
        <span className="absolute bg-card px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {locale === 'he' ? 'או באמצעות אימייל' : 'or with email'}
        </span>
      </div>

      {/* Email & Password Form */}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="email">
            {t('emailLabel')}
          </label>
          <div className="relative">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 rounded-xl bg-card text-xs focus:ring-1 focus:ring-primary shadow-inner"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground" htmlFor="password">
              {t('passwordLabel')}
            </label>
            {mode === 'signin' && (
              <span className="text-[11px] text-primary hover:underline cursor-pointer">
                {locale === 'he' ? 'שכחת סיסמה?' : 'Forgot password?'}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 rounded-xl bg-card text-xs focus:ring-1 focus:ring-primary shadow-inner"
            />
          </div>
        </div>

        {/* Error Alert Box */}
        {errorKey ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-medium"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t(errorKey)}</span>
          </div>
        ) : null}

        {/* Submit CTA */}
        <Button
          type="submit"
          disabled={submitting || isGoogleLoading}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-soft hover:bg-primary/90 transition-all active:scale-[0.98] cursor-pointer mt-1"
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{locale === 'he' ? 'מעבד...' : 'Processing...'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span>{mode === 'signup' ? t('signUp') : t('signIn')}</span>
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </div>
          )}
        </Button>
      </form>

      {/* Switch Mode Footer Link */}
      <p className="text-center text-xs text-muted-foreground">
        {mode === 'signup' ? (
          <Link
            href="/login"
            onClick={(e) => {
              if (onModeChange) {
                e.preventDefault();
                handleTabChange('signin');
              }
            }}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {t('haveAccount')}
          </Link>
        ) : (
          <Link
            href="/signup"
            onClick={(e) => {
              if (onModeChange) {
                e.preventDefault();
                handleTabChange('signup');
              }
            }}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {t('needAccount')}
          </Link>
        )}
      </p>
    </div>
  );
}
