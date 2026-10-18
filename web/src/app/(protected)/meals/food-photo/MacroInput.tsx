import { useEffect, useRef, useState } from "react";
import { fieldLabelStyle, inputStyle } from "./styles";

interface MacroInputProps {
  label: string;
  value: number | null;
  nullable?: boolean;
  integer?: boolean;
  onChange: (v: number | null) => void;
}

// Editable macro input — local text state keeps decimals and empty state
// from fighting the controlled value on external re-estimate updates (#302).
export default function MacroInput({ label, value, nullable, integer, onChange }: MacroInputProps) {
  const [text, setText] = useState<string>(value === null ? "" : String(value));
  const lastExternal = useRef<number | null>(value);

  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);

  function commit(t: string) {
    setText(t);
    if (t === "") {
      const next = nullable ? null : 0;
      lastExternal.current = next;
      onChange(next);
      return;
    }
    const pattern = integer ? /^-?\d*$/ : /^-?\d*\.?\d*$/;
    if (!pattern.test(t)) return;
    const n = integer ? parseInt(t, 10) : parseFloat(t);
    if (!Number.isFinite(n)) return;
    lastExternal.current = n;
    onChange(n);
  }

  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        onChange={(e) => commit(e.target.value)}
        placeholder={nullable ? "—" : "0"}
        style={inputStyle}
      />
    </div>
  );
}
