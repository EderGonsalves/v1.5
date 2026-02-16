import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <WifiOff className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h1 className="mt-6 text-lg font-semibold text-foreground">
          Sem conexão
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          Verifique sua conexão com a internet e tente novamente.
        </p>
      </div>
    </main>
  );
}
