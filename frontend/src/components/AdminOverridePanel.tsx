// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Admin Override Panel Component
//
// A secure, gated interface for administrators to interact with the contract's
// circuit-breaker override reset function. This panel simulates a multi-sig
// approval workflow:
//
//   1. Admin enters the number of required signatures.
//   2. Clicks "Request Override" to simulate gathering multi-sig approvals.
//   3. On confirmation, the backend receives the override request.
//
// In production:
//   - Signatures would be ECDSA-signed messages from each admin key.
//   - The backend would aggregate signatures and submit the transaction.
//   - This panel would show real-time signature collection status.
//
// This reference implementation focuses on the UI/UX with mock interaction.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ShieldAlert,
  KeyRound,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";

// ===========================================================================
// TYPES
// ===========================================================================

interface OverrideRequest {
  status: "idle" | "confirming" | "pending" | "success" | "error";
  message: string;
  requiredSignatures: number;
  newThreshold?: number;
}

// ===========================================================================
// MOCK SIGNERS (in production: fetched from contract admin struct)
// ===========================================================================

const MOCK_SIGNERS = [
  { address: "0x7aBc...D3F1", label: "Scutum Core", hasSigned: false },
  { address: "0x9DeF...A2B4", label: "Security Council", hasSigned: false },
  { address: "0x3F1a...C8E9", label: "Operations Lead", hasSigned: false },
];

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export function AdminOverridePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState<OverrideRequest>({
    status: "idle",
    message: "",
    requiredSignatures: 2,
  });
  const [signers, setSigners] = useState(MOCK_SIGNERS);
  const [newThreshold, setNewThreshold] = useState<number>(500);

  /**
   * Initiates the override request.
   *
   * In production, this would:
   *   1. Generate the transaction payload.
   *   2. Request signatures from all required signers.
   *   3. Submit when threshold is met.
   */
  const initiateOverride = useCallback(async () => {
    setRequest((prev) => ({
      ...prev,
      status: "confirming",
      message: "Gathering multi-sig approvals...",
    }));

    // Simulate signers approving one by one
    const updatedSigners = [...signers];
    for (let i = 0; i < request.requiredSignatures; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      updatedSigners[i] = { ...updatedSigners[i], hasSigned: true };
      setSigners([...updatedSigners]);
    }

    setRequest({
      status: "pending",
      message: "Submitting transaction to contract...",
      requiredSignatures: request.requiredSignatures,
      newThreshold,
    });

    // Simulate transaction submission
    try {
      const response = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatures: updatedSigners
            .slice(0, request.requiredSignatures)
            .map(() => "0x" + "0".repeat(130)), // Mock ECDSA signatures
          newThreshold: newThreshold !== 500 ? newThreshold : undefined,
          caller: signers[0].address,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRequest({
          status: "success",
          message: data.message || "Circuit breaker override successful.",
          requiredSignatures: request.requiredSignatures,
          newThreshold,
        });
      } else {
        throw new Error("Override rejected by contract");
      }
    } catch (err) {
      setRequest({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Override transaction failed. Please try again.",
        requiredSignatures: request.requiredSignatures,
        newThreshold,
      });
    }
  }, [signers, request.requiredSignatures, newThreshold]);

  /**
   * Resets the panel state for a new override request.
   */
  const resetPanel = useCallback(() => {
    setRequest({
      status: "idle",
      message: "",
      requiredSignatures: 2,
    });
    setSigners(MOCK_SIGNERS.map((s) => ({ ...s, hasSigned: false })));
    setNewThreshold(500);
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetPanel();
      }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* TRIGGER BUTTON */}
      {/* ----------------------------------------------------------------- */}
      <Dialog.Trigger asChild>
        <button
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200",
            "bg-red-600/20 border border-red-500/30 text-red-400",
            "hover:bg-red-600/30 hover:border-red-500/50 hover:text-red-300",
            "focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-surface"
          )}
        >
          <ShieldAlert className="w-4 h-4" />
          Admin Override
        </button>
      </Dialog.Trigger>

      {/* ----------------------------------------------------------------- */}
      {/* DIALOG OVERLAY & CONTENT */}
      {/* ----------------------------------------------------------------- */}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 animate-slide-up">
          <div className="card-glass overflow-hidden">
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-slate-100">
                    Admin Override
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-slate-400 mt-0.5">
                    Reset the circuit breaker lock state
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="text-slate-400 hover:text-slate-200 transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* ---- Body ---- */}
            <div className="px-6 py-5 space-y-5">
              {/* Warning banner */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-300">
                    Security-Sensitive Action
                  </p>
                  <p className="text-amber-400/80 mt-0.5 text-xs">
                    This action requires multi-sig approval. It will unlock the
                    circuit breaker and allow normal price validation to resume.
                  </p>
                </div>
              </div>

              {/* Required signatures selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Required Signatures
                </label>
                <select
                  className="input-field"
                  value={request.requiredSignatures}
                  onChange={(e) =>
                    setRequest((prev) => ({
                      ...prev,
                      requiredSignatures: parseInt(e.target.value, 10),
                    }))
                  }
                  disabled={request.status !== "idle"}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} of 3 signers
                    </option>
                  ))}
                </select>
              </div>

              {/* New threshold (optional) */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Deviation Threshold (bps)
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={newThreshold}
                  onChange={(e) =>
                    setNewThreshold(parseInt(e.target.value, 10) || 500)
                  }
                  disabled={request.status !== "idle"}
                  min={1}
                  max={10000}
                />
                <p className="text-xs text-slate-500">
                  Current: 500 bps (5%). Leave unchanged to keep current threshold.
                </p>
              </div>

              {/* Signer status */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Multi-Sig Signers
                </label>
                <div className="space-y-1.5">
                  {signers.map((signer, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all",
                        signer.hasSigned
                          ? "border-severity-safe/30 bg-severity-safe/5"
                          : "border-white/10 bg-white/[0.02]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-300">
                          {signer.address}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({signer.label})
                        </span>
                      </div>
                      {signer.hasSigned ? (
                        <CheckCircle2 className="w-4 h-4 text-severity-safe" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status message */}
              {request.status !== "idle" && (
                <div
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-lg border text-sm",
                    request.status === "success" &&
                      "bg-severity-safe/10 border-severity-safe/30 text-severity-safe",
                    request.status === "error" &&
                      "bg-red-500/10 border-red-500/30 text-red-400",
                    (request.status === "confirming" ||
                      request.status === "pending") &&
                      "bg-brand-500/10 border-brand-500/30 text-brand-300"
                  )}
                >
                  {request.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                  ) : request.status === "error" ? (
                    <XCircle className="w-5 h-5 shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                  )}
                  <span>{request.message}</span>
                </div>
              )}
            </div>

            {/* ---- Footer ---- */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
              <Dialog.Close asChild>
                <button
                  className="btn-ghost text-sm"
                  onClick={() => request.status === "success" && resetPanel()}
                >
                  {request.status === "success" ? "Done" : "Cancel"}
                </button>
              </Dialog.Close>

              {request.status === "idle" && (
                <button
                  className="btn-danger flex items-center gap-2"
                  onClick={initiateOverride}
                >
                  <Unlock className="w-4 h-4" />
                  Request Override
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {request.status === "error" && (
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={resetPanel}
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
