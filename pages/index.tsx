import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log('WordPress API URL:', process.env.WORDPRESS_API_URL);
    console.log('App Env:', process.env.NEXT_PUBLIC_APP_ENV);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <h1 className="text-3xl font-bold text-blue-600">
        Fine Diet Platform - Home Page
      </h1>
    </div>
  );
}
