interface StatusBarProps {
  relayAddr?: string;
  embeddedRelayRunning?: boolean;
  embeddedRelayPorts?: string;
}

export function StatusBar({
  relayAddr = "tyexhare.tyes.dev:9009",
  embeddedRelayRunning = false,
  embeddedRelayPorts,
}: StatusBarProps) {
  return (
    <footer className="w-full border-t-4 border-foreground pt-3 mt-auto flex justify-between items-center font-mono text-xs">
      <div className="flex items-center space-x-6">
        <span className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
          <span className="font-bold">LAN Discovery: Active</span>
        </span>
        <span className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${embeddedRelayRunning ? "bg-primary" : "bg-secondary"}`}></span>
          <span>
            Relay:{" "}
            <strong className="text-foreground">
              {embeddedRelayRunning
                ? embeddedRelayPorts
                  ? `Local Embedded Relay (${embeddedRelayPorts})`
                  : "Local Embedded Relay"
                : relayAddr}
            </strong>
          </span>
        </span>
      </div>
      <div className="text-muted-foreground font-bold">
        SPAKE2 + AES-256-GCM
      </div>
    </footer>
  );
}
