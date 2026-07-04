import { Button } from '@/components/ui/button';

export default function HomePage(): React.ReactElement {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">GrowthOS</h1>
      <p className="max-w-prose text-muted-foreground">
        Multi-vertical growth analytics platform. This is the bootstrap scaffold — features land
        per the backlog in TASKS.md.
      </p>
      <div className="flex gap-3">
        <Button>Get started</Button>
        <Button variant="outline">View docs</Button>
      </div>
    </main>
  );
}
