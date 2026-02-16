"use client";

import { useCallback, useEffect, useState } from "react";

type PermissionName = "geolocation" | "microphone" | "camera";

type PermissionsState = Record<PermissionName, PermissionState>;

const DEFAULT_STATE: PermissionsState = {
  geolocation: "prompt",
  microphone: "prompt",
  camera: "prompt",
};

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsState>(DEFAULT_STATE);

  useEffect(() => {
    if (!("permissions" in navigator)) return;

    const names: PermissionName[] = ["geolocation", "microphone", "camera"];
    const cleanups: (() => void)[] = [];

    names.forEach((name) => {
      navigator.permissions
        .query({ name: name as PermissionName })
        .then((status) => {
          setPermissions((prev) => ({ ...prev, [name]: status.state }));

          const handler = () => {
            setPermissions((prev) => ({ ...prev, [name]: status.state }));
          };

          status.addEventListener("change", handler);
          cleanups.push(() => status.removeEventListener("change", handler));
        })
        .catch(() => {
          // Some browsers don't support querying certain permissions
        });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const requestGeolocation = useCallback(
    () =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      }),
    [],
  );

  const requestMediaPermission = useCallback(
    async (kind: "microphone" | "camera") => {
      const constraints =
        kind === "microphone" ? { audio: true } : { video: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Release tracks immediately — we only wanted to trigger the permission prompt
      stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { permissions, requestGeolocation, requestMediaPermission };
}
