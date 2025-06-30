'use client';

import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { BrandLarge } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MicrosoftIcon } from '@/components/icons/microsoft-icon';
import { GoogleIcon } from '@/components/icons/google-icon';
import { PasswordInput } from '@/components/ui/password-input';
import Link from 'next/link';

export function LoginForm({
  onSignIn,
  onResetPassword,
  onGoogleSignIn,
  onMicrosoftSignIn,
  errorMessage,
  messageType = 'error',
}: {
  onSignIn: (formData: FormData) => Promise<void>;
  onResetPassword: (formData: FormData) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onMicrosoftSignIn: () => Promise<void>;
  errorMessage: string | null;
  messageType?: 'error' | 'success' | 'warning';
}) {
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [showPasswordStep, setShowPasswordStep] = useState<boolean>(false);

  const getMessageStyles = (type: 'error' | 'success' | 'warning') => {
    switch (type) {
      case 'error':
        return 'text-red-500 bg-red-50 dark:bg-red-950/50';
      case 'success':
        return 'text-green-500 bg-green-50 dark:bg-green-950/50';
      case 'warning':
        return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50';
      default:
        return 'text-red-500 bg-red-50 dark:bg-red-950/50';
    }
  };

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const emailInput = document.getElementById('email') as HTMLInputElement;
    if (emailInput?.value) {
      setEmail(emailInput.value);
      setShowPasswordStep(true);
    }
  };

  return (
    <div>
      <div className="animate-in flex w-full flex-1 flex-col justify-center gap-2">
        <BrandLarge />
        <span className="text-center text-2xl font-bold">Welcome back</span>
      </div>

      {!showPasswordStep ? (
        <form
          onSubmit={handleEmailContinue}
          className="animate-in mt-4 flex w-full flex-1 flex-col justify-center gap-3"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </div>

          {errorMessage && (
            <div
              className={`flex items-center gap-2 rounded-md p-2 text-sm ${getMessageStyles(messageType)}`}
            >
              <span>{errorMessage}</span>
            </div>
          )}

          <Button type="submit" className="mt-2 h-12 rounded-2xl">
            Continue
          </Button>

          <div className="text-muted-foreground mt-2 text-center text-sm">
            <span>Don&apos;t have an account? </span>
            <Link
              href="/signup"
              className="hover:text-primary underline font-medium"
            >
              Sign up
            </Link>
          </div>
        </form>
      ) : (
        <form className="animate-in mt-4 flex w-full flex-1 flex-col justify-center gap-3">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                readOnly
                className="bg-muted/50 text-foreground cursor-not-allowed h-12 rounded-2xl"
              />
              <button
                type="button"
                onClick={() => setShowPasswordStep(false)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-800 hover:underline bg-background px-2 py-1 rounded"
              >
                Change
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="h-12">
              <PasswordInput className="rounded-2xl" />
            </div>
          </div>

          <div className="text-muted-foreground mt-2 text-center text-sm">
            <span>Forgot your password? </span>
            <Button
              variant="link"
              className="p-0 text-sm h-auto"
              formAction={onResetPassword}
              data-testid="reset-password-button"
            >
              Reset
            </Button>
          </div>

          {errorMessage && (
            <div
              className={`flex items-center gap-2 rounded-md p-2 text-sm ${getMessageStyles(messageType)}`}
            >
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="mt-2 flex justify-center">
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onSuccess={(token) => {
                  setCaptchaToken(token);
                }}
                options={{
                  theme: 'auto',
                }}
                className="flex justify-center"
              />
            )}
          </div>

          <input
            type="hidden"
            name="cf-turnstile-response"
            value={captchaToken}
          />

          <Button
            type="submit"
            formAction={onSignIn}
            data-testid="signin-button"
            className="w-full h-12 rounded-2xl"
          >
            Sign In
          </Button>

          <div className="text-muted-foreground mt-2 text-center text-sm">
            <span>Don&apos;t have an account? </span>
            <Link
              href="/signup"
              className="hover:text-primary underline font-medium"
            >
              Sign up
            </Link>
          </div>
        </form>
      )}

      <div className="mt-4 flex items-center">
        <div className="grow border-t border-gray-300" />
        <span className="text-muted-foreground mx-4 text-sm">OR</span>
        <div className="grow border-t border-gray-300" />
      </div>

      <form
        action={onGoogleSignIn}
        className="animate-in mt-2 flex w-full flex-1 flex-col justify-center gap-2"
      >
        <Button variant="default" type="submit" className="h-12 rounded-2xl">
          <GoogleIcon className="mr-2" width={16} height={16} />
          Continue with Google
        </Button>
      </form>

      <form
        action={onMicrosoftSignIn}
        className="animate-in mt-2 flex w-full flex-1 flex-col justify-center gap-2"
      >
        <Button
          variant="default"
          className="mt-2 h-12 rounded-2xl"
          type="submit"
        >
          <MicrosoftIcon className="mr-2" width={16} height={16} />
          Continue with Microsoft
        </Button>
      </form>

      <div className="text-muted-foreground mt-4 text-center text-sm sm:px-0">
        <span>By using PentestGPT, you agree to our </span>
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary underline"
        >
          Terms of Use
        </a>
      </div>
    </div>
  );
}
