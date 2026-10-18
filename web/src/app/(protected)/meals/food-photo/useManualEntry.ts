import { useState } from "react";

// Manual-entry fields. Owned by the analyzer (not the form) so values survive the
// form unmounting on Cancel, exactly as before the split.
export function useManualEntry() {
  const [label, setLabel] = useState("");
  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  function reset() {
    setLabel("");
    setCal("");
    setProtein("");
    setCarbs("");
    setFat("");
  }

  return {
    label,
    setLabel,
    cal,
    setCal,
    protein,
    setProtein,
    carbs,
    setCarbs,
    fat,
    setFat,
    reset,
  };
}

export type ManualEntry = ReturnType<typeof useManualEntry>;
