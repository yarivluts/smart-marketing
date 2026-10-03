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
  Mail,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { authErrorMessageKey, type AuthErrorMessageKey } from '@/lib/auth/auth-error';
import { resolveRedirectTarget } from '@/lib/auth/redirect-target';
import { PpButton } from '@/components/pastel/primitives';
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
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
      className={cn('mx-auto flex w-full flex-col gap-6 py-2', className)}
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pp-primary text-pp-on-primary shadow-pp-candy mb-3">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="font-pp-display text-pp-headline-lg font-bold tracking-tight text-pp-on-surface">
          {mode === 'signup' ? t('signUpTitle') : t('signInTitle')}
        </h1>
        <p className="text-pp-body-sm text-pp-on-surface-variant mt-1 max-w-sm">
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
      <div role="tablist" className="flex rounded-full bg-pp-surface-container p-1 shadow-inner">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          data-testid="tab-signin"
          onClick={() => handleTabChange('signin')}
          className={cn(
            'flex-1 rounded-full py-2 text-pp-label-md font-semibold transition-all cursor-pointer text-center',
            mode === 'signin'
              ? 'bg-pp-surface-container-lowest text-pp-primary shadow-pp-candy'
              : 'text-pp-on-surface-variant hover:text-pp-on-surface',
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
            'flex-1 rounded-full py-2 text-pp-label-md font-semibold transition-all cursor-pointer text-center',
            mode === 'signup'
              ? 'bg-pp-surface-container-lowest text-pp-primary shadow-pp-candy'
              : 'text-pp-on-surface-variant hover:text-pp-on-surface',
          )}
        >
          {t('signUp')}
        </button>
      </div>

      {/* Google SSO Button */}
      <button
        type="button"
        disabled={submitting || isGoogleLoading}
        onClick={handleGoogleSignIn}
        className="w-full flex items-center justify-center gap-2.5 h-11 rounded-2xl bg-pp-surface-container hover:bg-pp-surface-container-high text-pp-on-surface text-pp-label-md font-semibold transition-all duration-150 active:scale-[0.98] shadow-xs disabled:opacity-50 cursor-pointer"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-pp-primary" />
        ) : (
          <GoogleIcon />
        )}
        <span>{t('signInWithGoogle')}</span>
      </button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-pp-outline-variant/40" />
        <span className="absolute bg-pp-surface-container-lowest px-3 text-pp-label-sm font-semibold text-pp-outline uppercase tracking-wider">
          {locale === 'he' ? 'או באמצעות אימייל' : 'or with corporate email'}
        </span>
      </div>

      {/* Email & Password Form */}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {/* Email Field */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-pp-label-md font-semibold text-pp-on-surface" htmlFor="email">
              {t('emailLabel')}
            </label>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-pp-secondary">
              <CheckCircle2 className="h-3 w-3" />
              <span>Assigned Seat</span>
            </span>
          </div>
          <div className="relative flex items-center">
            <Mail className="absolute start-3.5 h-4 w-4 text-pp-outline pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full ps-10 pe-4 py-2.5 bg-pp-surface-container-low text-pp-on-surface placeholder:text-pp-outline text-pp-body-md rounded-2xl border-none focus:bg-pp-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-pp-primary/40 transition-all"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-pp-label-md font-semibold text-pp-on-surface" htmlFor="password">
              {t('passwordLabel')}
            </label>
            {mode === 'signin' && (
              <span className="text-[12px] font-medium text-pp-primary hover:underline cursor-pointer">
                {locale === 'he' ? 'שכחת סיסמה?' : 'Forgot password?'}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <Key className="absolute start-3.5 h-4 w-4 text-pp-outline pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full ps-10 pe-11 py-2.5 bg-pp-surface-container-low text-pp-on-surface placeholder:text-pp-outline text-pp-body-md rounded-2xl border-none focus:bg-pp-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-pp-primary/40 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-3 text-pp-outline hover:text-pp-on-surface transition-colors cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Remember me & 2FA indicator */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="h-4 w-4 rounded border-pp-outline-variant text-pp-primary focus:ring-pp-primary cursor-pointer"
            />
            <span className="text-pp-body-sm text-pp-on-surface-variant">
              {t('rememberDevice')}
            </span>
          </label>
          <div className="flex items-center gap-1 text-pp-label-sm font-semibold text-pp-outline">
            <ShieldCheck className="h-3.5 w-3.5 text-pp-secondary" />
            <span>{t('twoFactorEnforced')}</span>
          </div>
        </div>

        {/* Error Alert Box */}
        {errorKey ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-2xl bg-pp-error-container p-3 text-pp-body-sm text-pp-on-error-container font-medium"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t(errorKey)}</span>
          </div>
        ) : null}

        {/* Submit CTA */}
        <PpButton
          type="submit"
          variant="primary"
          disabled={submitting || isGoogleLoading}
          className="w-full h-12 rounded-full font-pp-display text-pp-body-lg font-bold shadow-pp-candy active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{locale === 'he' ? 'מעבד...' : 'Processing...'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>{mode === 'signup' ? t('signUp') : t('signIn')}</span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </div>
          )}
        </PpButton>
      </form>

      {/* Switch Mode Footer Link */}
      <p className="text-center text-pp-body-sm text-pp-on-surface-variant">
        {mode === 'signup' ? (
          <Link
            href="/login"
            onClick={(e) => {
              if (onModeChange) {
                e.preventDefault();
                handleTabChange('signin');
              }
            }}
            className="font-medium text-pp-primary hover:underline"
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
            className="font-medium text-pp-primary hover:underline"
          >
            {t('needAccount')}
          </Link>
        )}
      </p>

      {/* Security & Governance Badges */}
      <div className="mt-2 pt-4 border-t border-pp-surface-container flex flex-col gap-3">
        <div className="flex items-center justify-between text-pp-label-sm font-semibold text-pp-outline">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-pp-secondary" />
            <span>SOC-2 Type II</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-pp-secondary" />
            <span>ISO 27001 Certified</span>
          </div>
          <div className="flex items-center gap-1">
            <Lock className="h-3.5 w-3.5 text-pp-secondary" />
            <span>E2E Encrypted</span>
          </div>
        </div>
        <p className="text-center text-[11px] text-pp-outline leading-relaxed">
          {t('termsNotice')}
        </p>
      </div>
    </div>
  );
}
