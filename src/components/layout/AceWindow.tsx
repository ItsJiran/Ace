import React from "react";
import type { ReactNode } from "react";
import { motion, useDragControls } from "framer-motion";
import type { Transition } from "framer-motion";
import type { AceWindowRenderProps } from "#/hooks/useAceWindow";
import { useAceWindow } from "#/hooks/useAceWindow";
import { AceWindowHead } from "#/components/layout/AceWindowHead";

const resizeHandleDefinitions = [
  {
    direction: "n",
    className: "absolute left-3 right-3 top-0 h-2 -translate-y-1/2 cursor-n-resize",
  },
  {
    direction: "e",
    className: "absolute bottom-3 right-0 top-3 w-2 translate-x-1/2 cursor-e-resize",
  },
  {
    direction: "s",
    className: "absolute bottom-0 left-3 right-3 h-2 translate-y-1/2 cursor-s-resize",
  },
  {
    direction: "w",
    className: "absolute bottom-3 left-0 top-3 w-2 -translate-x-1/2 cursor-w-resize",
  },
  {
    direction: "ne",
    className: "absolute right-0 top-0 h-4 w-4 translate-x-1/2 -translate-y-1/2 cursor-ne-resize",
  },
  {
    direction: "nw",
    className: "absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize",
  },
  {
    direction: "se",
    className: "absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-se-resize",
  },
  {
    direction: "sw",
    className: "absolute bottom-0 left-0 h-4 w-4 -translate-x-1/2 translate-y-1/2 cursor-sw-resize",
  },
] as const;

function renderResizeHandles(
  getResizeHandleProps: AceWindowRenderProps["getResizeHandleProps"],
  showCornerGrip: boolean,
) {
  return (
    <>
      {resizeHandleDefinitions.map((handle) => (
        <div
          key={handle.direction}
          {...getResizeHandleProps(handle.direction)}
          className={handle.className}
          data-window-resize-handle={handle.direction}
        />
      ))}
      {showCornerGrip ? (
        <div className="pointer-events-none absolute bottom-0 right-0 h-5 w-5">
          <div className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-sm border-r border-b border-white/30" />
        </div>
      ) : null}
    </>
  );
}

type AceWindowProps = {
  windowUid: string;
  headless?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode | ((props: AceWindowRenderProps) => ReactNode);
};

function AceWindowComponent({
  windowUid,
  headless,
  className,
  style,
  children,
}: AceWindowProps) {
  const aceWindow = useAceWindow(windowUid);
  const dragControls = useDragControls();
  const resolvedConfig = aceWindow?.windowConfig;

  if (!resolvedConfig) return null;

  const {
    beginDrag,
    beginResize,
    animationState,
    close,
    minimize,
    focus,
    isFocused,
    isDragging,
    isResizing,
    isLocked,
    canCapturePointer,
    position,
    size,
    handleDragStart,
    handleDragEnd,
    handlePointerEnter,
    handlePointerLeave,
    ref,
    rootStyle,
    windowConfig,
    windowUid: resolvedWindowUid,
  } = aceWindow;

  const dragHandleProps: AceWindowRenderProps["dragHandleProps"] = {
    onPointerDown: (event) => {
      beginDrag(event, () => dragControls.start(event.nativeEvent, { snapToCursor: false }));
    },
  };

  const renderProps: AceWindowRenderProps = {
    dragHandleProps,
    resizeHandleProps: {
      onPointerDown: (event) => {
        beginResize("se", event);
      },
    },
    getResizeHandleProps: aceWindow.getResizeHandleProps,
    close,
    minimize,
    focus,
    isFocused,
    isDragging,
    isResizing,
    isLocked,
    canCapturePointer,
    windowUid: resolvedWindowUid,
    windowConfig,
  };

  const renderedChildren = typeof children === "function" ? children(renderProps) : children;
  const contentNode = headless ? (
    renderedChildren
  ) : (
    <div
      className={[
        "flex h-full w-full flex-col overflow-hidden rounded-xl transition-colors",
        isDragging ? "bg-zinc-950/95" : "",
        isFocused
          ? "bg-zinc-950/90 shadow-black/50 ring-1 ring-white/10"
          : "bg-zinc-950/70 shadow-black/20 ring-1 ring-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <AceWindowHead
        title={windowConfig?.title}
        dragHandleProps={dragHandleProps}
        isFocused={isFocused}
        onMinimize={minimize}
        onClose={close}
      />
      <div
        className={[
          "relative flex-1 overflow-hidden rounded-b-xl border-x border-b",
          isFocused ? "border-white/10" : "border-white/5",
        ].join(" ")}
      >
        {renderedChildren}
      </div>
    </div>
  );
  const animateProps = {
    x: !isDragging && !isResizing && animationState?.values.x !== undefined ? animationState.values.x : position.x,
    y: !isDragging && !isResizing && animationState?.values.y !== undefined ? animationState.values.y : position.y,
    width: !isResizing && animationState?.values.width !== undefined ? animationState.values.width : size.width,
    height: !isResizing && animationState?.values.height !== undefined ? animationState.values.height : size.height,
    opacity: resolvedConfig.is_minimized ? 0 : animationState?.values.opacity ?? resolvedConfig.opacity ?? 1,
    scale: isDragging ? 1.01 : animationState?.values.scale ?? 1,
  };
  const transitionDuration = (animationState?.transitionMs ?? 140) / 1000;
  const transitionProps: Transition = animationState?.easing === "spring_back"
    ? {
        x: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
        y: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
        width: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
        height: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
        opacity: { duration: transitionDuration },
        scale: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
      }
    : {
        x: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
        y: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
        width: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
        height: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
        opacity: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
        scale: { duration: transitionDuration, ease: animationState?.easing === "linear" ? "linear" : animationState?.easing === "ease_in" ? "easeIn" : animationState?.easing === "ease_out" ? "easeOut" : "easeInOut" },
      };

  return (
    <motion.div
      ref={ref}
      drag
      dragListener={false}
      dragElastic={0}
      dragMomentum={false}
      dragControls={dragControls}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onMouseDown={focus}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={animateProps}
      transition={transitionProps}
      className={[
        "absolute top-0 left-0",
        headless ? "" : "rounded-xl",
        className || "",
        "select-none",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...rootStyle,
        touchAction: "none",
        ...style,
      }}
      data-window-shell="ace-empty"
      data-window-uid={resolvedConfig.window_uid}
    >
      {contentNode}
      {renderResizeHandles(aceWindow.getResizeHandleProps, !headless)}
    </motion.div>
  );
}

// Shallow equality helper for objects
const shallowEqual = (objA: object | undefined, objB: object | undefined) => {
  if (Object.is(objA, objB)) return true;
  if (
    typeof objA !== "object" ||
    objA === null ||
    typeof objB !== "object" ||
    objB === null
  )
    return false;

  const recordA = objA as Record<string, unknown>;
  const recordB = objB as Record<string, unknown>;

  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);

  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(recordB, keysA[i]) ||
      !Object.is(recordA[keysA[i]], recordB[keysA[i]])
    ) {
      return false;
    }
  }
  return true;
};

export const AceWindow = React.memo(AceWindowComponent, (prev, next) => {
  if (prev.children !== next.children) return false;

  return (
    prev.windowUid === next.windowUid &&
    prev.headless === next.headless &&
    prev.className === next.className &&
    shallowEqual(prev.style, next.style)
  );
});
