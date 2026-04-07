"use client";

import { useEffect, useState } from "react";

const KEY = "admin-key";

export function useAdminKey() {
  const [adminKey, setAdminKey] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved) {
      setAdminKey(saved);
    }
  }, []);

  const save = (value: string) => {
    setAdminKey(value);
    window.localStorage.setItem(KEY, value);
  };

  return {
    adminKey,
    save
  };
}
