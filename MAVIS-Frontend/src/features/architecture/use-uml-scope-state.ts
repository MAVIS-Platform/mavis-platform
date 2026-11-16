"use client";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Scope changes must take effect during rendering: an effect-only reset lets the
// previous document's overlays/XML render and autosave under the new view ID.
export function useUmlScopeState<T>(scope: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [stored, setStored] = useState({ scope, value: initial });
  const activeScope = useRef(scope);
  const initialValue = useRef(initial);
  activeScope.current = scope;
  initialValue.current = initial;
  if (stored.scope !== scope) setStored({ scope, value: initial });
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      // Ignore late save/fetch callbacks from a document that is no longer open.
      if (activeScope.current !== scope) return;
      setStored((previous) =>
        activeScope.current !== scope
          ? previous
          : {
              scope,
              value:
                typeof next === "function"
                  ? (next as (value: T) => T)(
                      previous.scope === scope ? previous.value : initialValue.current,
                    )
                  : next,
            },
      );
    },
    [scope],
  );
  return [stored.scope === scope ? stored.value : initial, update];
}
