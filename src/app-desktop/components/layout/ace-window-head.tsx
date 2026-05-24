import type { ReactNode } from "react";
import { GripHorizontal, Minus, X } from "lucide-react";
import type { AceWindowRenderProps } from "#/app-desktop/hooks/use-ace-window";
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

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
  const { targets } = useAceTheme();

  const stopDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      {...dragHandleProps}
      className={[
        'ace-shell-head',
        isFocused ? "focused" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span>
          {icon ?? <GripHorizontal size={14} />}
        </span>
        <span
          className={[
            "truncate",
          ].join(" ")}
        >
          {title || "Agentic Assistant"}
        </span>
      </div>

      <div className="flex items-center gap-1 pl-2">
        {onMinimize ? (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={onMinimize}
            className={targets.btn.secondary}
            aria-label="Minimize window"
          >
            <Minus size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={onClose}
          className={targets.btn.secondary}
          aria-label="Close window"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
