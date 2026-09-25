import { useState, useEffect, useCallback, useRef } from "react";
import {
  Adb,
  type AdbCredentialStore,
} from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import {
  AdbDaemonWebUsbDevice,
} from "@yume-chan/adb-daemon-webusb";
import { CustomAdbCredentialStore } from "@/services/customCredentialStore";
import { BrowserAdbClient, type DeviceProfile } from "@/lib/adbClient";

export interface UseAdbReturn {
  client: BrowserAdbClient;
  adb: Adb | null;
  device: DeviceProfile | null;
  connecting: boolean;
  isConnected: boolean;
  error: string | null;
  connect: (targetDevice?: AdbDaemonWebUsbDevice) => Promise<DeviceProfile | void>;
  disconnect: () => Promise<void>;
  credentialStore: CustomAdbCredentialStore;
}

/**
 * React hook for managing WebUSB ADB connection with CustomAdbCredentialStore
 * wrapping AdbWebCredentialStore for persistent key support and broken screen recovery.
 */
export function useAdb(): UseAdbReturn {
  const clientRef = useRef<BrowserAdbClient>(new BrowserAdbClient());
  const [adb, setAdb] = useState<Adb | null>(null);
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize default AdbWebCredentialStore wrapped with CustomAdbCredentialStore
  const defaultStoreRef = useRef(new AdbWebCredentialStore("android-control-unified"));
  const credentialStoreRef = useRef(new CustomAdbCredentialStore(defaultStoreRef.current));

  useEffect(() => {
    const client = clientRef.current;
    const unsubDisconnect = client.onDisconnect(() => {
      setAdb(null);
      setDevice(null);
    });

    return () => {
      unsubDisconnect();
    };
  }, []);

  const connect = useCallback(async (targetDevice?: any) => {
    setConnecting(true);
    setError(null);
    try {
      const validTarget =
        targetDevice && typeof targetDevice.connect === "function" ? targetDevice : undefined;
      const profile = await clientRef.current.connect(validTarget);
      setDevice(profile);
      setAdb(clientRef.current.rawAdb);
      return profile;
    } catch (err: any) {
      const msg = err?.message || "Failed to connect to Android device via WebUSB";
      setError(msg);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await clientRef.current.disconnect();
      setAdb(null);
      setDevice(null);
    } catch (err: any) {
      console.error("Disconnect error:", err);
    }
  }, []);

  return {
    client: clientRef.current,
    adb,
    device,
    connecting,
    isConnected: Boolean(device && adb),
    error,
    connect,
    disconnect,
    credentialStore: credentialStoreRef.current,
  };
}

export default useAdb;
