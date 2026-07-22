export type Tab = "send" | "receive" | "nearby" | "settings" | "transfer" | "history";
export type TransferState = "idle" | "transferring" | "complete" | "prompt" | "error";

export type TransferEventPayload = 
  | { type: "Log"; data: { message: string } }
  | { type: "Progress"; data: { filename: string; total: number; current: number } }
  | { type: "Prompt"; data: { message: string } }
  | { type: "Done"; data: { message: string } }
  | { type: "Error"; data: { message: string } }
  | { type: "CodeGenerated"; data: { code: string } }
  | { type: "RelayStatus"; data: { running: boolean; ports: string } };

export interface TransferStats {
  filename: string;
  totalBytes: number;
  currentBytes: number;
  percentage: number;
  speedMbps: number;
  etaSeconds: number;
}
