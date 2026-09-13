export const COOKIE_NAME = "acc_session";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_COOKIE = "acc_oauth_state";
export const UNAUTHED_ERR_MSG = "Unauthorized";

export const encodeOAuthState = (val: unknown) => JSON.stringify(val);

export const startLogin = () => {
  console.info("Local-first desk mode active; no remote authentication server configured.");
};
