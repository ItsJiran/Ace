import React from "react";
import type { ReactNode } from "react";
import type { WindowConfig } from "#/schemas/window";
import { useAceWindow } from "#/hooks/useAceWindow";

type AceWindowProps = {
  windowUid: string;
  config?: WindowConfig;
  headless?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode | ((props: any) => ReactNode);
};

function AceWindowComponent({
  windowUid,
  config,
  headless,
  className,
  style,
  children,
}: AceWindowProps) {
  void children;

  const window = useAceWindow(windowUid);
  const resolvedConfig = window?.config || config;

  if (!resolvedConfig) return null;
  return (
    <div
      ref={window.ref}
      className={[
        "absolute top-0 left-0",
        headless ? "" : "rounded-xl",
        className || "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...window.rootStyle,
        ...style,
      }}
      data-window-shell="ace-empty"
      data-window-uid={resolvedConfig.window_uid}
    />
  );
}

// Shallow equality helper for objects
const shallowEqual = (objA: any, objB: any) => {
  if (Object.is(objA, objB)) return true;
  if (
    typeof objA !== "object" ||
    objA === null ||
    typeof objB !== "object" ||
    objB === null
  )
    return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i]) ||
      !Object.is(objA[keysA[i]], objB[keysA[i]])
    ) {
      return false;
    }
  }
  return true;
};

export const AceWindow = React.memo(AceWindowComponent, (prev, next) => {
  // 1. If children change, always re-render
  if (prev.children !== next.children) return false;

  // 2. Trust O(1) subscription if uids match and are provided
  if (prev.windowUid && next.windowUid) {
    return prev.windowUid === next.windowUid;
  }

  // 3. Fallback: robust shallow config comparison
  if (!prev.config || !next.config) return false;
  return shallowEqual(prev.config, next.config);
});
