import { createClient } from '@/lib/supabase/server';
import { get } from '@vercel/edge-config';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAuthRateLimit } from '@/lib/server/check-auth-ratelimit';
import { SignUpForm } from './form';

export const metadata: Metadata = {
  title: 'Sign Up',
};

const errorMessages: Record<string, string> = {
  '1': 'Email is not allowed to sign up.',
  '2': 'Check your email to continue the sign-in process.',
  '5': 'Signup requires a valid password.',
  '6': 'Your password must be at least 8 characters long.',
  '7': 'Your password must include both uppercase and lowercase letters.',
  '8': 'Your password must include at least one number.',
  '9': 'Your password must include at least one special character (e.g., !@#$%^&*()).',
  password_requirements:
    'Password must be 8+ chars with uppercase, lowercase, number, and special character (!@#$%^&*)',
  '11': 'The email address is not in a valid format.',
  auth: 'Authentication failed. Please try again or contact support if the issue persists.',
  default: 'An unexpected error occurred.',
  captcha_required: 'Please complete the captcha verification.',
  ratelimit_default: 'Too many attempts. Please try again later.',
  '14': 'Too many signup attempts. Please try again later.',
};

const messageTypes: Record<string, 'error' | 'success' | 'warning'> = {
  '1': 'error',
  '2': 'success',
  '5': 'error',
  '6': 'error',
  '7': 'error',
  '8': 'error',
  '9': 'error',
  password_requirements: 'error',
  '11': 'error',
  '14': 'warning',
  auth: 'error',
  default: 'error',
  captcha_required: 'error',
  ratelimit_default: 'warning',
};

export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  let errorMessage = params.message
    ? errorMessages[params.message] || errorMessages.default
    : null;
  const messageType = params.message
    ? messageTypes[params.message] || 'error'
    : 'error';

  if (
    params.message?.startsWith('For security purposes, you can only request')
  ) {
    errorMessage = errorMessages.ratelimit_default;
  }

  const checkAuth = async () => {
    'use server';

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return redirect(`/c`);
    }
  };

  await checkAuth();

  const signUp = async (formData: FormData) => {
    'use server';

    const supabase = await createClient();
    const headersList = await headers();
    const origin = headersList.get('origin');
    const email = formData.get('email') as string;
    const ip = headersList.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const captchaToken = formData.get('cf-turnstile-response') as string;

    if (!captchaToken) {
      return redirect(`/signup?message=captcha_required`);
    }

    if (process.env.RATELIMITER_ENABLED?.toLowerCase() !== 'false') {
      const { success } = await checkAuthRateLimit(email, ip, 'signup');
      if (!success) return redirect('/signup?message=14');
    }

    const password = formData.get('password') as string;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return redirect(`/signup?message=11`);
    }

    if (!password) {
      return redirect(`/signup?message=5`);
    }

    const passwordChecks = [
      { test: password.length >= 8, message: '6' },
      { test: /[A-Z]/.test(password) && /[a-z]/.test(password), message: '7' },
      { test: /[0-9]/.test(password), message: '8' },
      {
        test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(password),
        message: '9',
      },
    ];

    const failedChecks = passwordChecks.filter((check) => !check.test);
    if (failedChecks.length > 0) {
      return redirect(`/signup?message=password_requirements`);
    }

    let emailDomainWhitelist: string[] = [];
    let emailWhitelist: string[] = [];

    if (process.env.EMAIL_DOMAIN_WHITELIST || process.env.EDGE_CONFIG) {
      const patternsString =
        process.env.EMAIL_DOMAIN_WHITELIST ||
        (await get<string>('EMAIL_DOMAIN_WHITELIST'));
      emailDomainWhitelist = patternsString?.split(',') ?? [];
    }

    if (process.env.EMAIL_WHITELIST || process.env.EDGE_CONFIG) {
      const patternsString =
        process.env.EMAIL_WHITELIST || (await get<string>('EMAIL_WHITELIST'));
      emailWhitelist = patternsString?.split(',') ?? [];
    }

    if (
      (emailDomainWhitelist.length > 0 &&
        !emailDomainWhitelist.includes(email.split('@')[1])) ||
      (emailWhitelist.length > 0 && !emailWhitelist.includes(email))
    ) {
      return redirect(`/signup?message=1`);
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      return redirect(`/signup?message=${error.message}`);
    }

    return redirect('/signup?message=2');
  };

  const handleSignInWithGoogle = async () => {
    'use server';

    const supabase = await createClient();
    const headersList = await headers();
    const origin = headersList.get('origin');

    const { error, data } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=/signup`,
      },
    });

    if (error) {
      return redirect(`/signup?message=auth`);
    }

    return redirect(data.url);
  };

  const handleSignInWithMicrosoft = async () => {
    'use server';

    const supabase = await createClient();
    const headersList = await headers();
    const origin = headersList.get('origin');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${origin}/auth/callback?next=/signup`,
        scopes: 'email',
      },
    });

    if (error) {
      return redirect(`/signup?message=auth`);
    }

    return redirect(data.url);
  };

  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-2 px-8 sm:max-w-md">
      <SignUpForm
        onSignUp={signUp}
        onGoogleSignIn={handleSignInWithGoogle}
        onMicrosoftSignIn={handleSignInWithMicrosoft}
        errorMessage={errorMessage}
        messageType={messageType}
      />
    </div>
  );
}
