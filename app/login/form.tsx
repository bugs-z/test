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

export function LoginForm({
  onSignIn,
  onSignUp,
  onResetPassword,
  onGoogleSignIn,
  onMicrosoftSignIn,
  errorMessage,
  messageType = 'error',
}: {
  onSignIn: (formData: FormData) => Promise<void>;
  onSignUp: (formData: FormData) => Promise<void>;
  onResetPassword: (formData: FormData) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onMicrosoftSignIn: () => Promise<void>;
  errorMessage: string | null;
  messageType?: 'error' | 'success' | 'warning';
}) {
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [isSignUp, setIsSignUp] = useState(false);

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

  return (
    <div>
      <form
        action={onGoogleSignIn}
        className="animate-in flex w-full flex-1 flex-col justify-center gap-2"
      >
        <BrandLarge />
        <span className="text-center text-xl font-bold">
          {isSignUp ? 'Sign up to PentestGPT' : 'Login to PentestGPT'}
        </span>
        <Button variant="default" className="mt-4" type="submit">
          <GoogleIcon className="mr-2" width={16} height={16} />
          Continue with Google
        </Button>
      </form>

      <form
        action={onMicrosoftSignIn}
        className="animate-in mt-2 flex w-full flex-1 flex-col justify-center gap-2"
      >
        <Button variant="default" className="mt-2" type="submit">
          <MicrosoftIcon className="mr-2" width={16} height={16} />
          Continue with Microsoft
        </Button>
      </form>

      <div className="mt-4 flex items-center">
        <div className="grow border-t border-gray-300" />
        <span className="text-muted-foreground mx-4 text-sm">Or</span>
        <div className="grow border-t border-gray-300" />
      </div>

      <form
        action={isSignUp ? onSignUp : onSignIn}
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
          />
        </div>
        <div className="mt-2 space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput />
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
          data-testid={isSignUp ? 'signup-button' : 'signin-button'}
        >
          {isSignUp ? 'Sign Up' : 'Login'}
        </Button>

        <div className="text-muted-foreground mt-2 text-center text-sm">
          {isSignUp ? (
            <>
              <span>Already have an account? </span>
              <Button
                variant="link"
                className="p-0 text-sm"
                onClick={() => setIsSignUp(false)}
              >
                Login
              </Button>
            </>
          ) : (
            <>
              <div>
                <span>Don&apos;t have an account? </span>
                <Button
                  variant="link"
                  className="p-0 text-sm"
                  onClick={() => setIsSignUp(true)}
                >
                  Sign Up
                </Button>
              </div>
              <div className="mt-2">
                <span>Forgot your password? </span>
                <Button
                  variant="link"
                  className="p-0 text-sm"
                  formAction={onResetPassword}
                  data-testid="reset-password-button"
                >
                  Reset
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="text-muted-foreground mt-2 text-center text-sm sm:px-0">
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
      </form>
    </div>
  );
}
