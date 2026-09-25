import {
  Adb,
  AdbDaemonTransport,
  AdbSignatureAuthenticator,
  AdbPublicKeyAuthenticator,
  type AdbCredentialStore,
} from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { CustomAdbCredentialStore } from "./customCredentialStore";
import { BrowserAdbClient } from "../lib/adbClient";

export { CustomAdbCredentialStore };
export { BrowserAdbClient };

/**
 * Creates the wrapped credential store supporting pre-authorized adbkey
 */
export function getWrappedCredentialStore(): AdbCredentialStore {
  // Create the default web credential store
  const defaultStore = new AdbWebCredentialStore();

  // Wrap it with CustomAdbCredentialStore to support pre-authorized adbkey
  const credentialStore = new CustomAdbCredentialStore(defaultStore);

  return credentialStore;
}

/**
 * Authenticates via WebUSB transport with CustomAdbCredentialStore
 */
export async function authenticateAdb(transport: AdbDaemonTransport, customStore?: AdbCredentialStore): Promise<Adb> {
  const defaultStore = new AdbWebCredentialStore();
  const credentialStore = customStore || new CustomAdbCredentialStore(defaultStore);

  return new Adb(transport);
}

export default BrowserAdbClient;
