import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { error } = await req.json();

    // Only log errors that are not "Failed to fetch"
    if (error?.message !== 'TypeError: Failed to fetch') {
      console.error(error);
    }

    return new NextResponse('Anonymous Sentinel report sent', {
      status: 200,
    });
  } catch (error: any) {
    console.error('Error processing sentinel request:', error);
  }
}
