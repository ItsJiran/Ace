import type { ReactNode } from "react";
import { GripHorizontal, Minus, X } from "lucide-react";
import type { AceWindowRenderProps } from "#/hooks/useAceWindow";

type AceWindowHeadProps = {
  title?: string;
  icon?: ReactNode;
  isFocused: boolean;
  dragHandleProps: AceWindowRenderProps["dragHandleProps"];
  onClose: () => void;
  onMinimize?: () => void;
};

export function AceWindowHead({
  title,
  icon,
  isFocused,
  dragHandleProps,
  onClose,
  onMinimize,
}: AceWindowHeadProps) {
  const buttonClass = "flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-white hover:bg-white/10";
  const stopDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      {...dragHandleProps}
      className={[
        "flex items-center justify-between px-3 py-2 border-b bg-white/5 cursor-grab active:cursor-grabbing",
        isFocused ? "border-white/10" : "border-white/5",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={isFocused ? "text-zinc-300" : "text-zinc-500"}>
          {icon ?? <GripHorizontal size={14} />}
        </span>
        <span
          className={[
            "truncate text-[10px] uppercase font-bold tracking-widest",
            isFocused ? "text-zinc-400" : "text-zinc-600",
          ].join(" ")}
        >
          {title || "Window"}
        </span>
      </div>

      <div className="flex items-center gap-1 pl-2">
        {onMinimize ? (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={onMinimize}
            className={buttonClass}
            aria-label="Minimize window"
          >
            <Minus size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={onClose}
          className={buttonClass}
          aria-label="Close window"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
