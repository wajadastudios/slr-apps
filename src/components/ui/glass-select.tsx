"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type OptionData = { value: string; label: ReactNode; disabled?: boolean };

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function extractOptions(children: ReactNode): OptionData[] {
  const options: OptionData[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const props = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    options.push({
      value: props.value !== undefined ? String(props.value) : "",
      label: props.children,
      disabled: props.disabled,
    });
  });
  return options;
}

// Native <select> dropdown panels can't be restyled or animated in any
// cross-browser way, so this renders a fully custom glassmorphism listbox
// on top of a visually-hidden real <select> that mirrors the same value --
// the hidden select is what actually gets submitted in FormData, so every
// existing <GlassSelect name required defaultValue> call site keeps working
// unchanged.
//
// The listbox itself is rendered into a portal on document.body rather
// than inline. GlassCard uses backdrop-blur, which creates a new CSS
// stacking context -- an inline z-50 listbox would only ever rank above
// its own card's other content, not above a *sibling* card later in the
// DOM (e.g. the "Total gaji" summary card below the month/year picker),
// so it would visibly get sliced up by whatever renders after it. A
// portal escapes that entirely.
export function GlassSelect({
  className,
  children,
  defaultValue,
  value,
  onChange,
  name,
  required,
  disabled,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => extractOptions(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() =>
    String((isControlled ? value : defaultValue) ?? "")
  );
  const currentValue = isControlled ? String(value ?? "") : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isControlled) return;
    setInternalValue(String(defaultValue ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Fixed-position coordinates are computed from the trigger's own
  // viewport rect rather than relying on any CSS positioning context, so
  // the menu always lands next to the trigger regardless of how deeply
  // nested it is. Closing on scroll/resize avoids the alternative of
  // tracking scroll to reposition -- simpler and the menu is short-lived.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuMaxHeight = 256 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuMaxHeight && rect.top > spaceBelow;

    setMenuStyle(
      openUpward
        ? {
            bottom: window.innerHeight - rect.top + 8,
            left: rect.left,
            width: rect.width,
          }
        : { top: rect.bottom + 8, left: rect.left, width: rect.width }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const selectedIndex = options.findIndex((o) => o.value === currentValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function commitValue(next: string) {
    if (!isControlled) setInternalValue(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setOpen(true);
    }
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) commitValue(opt.value);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <select
        name={name}
        required={required}
        disabled={disabled}
        value={currentValue}
        onChange={onChange ?? (() => {})}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        {...rest}
      >
        {options.map((o, i) => (
          <option key={i} value={o.value} disabled={o.disabled}>
            {nodeToText(o.label)}
          </option>
        ))}
      </select>

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((v) => !v);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5 text-left text-slate-900",
          "shadow-[0_2px_8px_rgba(23,38,61,0.08)] backdrop-blur-xl outline-none",
          "transition-all duration-300 ease-out focus:border-white/60 focus:bg-white/50",
          open && "border-white/60 bg-white/50",
          disabled && "cursor-not-allowed opacity-60",
          className
        )}
      >
        <span
          className={cn(
            "truncate",
            (!selectedOption || selectedOption.disabled) && "text-slate-500"
          )}
        >
          {selectedOption ? selectedOption.label : options[0]?.label ?? ""}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={cn(
            "h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ease-out",
            open && "rotate-180"
          )}
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <ul
            ref={(el) => {
              listRef.current = el;
              el?.focus();
            }}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            style={{
              position: "fixed",
              top: menuStyle.top,
              bottom: menuStyle.bottom,
              left: menuStyle.left,
              width: menuStyle.width,
            }}
            className="z-[100] max-h-64 overflow-auto rounded-2xl border border-white/40 bg-white/80 p-1.5 shadow-[0_12px_32px_rgba(23,38,61,0.22)] backdrop-blur-2xl outline-none [animation:glass-dropdown_0.16s_ease-out]"
          >
            {options.map((o, i) => (
              <li
                key={i}
                role="option"
                aria-selected={o.value === currentValue}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => !o.disabled && commitValue(o.value)}
                className={cn(
                  "cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-800 transition-colors duration-150",
                  o.disabled && "cursor-not-allowed text-slate-400",
                  !o.disabled && i === activeIndex && "bg-[#35C5D0]/15",
                  o.value === currentValue &&
                    !o.disabled &&
                    "bg-[#35C5D0]/20 font-medium text-[#17263D]"
                )}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
