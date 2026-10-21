import Link from "next/link";
export default function NotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link className="mt-4 inline-block text-sm text-primary underline" href="/">
        Return to MAVIS
      </Link>
    </main>
  );
}
