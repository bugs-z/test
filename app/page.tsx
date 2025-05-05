'use client';

import { Brand } from '@/components/ui/brand';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Brand />

      <Link
        className="mt-4 flex w-[200px] items-center justify-center rounded-md bg-blue-500 p-2 font-semibold text-white"
        href="/login"
      >
        Start Chatting
        <ArrowRight className="ml-1" size={20} />
      </Link>
    </div>
  );
}
